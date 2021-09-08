import * as core from "@actions/core";
import { Release } from "@octokit/webhooks-types";
import { GithubClientProp, GithubRepo } from "./GithubClient";

export type ReleaseProps = GithubClientProp & {
  repo: GithubRepo;
  release: Release;
};

export type UploadReleaseAssetProps = ReleaseProps & {
  fileName: string;
  contents: string;
  label?: string;
  contentType?: string;
};

export async function uploadReleaseAsset({
  client,
  repo,
  release,
  fileName,
  contents,
  label,
  contentType,
}: UploadReleaseAssetProps): Promise<void> {
  await client.rest.repos.uploadReleaseAsset({
    ...repo,
    release_id: release.id,
    url: release.upload_url,
    name: fileName,
    data: contents,
    label,
    mediaType: contentType ? { format: contentType } : undefined,
  });
}

export type ListReleaseAssetProps = ReleaseProps & {};

export interface ReleaseAsset {
  id: number;
  name: string;
}

export async function listReleaseAssets({
  client,
  repo,
  release,
}: ListReleaseAssetProps): Promise<ReleaseAsset[]> {
  const response = await client.rest.repos.listReleaseAssets({
    ...repo,
    release_id: release.id,
  });
  if (response.status >= 400) {
    throw new Error("Bad response from listReleaseAssets");
  }

  core.debug("--------------------- listReleaseAssets ---------------------- ");
  core.debug(JSON.stringify(response));

  return response.data.sort((a, b) => a.name.localeCompare(b.name));
}

export type RenameReleaseAssetByNameProps = ReleaseProps & {
  fileName: string;
  newFileName: string;
};

export async function renameReleaseAssetByName({
  client,
  repo,
  release,
  fileName,
  newFileName,
}: RenameReleaseAssetByNameProps): Promise<void> {
  const assets = await listReleaseAssets({ client, repo, release });
  for (const asset of assets) {
    if (asset.name === fileName) {
      await renameReleaseAsset({
        client,
        repo,
        release,
        asset,
        newName: newFileName,
      });
    }
  }
}

export type RenameReleaseAssetProps = ReleaseProps & {
  asset: ReleaseAsset;
  newName: string;
};

export async function renameReleaseAsset({
  client,
  repo,
  asset,
  newName,
}: RenameReleaseAssetProps): Promise<void> {
  await client.rest.repos.updateReleaseAsset({
    ...repo,
    asset_id: asset.id,
    name: newName,
  });
}

export type DeleteReleaseAssetProps = ReleaseProps & {
  asset: ReleaseAsset;
};

export async function deleteReleaseAsset({
  client,
  repo,
  asset,
}: DeleteReleaseAssetProps): Promise<void> {
  await client.rest.repos.deleteReleaseAsset({
    ...repo,
    asset_id: asset.id,
  });
}
