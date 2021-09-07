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
    baseUrl: release.upload_url,
    name: fileName,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    data: Buffer.from(contents),
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

  core.info("---------------------- listReleaseAssets ---------------------- ");
  core.info(JSON.stringify(response));

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
      renameReleaseAsset({
        client,
        repo,
        release,
        assetId: asset.id,
        newName: newFileName,
      });
    }
  }
}

export type RenameReleaseAssetProps = ReleaseProps & {
  assetId: number;
  newName: string;
};

export async function renameReleaseAsset({
  client,
  repo,
  assetId,
  newName,
}: RenameReleaseAssetProps): Promise<void> {
  client.rest.repos.updateReleaseAsset({
    ...repo,
    asset_id: assetId,
    name: newName,
  });
}
