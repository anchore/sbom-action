import * as fs from "fs";
import path from "path";
import os from "os";
import * as artifact from "@actions/artifact";
import * as core from "@actions/core";
import { GithubClientProp, GithubRepo, suppressOutput } from "./GithubClient";
import { DownloadHttpClient } from "@actions/artifact/lib/internal/download-http-client";

export type WorkflowArtifactProps = GithubClientProp & {
  repo: GithubRepo;
  run: number;
};

export interface Artifact {
  // id: number;
  // node_id: string;
  name: string;
  // size_in_bytes: number;
  // url: string;
  // archive_download_url: string;
  // expired: boolean;
  // created_at: string | null;
  // expires_at: string | null;
  // updated_at: string | null;
}

export async function listWorkflowArtifacts({
  client,
  repo,
  run,
}: WorkflowArtifactProps): Promise<Artifact[]> {
  const useInternalClient = true;
  if (useInternalClient) {
    const downloadClient = new DownloadHttpClient();
    const response = await downloadClient.listArtifacts();

    core.debug("--------------------- listArtifacts -------------------");
    core.debug(JSON.stringify(response));

    return response.value;
  }

  const response = await client.rest.actions.listWorkflowRunArtifacts({
    ...repo,
    run_id: run,
    per_page: 100,
    page: 1,
  });

  core.debug("------------------ listWorkflowRunArtifacts ------------------ ");
  core.debug(JSON.stringify(response));

  if (response.status >= 400) {
    throw new Error("Unable to retrieve listWorkflowRunArtifacts");
  }

  return response.data.artifacts;
}

export type DownloadArtifactProps = GithubClientProp & {
  name: string;
};

export async function downloadArtifact({
  name,
}: DownloadArtifactProps): Promise<string> {
  const client = artifact.create();
  const tempPath = fs.mkdtempSync(path.join(os.tmpdir(), "sbom-action-"));
  const response = await suppressOutput(async () =>
    client.downloadArtifact(name, tempPath)
  );

  core.debug("----------------------- Artifact Download ---------------------");
  core.debug(`${response.artifactName}  //// ${response.downloadPath}`);
  core.debug(
    `Dir contains: ${JSON.stringify(fs.readdirSync(response.downloadPath))}`
  );

  return `${response.downloadPath}/${response.artifactName}`;
}

export type UploadArtifactProps = WorkflowArtifactProps & {
  name: string;
  file: string;
};

export async function uploadArtifact({
  name,
  file,
}: UploadArtifactProps): Promise<void> {
  const rootDirectory = path.dirname(file);
  const client = artifact.create();
  core.info(`Uploading artifact: ${file}`);

  core.debug("------------------------- Artifact Upload ---------------------");
  core.debug(`${name} //// ${file}  //// ${rootDirectory}`);

  core.debug(`Dir contains: ${JSON.stringify(fs.readdirSync(rootDirectory))}`);
  const info = await suppressOutput(async () =>
    client.uploadArtifact(name, [file], rootDirectory, {})
  );

  core.debug("------------------------- Artifact Upload ---------------------");
  core.debug(JSON.stringify(info));
}
