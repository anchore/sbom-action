import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as github from "@actions/github";
import * as cache from "@actions/tool-cache";
import {
  PullRequestEvent,
  Release,
  ReleaseEvent,
} from "@octokit/webhooks-types";
import * as fs from "fs";
import * as os from "os";
import path from "path";
import stream from "stream";
import { SyftOptions } from "../Syft";
import { dashWrap, getClient } from "./GithubClient";

export const SYFT_BINARY_NAME = "syft";
export const SYFT_VERSION = "v0.21.0";

const PRIOR_ARTIFACT_ENV_VAR = "ANCHORE_SBOM_ACTION_PRIOR_ARTIFACT";

/**
 * Tries to get a unique artifact name or otherwise as appropriate as possible
 */
function getArtifactName(): string {
  const fileName = core.getInput("artifact_name");

  // if there is an explicit filename just return it, this could cause issues
  // where earlier sboms are overwritten by later ones
  if (fileName) {
    return fileName;
  }

  const { job, action } = github.context;
  // when run without an id, we get various auto-generated names, like:
  // __self __self_2 __anchore_sbom-action  __anchore_sbom-action_2 etc.
  // so just keep the number at the end if there is one, otherwise
  // this will not match an id unless for some reason it starts with __
  let stepName = action.replace(/__[-_a-z]+/, "");
  if (stepName) {
    stepName = `-${stepName}`;
  }
  const format = getSbomFormat();
  return `sbom-${job}${stepName}.${format}`;
}

/**
 * Gets a reference to the syft command and executes the syft action
 * @param input syft input parameters
 * @param format syft output format
 */
async function executeSyft({ input, format }: SyftOptions): Promise<string> {
  let stdout = "";
  let stderr = "";

  const cmd = await getSyftCommand();

  const env: { [key: string]: string } = {
    SYFT_CHECK_FOR_APP_UPDATE: "false",
  };

  // https://github.com/anchore/syft#configuration
  let args = ["packages"];

  if ("image" in input && input.image) {
    args = [...args, `docker:${input.image}`];
  } else if ("path" in input && input.path) {
    args = [...args, `dir:${input.path}`];
  } else {
    throw new Error("Invalid input, no image or path specified");
  }

  args = [...args, "-o", format];

  let error: unknown;
  try {
    // Execute in a group so the syft output is collapsed in the GitHub log
    core.info(`[command]${cmd} ${args.join(" ")}`);

    // Need to implement this /dev/null writable stream so the entire contents
    // of the SBOM is not written to the GitHub action log. the listener below
    // will actually capture the output
    const outStream = new stream.Writable({
      write(buffer, encoding, next) {
        next();
      },
    });

    const exitCode = await exec.exec(cmd, args, {
      env,
      outStream,
      listeners: {
        stdout(buffer) {
          stdout += buffer.toString();
        },
        stderr(buffer) {
          stderr += buffer.toString();
        },
        debug(message) {
          core.debug(message);
        },
      },
    });

    if (exitCode > 0) {
      error = new Error("An error occurred running Syft");
    } else {
      return stdout;
    }
  } catch (e) {
    error = e;
  }

  core.error(stdout);
  core.error(stderr);
  throw error;
}

/**
 * Downloads the appropriate Syft binary for the platform
 */
export async function downloadSyft(): Promise<string> {
  const name = SYFT_BINARY_NAME;
  const version = SYFT_VERSION;

  const url = `https://raw.githubusercontent.com/anchore/${name}/main/install.sh`;

  core.debug(`Installing ${name} ${version}`);

  // Download the installer, and run
  const installPath = await cache.downloadTool(url);

  // Make sure the tool's executable bit is set
  await exec.exec(`chmod +x ${installPath}`);

  const cmd = `${installPath} -b ${installPath}_${name} ${version}`;
  await exec.exec(cmd);

  return `${installPath}_${name}/${name}`;
}

/**
 * Gets the Syft command to run via exec
 */
export async function getSyftCommand(): Promise<string> {
  const name = SYFT_BINARY_NAME;
  const version = SYFT_VERSION;

  let syftBinary = cache.find(name, version);
  if (!syftBinary) {
    // Not found; download and install it
    syftBinary = await downloadSyft();

    // Cache the downloaded file
    syftBinary = await cache.cacheFile(syftBinary, name, name, version);
  }

  // Add tool to path for this and future actions to use
  core.addPath(syftBinary);
  return name;
}

/**
 * Returns the SBOM format as specified by the user, defaults to SPDX
 */
export function getSbomFormat(): SyftOptions["format"] {
  return (core.getInput("format") as SyftOptions["format"]) || "spdx";
}

/**
 * Uploads a SBOM as a workflow artifact
 * @param contents SBOM file contents
 */
export async function uploadSbomArtifact(contents: string): Promise<void> {
  const { repo } = github.context;
  const client = getClient(repo, core.getInput("github_token"));

  const fileName = getArtifactName();

  const tempPath = fs.mkdtempSync(path.join(os.tmpdir(), "sbom-action-"));
  const filePath = `${tempPath}/${fileName}`;
  fs.writeFileSync(filePath, contents);

  const outputFile = core.getInput("output_file");
  if (outputFile) {
    fs.copyFileSync(filePath, outputFile);
  }

  core.info(dashWrap(`Uploading workflow artifacts`));
  core.info(`Artifact: ${filePath}`);

  await client.uploadWorkflowArtifact({
    file: filePath,
    name: fileName,
  });
}

/**
 * Gets a boolean input value if supplied, otherwise returns the default
 * @param name name of the input
 * @param defaultValue default value to return if not set
 */
function getBooleanInput(name: string, defaultValue: boolean): boolean {
  const val = core.getInput(name);
  if (val === "") {
    return defaultValue;
  }
  return Boolean(val);
}

export async function runSyftAction(): Promise<void> {
  try {
    core.info(dashWrap(`Running SBOM Action`));

    core.debug(`Got github context:`);
    core.debug(JSON.stringify(github.context));

    const start = Date.now();

    const doUpload = getBooleanInput("upload_artifact", true);
    const comparePulls = getBooleanInput("compare_pulls", false);
    const outputVariable = core.getInput("output_var");

    const output = await executeSyft({
      input: {
        path: core.getInput("path"),
        image: core.getInput("image"),
      },
      format: getSbomFormat(),
    });

    core.info(`SBOM scan completed in: ${(Date.now() - start) / 1000}s`);
    core.debug(`-------------------------------------------------------------`);

    if (output) {
      const { eventName, payload, repo } = github.context;
      if (comparePulls && eventName === "pull_request") {
        const client = getClient(repo, core.getInput("github_token"));

        const pr = (payload as PullRequestEvent).pull_request;
        const branchWorkflow = await client.findLatestWorkflowRunForBranch({
          branch: pr.base.ref,
        });

        core.debug("Got branchWorkflow");
        core.debug(JSON.stringify(branchWorkflow));

        if (branchWorkflow) {
          const baseBranchArtifacts = await client.listWorkflowRunArtifacts({
            runId: branchWorkflow.id,
          });

          core.debug("Got baseBranchArtifacts");
          core.debug(JSON.stringify(baseBranchArtifacts));

          for (const artifact of baseBranchArtifacts) {
            if (artifact.name === getArtifactName()) {
              const baseArtifact = await client.downloadWorkflowRunArtifact({
                artifactId: artifact.id,
              });

              core.info(
                `Downloaded SBOM from ${pr.base.ref} to ${baseArtifact}`
              );
            }
          }
        }
      }

      const priorArtifact = process.env[PRIOR_ARTIFACT_ENV_VAR];
      if (priorArtifact) {
        core.info(`Prior artifact: ${priorArtifact}`);
      }

      if (doUpload) {
        await uploadSbomArtifact(output);
      }

      core.exportVariable(PRIOR_ARTIFACT_ENV_VAR, getArtifactName());

      if (outputVariable) {
        // need to escape multiline strings a specific way:
        // https://github.community/t/set-output-truncates-multiline-strings/16852/5
        const content = output
          .replace("%", "%25")
          .replace("\n", "%0A")
          .replace("\r", "%0D");
        core.setOutput(outputVariable, content);
      }
    } else {
      core.error(JSON.stringify(output));
    }
  } catch (e) {
    if (e instanceof Error) {
      core.setFailed(e.message);
    } else if (e instanceof Object) {
      core.setFailed(JSON.stringify(e));
    } else {
      core.setFailed(`An unknown error occurred: ${e}`);
    }
    throw e;
  }
}

/**
 * Attaches the SBOM assets to a release if run in release mode
 */
export async function attachReleaseArtifacts(): Promise<void> {
  const doRelease = getBooleanInput("upload_release_assets", true);

  if (!doRelease) {
    return;
  }

  try {
    const start = new Date();

    core.debug(`-------------------------------------------------------------`);
    core.debug(`Running POST SBOM action: ${start.toTimeString()}`);
    core.debug(`Got github context:`);
    core.debug(JSON.stringify(github.context));

    const { eventName, ref, payload, repo } = github.context;
    const client = getClient(repo, core.getInput("github_token"));

    let release: Release | undefined = undefined;

    // FIXME: what's the right way to detect a release?
    if (eventName === "release") {
      release = (payload as ReleaseEvent).release;
      core.debug(dashWrap("releaseEvent"));
      core.debug(JSON.stringify(release));
    } else {
      const isRefPush = eventName === "push" && /^refs\/tags\/.*/.test(ref);
      if (isRefPush) {
        const tag = ref.replace(/^refs\/tags\//, "");
        release = await client.findRelease({ tag });
      }
    }

    if (release) {
      // ^sbom.*\\.${format}$`;
      const sbomArtifactInput = core.getInput("sbom_artifact_match");
      const sbomArtifactPattern = sbomArtifactInput || `^${getArtifactName()}$`;
      const matcher = new RegExp(sbomArtifactPattern);

      const artifacts = await client.listWorkflowArtifacts();
      const matched = artifacts.filter((a) => {
        const matches = matcher.test(a.name);
        if (matches) {
          core.debug(`Found artifact: ${a.name}`);
        } else {
          core.debug(`Artifact: ${a.name} not matching ${sbomArtifactPattern}`);
        }
        return matches;
      });

      core.info(dashWrap(`Attaching SBOMs to release ${release.tag_name}`));
      for (const artifact of matched) {
        const file = await client.downloadWorkflowArtifact({
          name: artifact.name,
        });

        core.info(`SBOM: ${file}`);
        const contents = fs.readFileSync(file);
        const fileName = path.basename(file);

        try {
          const assets = await client.listReleaseAssets({
            release,
          });

          const asset = assets.find((a) => a.name === fileName);
          if (asset) {
            await client.deleteReleaseAsset({
              release,
              asset,
            });
          }

          await client.uploadReleaseAsset({
            release,
            fileName,
            contents: contents.toString(),
            contentType: "text/plain",
          });
        } catch (e) {
          core.warning(`Unable to upload asset: ${artifact.name}`);
          core.warning(`${e}`);
        }
      }
    }
  } catch (e) {
    if (e instanceof Error) {
      core.setFailed(e.message);
    } else if (e instanceof Object) {
      core.setFailed(JSON.stringify(e));
    } else {
      core.setFailed(`An unknown error occurred: ${e}`);
    }
    throw e;
  }
}
