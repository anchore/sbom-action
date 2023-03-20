import {
  create as createArtifactClient,
  UploadOptions,
} from "@actions/artifact";
import { DownloadHttpClient } from "@actions/artifact/lib/internal/download-http-client";
import * as core from "@actions/core";
import * as github from "@actions/github";
import { GitHub } from "@actions/github/lib/utils";
import * as cache from "@actions/tool-cache";
import { Release } from "@octokit/webhooks-types";
import fs from "fs";
import os from "os";
import path from "path";
import { stringify } from "./Util";

export type GithubRepo = { owner: string; repo: string };

/**
 * Basic release asset information
 */
export interface ReleaseAsset {
  id: number;
  name: string;
}

/**
 * Common interface for methods requiring a release
 */
interface ReleaseProps {
  release: Release;
}

/**
 * Basic artifact interface returned via listWorkflowArtifacts
 */
export interface Artifact {
  // Workflow run artifact will have an ID
  id?: number;
  name: string;
}

/**
 * Basic workflow run information
 */
export interface WorkflowRun {
  id: number;
}

/**
 * This is only a partial definition of the snapshot format, just including the
 * values we need to set from the workflow run
 */
export interface DependencySnapshot {
  job: {
    correlator: string;
    id: string;
  };
  sha: string;
  ref: string;
  detector: {
    version: string;
  };
}

/**
 * Suppress info output by redirecting to debug
 * @param fn function to call for duration of output suppression
 */
async function suppressOutput<T>(fn: () => Promise<T>): Promise<T> {
  const info = core.info;
  try {
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      core.info = core.debug;
    } catch (e) {}
    return await fn();
  } finally {
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      core.info = info;
    } catch (e) {}
  }
}

/**
 * Wraps a string in dashes
 */
export function dashWrap(str: string): string {
  let out = ` ${str} `;
  const width = 80;
  while (out.length < width) {
    out = `-${out}-`;
  }
  if (out.length > width) {
    out = out.substr(0, width);
  }
  return out;
}

/**
 * Attempts to intelligently log all objects passed in when debug is enabled
 */
export function debugLog(label: string, ...args: unknown[]): void {
  if (core.isDebug()) {
    core.group(label, async () => {
      for (const arg of args) {
        if (typeof arg === "string") {
          core.debug(arg);
        } else if (arg instanceof Error) {
          core.debug(arg.message);
          core.debug(stringify(arg.stack));
        } else {
          core.debug(stringify(arg));
        }
      }
    });
  }
}

/**
 * Provides a basic shim to interact with the necessary Github APIs
 */
export class GithubClient {
  client: InstanceType<typeof GitHub>;

  repo: GithubRepo;

  constructor(client: InstanceType<typeof GitHub>, repo: GithubRepo) {
    this.client = client;
    this.repo = repo;
  }

  // --------------- WORKFLOW ARTIFACT METHODS ------------------

  /**
   * Lists the workflow artifacts for the current workflow
   */
  async listWorkflowArtifacts(): Promise<Artifact[]> {
    // The REST listWorkflowRunArtifacts endpoint does not seem to work during
    // the workflow run, presumably the are available afterwards much like the
    // Github UI only shows artifacts after completion of a run, so we have
    // to do a little bit of hackery here. We _could_ download all artifacts
    // using a supported API, but internally it's using this anyway
    const downloadClient = new DownloadHttpClient();
    const response = await downloadClient.listArtifacts();

    debugLog("listWorkflowArtifacts response:", response);

    return response.value;
  }

  /**
   * Downloads a workflow artifact for the current workflow run
   * @param name artifact name
   * @param id specified if using a workflow run artifact
   */
  async downloadWorkflowArtifact({ name, id }: Artifact): Promise<string> {
    if (id) {
      return this.downloadWorkflowRunArtifact({ artifactId: id });
    }
    const client = createArtifactClient();
    const tempPath = fs.mkdtempSync(path.join(os.tmpdir(), "sbom-action-"));
    const response = await suppressOutput(async () =>
      client.downloadArtifact(name, tempPath)
    );

    debugLog(
      "downloadArtifact response:",
      response,
      "dir:",
      core.isDebug() && fs.readdirSync(response.downloadPath)
    );

    return `${response.downloadPath}/${response.artifactName}`;
  }

  /**
   * Uploads a workflow artifact for the current workflow run
   * @param name name of the artifact
   * @param file file to upload
   * @param retention retention days of a artifact
   */
  async uploadWorkflowArtifact({
    name,
    file,
    retention,
  }: {
    name: string;
    file: string;
    retention?: number;
  }): Promise<void> {
    const rootDirectory = path.dirname(file);
    const client = createArtifactClient();

    debugLog(
      "uploadArtifact:",
      name,
      file,
      retention,
      rootDirectory,
      core.isDebug() && fs.readdirSync(rootDirectory)
    );

    const options: UploadOptions = {
      continueOnError: false,
    };
    if (retention) {
      options.retentionDays = retention;
    }

    const info = await suppressOutput(async () =>
      client.uploadArtifact(name, [file], rootDirectory, options)
    );

    debugLog("uploadArtifact response:", info);
  }

  // --------------- COMPLETED WORKFLOW METHODS ------------------

  /**
   * Lists the workflow run artifacts for a completed workflow
   * @param runId the workflow run number
   */
  async listWorkflowRunArtifacts({
    runId,
  }: {
    runId: number;
  }): Promise<(Artifact & { id: number })[]> {
    const response = await this.client.rest.actions.listWorkflowRunArtifacts({
      ...this.repo,
      run_id: runId,
      per_page: 100,
      page: 1,
    });

    debugLog("listWorkflowRunArtifacts response:", response);

    if (response.status >= 400) {
      throw new Error("Unable to retrieve listWorkflowRunArtifacts");
    }

    return response.data.artifacts;
  }

  /**
   * Lists the workflow run artifacts for a completed workflow
   * @param runId the workflow run number
   */
  async findLatestWorkflowRunForBranch({
    branch,
  }: {
    branch: string;
  }): Promise<WorkflowRun | undefined> {
    const response = await this.client.rest.actions.listWorkflowRunsForRepo({
      ...this.repo,
      branch,
      status: "success",
      per_page: 100,
      page: 1,
    });

    debugLog("findLatestWorkflowRunForBranch response:", response);

    if (response.status >= 400) {
      throw new Error("Unable to findLatestWorkflowRunForBranch");
    }

    return response.data.workflow_runs[0];
  }

  /**
   * Downloads the artifact and returns a reference to the file
   * @param artifactId the artifact id to download
   */
  async downloadWorkflowRunArtifact({
    artifactId,
  }: {
    artifactId: number;
  }): Promise<string> {
    const response = await this.client.rest.actions.downloadArtifact({
      ...this.repo,
      artifact_id: artifactId,
      archive_format: "zip",
    });

    debugLog("downloadWorkflowRunArtifact response:", response);

    const artifactZip = await cache.downloadTool(response.url);

    debugLog("downloadTool response:", artifactZip);

    const artifactPath = await cache.extractZip(artifactZip);

    debugLog("extractZip response:", artifactPath);

    for (const file of fs.readdirSync(artifactPath)) {
      const filePath = `${artifactPath}/${file}`;
      if (fs.existsSync(filePath)) {
        return filePath;
      }
    }

    return "";
  }

  // --------------- RELEASE ASSET METHODS ------------------

  /**
   * Uploads a release asset
   * @param release release object
   * @param fileName name of the asset
   * @param contents contents of the asset
   * @param contentType content type of the asset
   */
  async uploadReleaseAsset({
    release,
    assetName,
    contents,
    contentType,
  }: ReleaseProps & {
    assetName: string;
    contents: string;
    contentType?: string;
  }): Promise<void> {
    await this.client.rest.repos.uploadReleaseAsset({
      ...this.repo,
      release_id: release.id,
      url: release.upload_url,
      name: assetName,
      data: contents,
      mediaType: contentType ? { format: contentType } : undefined,
    });
  }

  /**
   * Lists assets for a release
   */
  async listReleaseAssets({ release }: ReleaseProps): Promise<ReleaseAsset[]> {
    const response = await this.client.rest.repos.listReleaseAssets({
      ...this.repo,
      release_id: release.id,
    });
    if (response.status >= 400) {
      throw new Error("Bad response from listReleaseAssets");
    }

    debugLog("listReleaseAssets response:", response);

    return response.data.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Deletes a release asset
   */
  async deleteReleaseAsset({
    asset,
  }: ReleaseProps & {
    asset: ReleaseAsset;
  }): Promise<void> {
    await this.client.rest.repos.deleteReleaseAsset({
      ...this.repo,
      asset_id: asset.id,
    });
  }

  /**
   * Finds a release by tag name
   * @param tag
   */
  async findRelease({ tag }: { tag: string }): Promise<Release | undefined> {
    core.debug(`Getting release by tag: ${tag}`);
    let release: Release | undefined;
    try {
      const response = await this.client.rest.repos.getReleaseByTag({
        ...this.repo,
        tag,
      });

      release = response.data as Release | undefined;
      debugLog(`getReleaseByTag response:`, release);
    } catch (e) {
      debugLog("Error while fetching release by tag name:", e);
    }

    if (!release) {
      core.debug(`No release found for ${tag}, looking for draft release...`);
      release = await this.findDraftRelease({ tag });
    }

    return release;
  }

  /**
   * Finds a draft release by ref
   * @param tag release tag_name to search by
   * @param ref release target_commitish to search by
   */
  async findDraftRelease({
    tag,
  }: {
    tag?: string;
  }): Promise<Release | undefined> {
    debugLog(`Getting draft release by tag: ${tag}`);
    try {
      const response = await this.client.rest.repos.listReleases({
        ...this.repo,
      });

      const release = (response.data as Release[])
        .filter((r) => r.draft)
        .find((r) => r.tag_name === tag);

      debugLog(`listReleases filtered response:`, release);

      return release;
    } catch (e) {
      debugLog("Error while fetching draft release by tag name:", e);
      return undefined;
    }
  }

  // --------------- DEPENDENCY SNAPSHOT METHODS ------------------

  /**
   * Posts a snapshot to the dependency submission api
   * @param snapshot
   */
  async postDependencySnapshot(snapshot: DependencySnapshot) {
    const { repo } = github.context;
    const token = core.getInput("github-token");

    try {
      const response = await this.client.request(
        `POST /repos/${repo.owner}/${repo.repo}/dependency-graph/snapshots`,
        {
          headers: {
            "content-type": "application/json",
            authorization: `token ${token}`,
          },
          data: JSON.stringify(snapshot),
        }
      );

      if (response.status >= 400) {
        core.warning(
          `Dependency snapshot upload failed: ${stringify(response)}`
        );
      } else {
        debugLog(`Dependency snapshot upload successful:`, response);
      }
    } catch (e: any) {
      if ("response" in e) {
        e = e.response;
      }
      core.warning(`Error uploading depdendency snapshot: ${stringify(e)}`);
    }
  }
}

/**
 * Returns a GitHubClient
 * @param repo repository to use
 * @param githubToken authentication token
 */
export function getClient(repo: GithubRepo, githubToken: string): GithubClient {
  // This should be a token with access to your repository scoped in as a secret.
  // The YML workflow will need to set myToken with the GitHub Secret Token
  // github-token: ${{ secrets.GITHUB_TOKEN }}
  // https://help.github.com/en/actions/automating-your-workflow-with-github-actions/authenticating-with-the-github_token#about-the-github_token-secret
  const octokit = github.getOctokit(githubToken, {
    throttle: {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      onRateLimit: (retryAfter, options) => {
        core.warning(
          `Request quota exhausted for request ${options.method} ${options.url}`
        );
        if (options.request.retryCount === 0) {
          // only retries once
          core.info(`Retrying after ${retryAfter} seconds!`);
          return true;
        }
      },
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      onAbuseLimit: (retryAfter, options) => {
        // does not retry, only logs a warning
        core.warning(
          `Abuse detected for request ${options.method} ${options.url}`
        );
      },
    },
  });

  return new GithubClient(octokit, repo);
}
