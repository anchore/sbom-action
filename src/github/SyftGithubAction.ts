import * as fs from "fs";
import * as os from "os";
import path from "path";
import * as exec from "@actions/exec";
import * as cache from "@actions/tool-cache";
import * as core from "@actions/core";
import * as github from "@actions/github";
import { Release, ReleaseEvent } from "@octokit/webhooks-types";
import { SyftOptions } from "../syft/Syft";
import { getClient } from "./GithubClient";
import {
  deleteReleaseAsset,
  listReleaseAssets,
  uploadReleaseAsset,
} from "./Releases";
import {
  listWorkflowArtifacts,
  downloadArtifact,
  uploadArtifact,
} from "./WorkflowArtifacts";

export const SYFT_BINARY_NAME = "syft";
export const SYFT_VERSION = "v0.21.0";

function getFileName(): string {
  const fileName = core.getInput("artifact_name");
  if (fileName) {
    return fileName;
  }

  const { job, action } = github.context;
  const format = getSbomFormat();
  let stepName = `-${action}`;
  if (!action || action === "__self") {
    stepName = "";
  } else if (action.startsWith("__self_")) {
    stepName = `-${action.substr("__self_".length)}`;
  }
  return `sbom-${job}${stepName}.${format}`;
}

/**
 * Gets a reference to the syft command and executes the syft action
 * @param input syft input parameters
 * @param format syft output format
 */
async function executeSyft({ input, format }: SyftOptions): Promise<string> {
  let outStream = "";
  let errStream = "";

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
    const exitCode = await core.group("Syft Output", async () => {
      core.info(`Executing: ${cmd} ${args.join(" ")}`);
      return exec.exec(cmd, args, {
        env,
        listeners: {
          stdout(buffer) {
            outStream += buffer.toString();
          },
          stderr(buffer) {
            errStream += buffer.toString();
          },
          debug(message) {
            core.debug(message);
          },
        },
      });
    });

    if (exitCode > 0) {
      error = new Error("An error occurred running Syft");
    } else {
      core.debug("Syft stderr:");
      core.debug(errStream);

      return outStream;
    }
  } catch (e) {
    error = e;
  }

  core.error(outStream);
  core.error(errStream);
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
async function getSyftCommand(): Promise<string> {
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
  const client = getClient(core.getInput("github_token"));
  const { repo, runId } = github.context;

  const artifacts = await listWorkflowArtifacts({
    client,
    repo,
    run: runId,
  });

  core.debug("Workflow artifacts associated with run:");
  core.debug(JSON.stringify(artifacts));

  // is there a better way to get a reliable unique step number?
  const fileName = getFileName();

  const tempPath = fs.mkdtempSync(path.join(os.tmpdir(), "sbom-action-"));
  const filePath = `${tempPath}/${fileName}`;
  fs.writeFileSync(filePath, contents);

  const outputFile = core.getInput("output_file");
  if (outputFile) {
    fs.copyFileSync(filePath, outputFile);
  }

  await uploadArtifact({
    client,
    repo,
    run: runId,
    file: filePath,
    name: fileName,
  });
}

function getBooleanInput(name: string, defaultValue: boolean): boolean {
  const val = core.getInput(name);
  if (val === "") {
    return defaultValue;
  }
  return Boolean(val);
}

export async function runSyftAction(): Promise<void> {
  try {
    const start = new Date();
    core.debug(`-------------------------------------------------------------`);
    core.debug(`Running SBOM action: ${start.toTimeString()}`);
    core.debug(`Got github context:`);
    core.debug(JSON.stringify(github.context));

    const doUpload = getBooleanInput("upload_artifact", true);
    const outputVariable = core.getInput("output_var");

    const output = await executeSyft({
      input: {
        path: core.getInput("path"),
        image: core.getInput("image"),
      },
      format: getSbomFormat(),
    });
    core.debug(
      `SBOM action completed in: ${
        (new Date().getMilliseconds() - start.getMilliseconds()) / 1000
      }s`
    );
    core.debug(`-------------------------------------------------------------`);

    if (output) {
      if (doUpload) {
        await uploadSbomArtifact(output);
      }

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
  } catch (e: unknown) {
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

    const client = getClient(core.getInput("github_token"));
    const { eventName, ref, payload, repo, runId } = github.context;

    const artifacts = await listWorkflowArtifacts({
      client,
      repo,
      run: runId,
    });

    core.debug("Workflow artifacts associated with run:");
    core.debug(JSON.stringify(artifacts));

    let release: Release | undefined = undefined;

    // FIXME: what's the right way to detect a release?
    if (eventName === "release") {
      release = (payload as ReleaseEvent).release;
      core.debug(`Got RELEASE object:`);
      core.debug(JSON.stringify(release));
    } else {
      const isRefPush = eventName === "push" && /^refs\/tags\/.*/.test(ref);
      if (isRefPush) {
        const tag = ref.replace(/^refs\/tags\//, "");
        core.info(`Getting release by tag: ${tag}`);

        const response = await client.rest.repos.getReleaseByTag({
          ...repo,
          tag,
        });
        release = response.data as Release;
      }
    }

    if (release) {
      // ^sbom.*\\.${format}$`;
      const sbomArtifactInput = core.getInput("sbom_artifact_match");
      const sbomArtifactPattern = sbomArtifactInput || `^${getFileName()}$`;
      const matcher = new RegExp(sbomArtifactPattern);

      core.info(`Attaching SBOMs to release ${release.tag_name}`);
      for (const artifact of artifacts) {
        core.debug(`Found artifact: ${artifact.name}`);
        if (matcher.test(artifact.name)) {
          core.info(`Found SBOM artifact: ${artifact.name}`);
          const file = await downloadArtifact({
            client,
            name: artifact.name,
          });
          core.debug(`Got SBOM file: ${JSON.stringify(file)}`);
          const contents = fs.readFileSync(file);
          const fileName = path.basename(file);

          try {
            const assets = await listReleaseAssets({
              client,
              repo,
              release,
            });

            const asset = assets.find((a) => a.name === fileName);
            if (asset) {
              await deleteReleaseAsset({
                client,
                repo,
                release,
                asset,
              });
            }

            await uploadReleaseAsset({
              client,
              repo,
              release,
              fileName,
              contents: contents.toString(),
              // label: "sbom",
              contentType: "text/plain",
            });
          } catch (e) {
            core.warning(`Unable to upload asset: ${artifact.name}`);
            core.warning(`${e}`);
          }
        }
      }
    }
  } catch (e: unknown) {
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
