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
import { dashWrap, debugLog, getClient } from "./GithubClient";

export const SYFT_BINARY_NAME = "syft";
export const SYFT_VERSION = "v0.21.0";

const PRIOR_ARTIFACT_ENV_VAR = "ANCHORE_SBOM_ACTION_PRIOR_ARTIFACT";

/**
 * Tries to get a unique artifact name or otherwise as appropriate as possible
 */
function getArtifactName(): string {
  const fileName = core.getInput("artifact-name");

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
  let extension: string = format;
  switch (format) {
    case "spdx-json":
      extension = "spdx.json";
      break;
    case "json":
      extension = "syft.json";
      break;
  }
  return `sbom-${job}${stepName}.${extension}`;
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

  // Execute in a group so the syft output is collapsed in the GitHub log
  core.info(`[command]${cmd} ${args.join(" ")}`);

  // This /dev/null writable stream is required so the entire contents
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
    core.debug(stdout);
    core.error(stderr);
    throw new Error("An error occurred running Syft");
  } else {
    return stdout;
  }
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

  let syftPath = cache.find(name, version);
  if (!syftPath) {
    // Not found; download and install it; returns a path to the binary
    syftPath = await downloadSyft();

    // Cache the downloaded file
    syftPath = await cache.cacheFile(syftPath, name, name, version);
  }

  core.debug(`Got Syft path: ${syftPath} binary at: ${syftPath}/${name}`);

  // Add tool to path for this and future actions to use
  core.addPath(syftPath);
  return name;
}

/**
 * Returns the SBOM format as specified by the user, defaults to SPDX
 */
export function getSbomFormat(): SyftOptions["format"] {
  return (core.getInput("format") as SyftOptions["format"]) || "spdx-json";
}

/**
 * Uploads a SBOM as a workflow artifact
 * @param contents SBOM file contents
 */
export async function uploadSbomArtifact(contents: string): Promise<void> {
  const { repo } = github.context;
  const client = getClient(repo, core.getInput("github-token"));

  const fileName = getArtifactName();

  const tempPath = fs.mkdtempSync(path.join(os.tmpdir(), "sbom-action-"));
  const filePath = `${tempPath}/${fileName}`;
  fs.writeFileSync(filePath, contents);

  const outputFile = core.getInput("output-file");
  if (outputFile) {
    fs.copyFileSync(filePath, outputFile);
  }

  core.info(dashWrap("Uploading workflow artifacts"));
  core.info(filePath);

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
  if (val === undefined || val === "") {
    return defaultValue;
  }
  return val.toLowerCase() === "true";
}

/**
 * Optionally fetches the target SBOM in order to provide some information
 * on changes
 */
async function comparePullRequestTargetArtifact(): Promise<void> {
  const doCompare = getBooleanInput("compare-pulls", false);
  const { eventName, payload, repo } = github.context;
  if (doCompare && eventName === "pull_request") {
    const client = getClient(repo, core.getInput("github-token"));

    const pr = (payload as PullRequestEvent).pull_request;
    const branchWorkflow = await client.findLatestWorkflowRunForBranch({
      branch: pr.base.ref,
    });

    debugLog("Got branchWorkflow:", branchWorkflow);

    if (branchWorkflow) {
      const baseBranchArtifacts = await client.listWorkflowRunArtifacts({
        runId: branchWorkflow.id,
      });

      debugLog("Got baseBranchArtifacts:", baseBranchArtifacts);

      for (const artifact of baseBranchArtifacts) {
        if (artifact.name === getArtifactName()) {
          const baseArtifact = await client.downloadWorkflowRunArtifact({
            artifactId: artifact.id,
          });

          core.info(
            `Downloaded SBOM from ref '${pr.base.ref}' to ${baseArtifact}`
          );
        }
      }
    }
  }
}

export async function runSyftAction(): Promise<void> {
  core.info(dashWrap("Running SBOM Action"));

  debugLog(`Got github context:`, github.context);

  const start = Date.now();

  const doUpload = getBooleanInput("upload-artifact", true);

  const output = await executeSyft({
    input: {
      path: core.getInput("path"),
      image: core.getInput("image"),
    },
    format: getSbomFormat(),
  });

  core.info(`SBOM scan completed in: ${(Date.now() - start) / 1000}s`);

  if (output) {
    await comparePullRequestTargetArtifact();

    // We may want to develop a supply chain during the build, this is one
    // potential way to do so:
    const priorArtifact = process.env[PRIOR_ARTIFACT_ENV_VAR];
    if (priorArtifact) {
      core.debug(`Prior artifact: ${priorArtifact}`);
    }

    if (doUpload) {
      await uploadSbomArtifact(output);

      core.exportVariable(PRIOR_ARTIFACT_ENV_VAR, getArtifactName());
    }
  } else {
    throw new Error(`No Syft output: ${JSON.stringify(output)}`);
  }
}

/**
 * Attaches the SBOM assets to a release if run in release mode
 */
export async function attachReleaseAssets(): Promise<void> {
  const doRelease = getBooleanInput("upload-release-assets", true);

  if (!doRelease) {
    return;
  }

  debugLog("Got github context:", github.context);

  const { eventName, ref, payload, repo } = github.context;
  const client = getClient(repo, core.getInput("github-token"));

  let release: Release | undefined = undefined;

  // FIXME: what's the right way to detect a release?
  if (eventName === "release") {
    release = (payload as ReleaseEvent).release;
    debugLog("Got releaseEvent:", release);
  } else {
    const isRefPush = eventName === "push" && /^refs\/tags\/.*/.test(ref);
    if (isRefPush) {
      const tag = ref.replace(/^refs\/tags\//, "");
      release = await client.findRelease({ tag });
    }
  }

  if (release) {
    // ^sbom.*\\.${format}$`;
    const sbomArtifactInput = core.getInput("sbom-artifact-match");
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

    core.info(dashWrap(`Attaching SBOMs to release: '${release.tag_name}'`));
    for (const artifact of matched) {
      const file = await client.downloadWorkflowArtifact({
        name: artifact.name,
      });

      core.info(file);
      const contents = fs.readFileSync(file);
      const assetName = path.basename(file);

      const assets = await client.listReleaseAssets({
        release,
      });

      const asset = assets.find((a) => a.name === assetName);
      if (asset) {
        await client.deleteReleaseAsset({
          release,
          asset,
        });
      }

      await client.uploadReleaseAsset({
        release,
        assetName,
        contents: contents.toString(),
        contentType: "text/plain",
      });
    }
  }
}

/**
 * Executes the provided callback and wraps any exceptions in a build failure
 */
export async function runAndFailBuildOnException<T>(
  fn: () => Promise<T>
): Promise<T | void> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Error) {
      core.setFailed(e.message);
    } else if (e instanceof Object) {
      core.setFailed(JSON.stringify(e));
    } else {
      core.setFailed(`An unknown error occurred: ${e}`);
    }
  }
}
