import { getMocks } from "./mocks"
const { data, mocks, setData, restoreInitialData } = getMocks();
for (const mock of Object.keys(mocks)) {
  jest.mock(mock, mocks[mock]);
}

import { Release } from "@octokit/webhooks-types";
import * as githubClient from "../src/github/GithubClient";
import { debugLog } from "../src/github/GithubClient";

jest.setTimeout(30000);
Date.now = jest.fn(() => 1482363367071);

describe("Github Client", () => {
  beforeEach(() => {
    restoreInitialData();
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
    setData({
      workflowRuns: [{
        id: 3,
        head_branch: "main",
        conclusion: "success"
      }],
    });
    const client = githubClient.getClient(
      { owner: "test-owner", repo: "test-repo" },
      "token"
    );
    const run: any = await client.findLatestWorkflowRunForBranch({
      branch: "main",
    });
    expect(run.id).toBe(3);
  });

  it("calls findRelease methods", async () => {
    setData({
      releases: [{
        id: 2,
        tag_name: "main"
      }],
    })
    const client = githubClient.getClient(
      { owner: "test-owner", repo: "test-repo" },
      "token"
    );
    const r: any = await client.findRelease({
      tag: "main",
    });
    expect(r.id).toBe(2);
  });

  it("calls findDraftRelease methods", async () => {
    setData({
      releases: [{
        id: 1,
        tag_name: "main",
        draft: false
      },{
        id: 2,
        tag_name: "main",
        draft: true
      }],
    })
    const client = githubClient.getClient(
      { owner: "test-owner", repo: "test-repo" },
      "token"
    );
    const r: any = await client.findDraftRelease({
      tag: "main",
    });
    expect(r.id).toBe(2);
  });

  it("calls artifact methods", async () => {
    setData({
      artifacts: [{
        runId: 1,
        id: 34534,
      },{
        runId: 2,
        id: 34534,
      }]
    });

    const client = githubClient.getClient(
      { owner: "test-owner", repo: "test-repo" },
      "token"
    );

    let artifacts = await client.listCurrentWorkflowArtifacts();

    expect(artifacts.length).toBe(0);

    await client.uploadWorkflowArtifact({
      name: "test",
      file: "file",
    });

    artifacts = await client.listWorkflowRunArtifacts({
      runId: 1,
    });

    expect(artifacts.length).toBe(1);

    let artifact = await client.downloadWorkflowArtifact({
      name: "test",
    });

    expect(artifact).toBeDefined();

    artifact = await client.downloadWorkflowRunArtifact({
      artifactId: 1,
    });

    expect(artifact).toBeDefined();
  });

  it("fails when return status is error", async () => {
    setData({
      returnStatus: {
        status: 500,
      },
    });
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

  it("debugLog works", () => {
    setData({
      debug: {
        enabled: true,
        log: [],
      }
    });

    debugLog("the_label", "string");

    expect(data.debug.log.length).toBe(1);
    expect(data.debug.log[0]).toBe("string");
  });

  it("finds a draft release", async () => {
    setData({
      releases: [{
        id: 1234,
        draft: false,
      }, {
        id: 5432,
        draft: true,
        tag_name: "v9"
      }]
    });

    const client = githubClient.getClient(
      { owner: "test-owner", repo: "test-repo" },
      "token"
    );

    const release: any = await client.findRelease({ tag: "v9" });

    expect(release.id).toBe(5432);
    expect(release.draft).toBeTruthy();
  });
});
