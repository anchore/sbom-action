import { create as createArtifactClient } from "@actions/artifact";
import { DownloadHttpClient } from "@actions/artifact/lib/internal/download-http-client";
import * as core from "@actions/core";
import * as github from "@actions/github";
import { GitHub } from "@actions/github/lib/utils";
import * as cache from "@actions/tool-cache";
import { Release } from "@octokit/webhooks-types";
import fs from "fs";
import os from "os";
import path from "path";

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
  name: string;
}

/**
 * Basic workflow run information
 */
export interface WorkflowRun {
  id: number;
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
 * Logs all objects passed in debug outputting strings directly and
 * calling JSON.stringify on other elements
 */
export function debugLog(...args: unknown[]): void {
  if (core.isDebug()) {
    for (const arg of args) {
      if (typeof arg === "string") {
        core.debug(arg);
      } else {
        core.debug(JSON.stringify(arg));
      }
    }
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
   */
  async downloadWorkflowArtifact({ name }: { name: string }): Promise<string> {
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
   */
  async uploadWorkflowArtifact({
    name,
    file,
  }: {
    name: string;
    file: string;
  }): Promise<void> {
    const rootDirectory = path.dirname(file);
    const client = createArtifactClient();

    debugLog(
      "uploadArtifact:",
      name,
      file,
      rootDirectory,
      core.isDebug() && fs.readdirSync(rootDirectory)
    );

    const info = await suppressOutput(async () =>
      client.uploadArtifact(name, [file], rootDirectory, {
        continueOnError: false,
      })
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
    try {
      const response = await this.client.rest.repos.getReleaseByTag({
        ...this.repo,
        tag,
      });
      return response.data as Release;
    } catch (e) {
      debugLog("Error while fetching release by tag name:", e);
      return undefined;
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
