import fs from "fs";
import path from "path";
import os from "os";
import { GitHub } from "@actions/github/lib/utils";
import * as github from "@actions/github";
import * as core from "@actions/core";
import { Release } from "@octokit/webhooks-types";
import { DownloadHttpClient } from "@actions/artifact/lib/internal/download-http-client";
import * as artifact from "@actions/artifact";

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

    core.debug(dashWrap("listWorkflowArtifacts"));
    core.debug(JSON.stringify(response));

    return response.value;
  }

  /**
   * Downloads a workflow artifact for the current workflow run
   * @param name artifact name
   */
  async downloadWorkflowArtifact({ name }: { name: string }): Promise<string> {
    const client = artifact.create();
    const tempPath = fs.mkdtempSync(path.join(os.tmpdir(), "sbom-action-"));
    const response = await suppressOutput(async () =>
      client.downloadArtifact(name, tempPath)
    );

    core.debug(dashWrap("downloadArtifact"));
    core.debug(`${response.artifactName}  //// ${response.downloadPath}`);
    core.debug(
      `Dir contains: ${JSON.stringify(fs.readdirSync(response.downloadPath))}`
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
    const client = artifact.create();

    core.debug(dashWrap("uploadArtifact"));
    core.debug(`Uploading artifact: ${file}`);
    core.debug(`Name: ${name} // file: ${file} // dir: ${rootDirectory}`);
    core.debug(`Dir: ${JSON.stringify(fs.readdirSync(rootDirectory))}`);

    const info = await suppressOutput(async () =>
      client.uploadArtifact(name, [file], rootDirectory, {
        continueOnError: false,
      })
    );

    core.debug("uploadArtifact response:");
    core.debug(JSON.stringify(info));
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
  }): Promise<Artifact[]> {
    const response = await this.client.rest.actions.listWorkflowRunArtifacts({
      ...this.repo,
      run_id: runId,
      per_page: 100,
      page: 1,
    });

    core.debug(dashWrap("listWorkflowRunArtifacts"));
    core.debug(JSON.stringify(response));

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
  }): Promise<WorkflowRun> {
    const response = await this.client.rest.actions.listWorkflowRunsForRepo({
      ...this.repo,
      branch,
      status: "success",
      per_page: 2,
      page: 1,
    });

    core.debug(dashWrap("findLatestWorkflowRunForBranch"));
    core.debug(JSON.stringify(response));

    if (response.status >= 400) {
      throw new Error("Unable to retrieve listWorkflowRunArtifacts");
    }

    return response.data.workflow_runs[0];
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
    fileName,
    contents,
    contentType,
  }: ReleaseProps & {
    fileName: string;
    contents: string;
    contentType?: string;
  }): Promise<void> {
    await this.client.rest.repos.uploadReleaseAsset({
      ...this.repo,
      release_id: release.id,
      url: release.upload_url,
      name: fileName,
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

    core.debug(dashWrap("listReleaseAssets"));
    core.debug(JSON.stringify(response));

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
      core.debug("Error while fetching release by tag name:");
      core.debug(JSON.stringify(e));
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
  // myToken: ${{ secrets.GITHUB_TOKEN }}
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

/**
 * Suppress info output by redirecting to debug
 * @param fn function to call for duration of output suppression
 */
async function suppressOutput<T>(fn: () => Promise<T>): Promise<T> {
  const info = core.info;
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    core.info = core.debug;
    return await fn();
  } finally {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    core.info = info;
  }
}

/**
 * Wraps a string in dashes
 */
export function dashWrap(str: string): string {
  return `---------------------- ${str} ----------------------`;
}
