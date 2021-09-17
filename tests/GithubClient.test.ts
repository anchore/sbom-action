// @ts-ignore
import { getMocks } from "./mocks"
const { data, mocks, setReturnStatus } = getMocks();
const { release, workflowRun } = data;
for (const mock of Object.keys(mocks)) {
  jest.mock(mock, mocks[mock]);
}

import { Release } from "@octokit/webhooks-types";
import * as githubClient from "../src/github/GithubClient";

jest.setTimeout(30000);
Date.now = jest.fn(() => 1482363367071);

describe("Github Client", () => {
  beforeEach(() => {
    setReturnStatus(200);
  });

  it("calls release asset methods", async () => {
    const client = githubClient.getClient(
      { owner: "test-owner", repo: "test-repo" },
      "token"
    );
    let assets = await client.listReleaseAssets({
      release: {
        id: 1234,
      } as any,
    });

    const startLength = assets.length;

    await client.uploadReleaseAsset({
      release: {
        id: 1234,
        upload_url: "http://",
      } as Release,
      contents: "data",
      assetName: "test",
    });

    assets = await client.listReleaseAssets({
      release: {
        id: 1234,
      } as Release,
    });

    expect(assets.length).toBe(startLength + 1);

    await client.deleteReleaseAsset({
      release: {
        id: 1324,
      } as any,
      asset: {
        id: assets.length - 1,
        name: "test",
      },
    });

    assets = await client.listReleaseAssets({
      release: {
        id: 1234,
      } as Release,
    });

    expect(assets.length).toBe(startLength);
  });

  it("calls workflow run for branch methods", async () => {
    const client = githubClient.getClient(
      { owner: "test-owner", repo: "test-repo" },
      "token"
    );
    const run = await client.findLatestWorkflowRunForBranch({
      branch: "main",
    });
    expect(run).toBe(workflowRun);
  });

  it("calls findRelease methods", async () => {
    const client = githubClient.getClient(
      { owner: "test-owner", repo: "test-repo" },
      "token"
    );
    const r = await client.findRelease({
      tag: "main",
    });
    expect(r).toBe(release);
  });

  it("calls artifact methods", async () => {
    const client = githubClient.getClient(
      { owner: "test-owner", repo: "test-repo" },
      "token"
    );
    let artifacts = await client.listWorkflowArtifacts();

    const startLength = artifacts.length;

    await client.uploadWorkflowArtifact({
      name: "test",
      file: "file",
    });

    artifacts = await client.listWorkflowRunArtifacts({
      runId: 1,
    });

    expect(artifacts.length).toBe(startLength + 1);

    let artifact = await client.downloadWorkflowArtifact({
      name: "test",
    });

    expect(artifact).toBeDefined();

    artifact = await client.downloadWorkflowRunArtifact({
      artifactId: startLength,
    });

    expect(artifact).toBeDefined();
  });

  it("fails when return status is error", async () => {
    setReturnStatus(500);
    const client = githubClient.getClient(
      { owner: "test-owner", repo: "test-repo" },
      "token"
    );
    try {
      await client.listWorkflowRunArtifacts({
        runId: 1
      });
      expect("exception thrown").toBeUndefined();
    } catch(e) {
      expect(e).toBeDefined();
    }

    try {
      await client.findLatestWorkflowRunForBranch({
        branch: "main"
      });
      expect("exception thrown").toBeUndefined();
    } catch(e) {
      expect(e).toBeDefined();
    }

    try {
      await client.listReleaseAssets({
        release: {
          id: 2134
        } as any
      });
      expect("exception thrown").toBeUndefined();
    } catch(e) {
      expect(e).toBeDefined();
    }
  });
});
