import * as artifact from "@actions/artifact";
import { GithubClientProp, GithubRepo } from "./GithubClient";
import * as core from "@actions/core";

export type WorkflowArtifactProps = GithubClientProp & {
  repo: GithubRepo;
  run: number;
};

export interface Artifact {
  id: number;
  node_id: string;
  name: string;
  size_in_bytes: number;
  url: string;
  archive_download_url: string;
  expired: boolean;
  created_at: string | null;
  expires_at: string | null;
  updated_at: string | null;
}

export async function listWorkflowArtifacts({
  client,
  repo,
  run,
}: WorkflowArtifactProps): Promise<Artifact[]> {
  const response = await client.rest.actions.listWorkflowRunArtifacts({
    ...repo,
    run_id: run,
    per_page: 100,
    page: 1,
  });

  core.info("------------------ listWorkflowRunArtifacts ------------------ ");
  core.info(JSON.stringify(response));

  if (response.status >= 400) {
    throw new Error("Unable to retrieve listWorkflowRunArtifacts");
  }

  return response.data.artifacts;
}

export type UploadArtifactProps = WorkflowArtifactProps & {
  name: string;
  file: string;
  rootDirectory: string;
};

export async function uploadArtifact({
  name,
  file,
  rootDirectory,
}: UploadArtifactProps): Promise<void> {
  const client = artifact.create();
  const info = await client.uploadArtifact(name, [file], rootDirectory, {});
  core.info("-------------------------------- Artifact Upload --------------");
  core.info(JSON.stringify(info));
}
