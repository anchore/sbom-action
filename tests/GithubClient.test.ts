import test, { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert";
import { getMocks } from "./mocks";

const { data, mocks, setData, restoreInitialData } = getMocks(test);

for (const [name, factory] of Object.entries(mocks)) {
  const exports = factory() as object;
  mock.module(name, { namedExports: exports, defaultExport: exports });
}

mock.method(Date, "now", () => 1482363367071);

import type { Release } from "@octokit/webhooks-types";

const githubClient = await import("../src/github/GithubClient");
const { debugLog } = githubClient;

describe("Github Client", { timeout: 30000 }, () => {
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

    assert.strictEqual(assets.length, startLength + 1);

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

    assert.strictEqual(assets.length, startLength);
  });

  it("calls workflow run for branch methods", async () => {
    setData({
      workflowRuns: [
        {
          id: 3,
          head_branch: "main",
          conclusion: "success",
        },
      ],
    });
    const client = githubClient.getClient(
      { owner: "test-owner", repo: "test-repo" },
      "token"
    );
    const run: any = await client.findLatestWorkflowRunForBranch({
      branch: "main",
    });
    assert.strictEqual(run.id, 3);
  });

  it("calls findRelease methods", async () => {
    setData({
      releases: [
        {
          id: 2,
          tag_name: "main",
        },
      ],
    });
    const client = githubClient.getClient(
      { owner: "test-owner", repo: "test-repo" },
      "token"
    );
    const r: any = await client.findRelease({
      tag: "main",
    });
    assert.strictEqual(r.id, 2);
  });

  it("calls findDraftRelease methods", async () => {
    setData({
      releases: [
        {
          id: 1,
          tag_name: "main",
          draft: false,
        },
        {
          id: 2,
          tag_name: "main",
          draft: true,
        },
      ],
    });
    const client = githubClient.getClient(
      { owner: "test-owner", repo: "test-repo" },
      "token"
    );
    const r: any = await client.findDraftRelease({
      tag: "main",
    });
    assert.strictEqual(r.id, 2);
  });

  it("calls artifact methods", async () => {
    setData({
      artifacts: [
        {
          runId: 1,
          id: 34534,
        },
        {
          runId: 2,
          id: 34534,
        },
      ],
    });

    const client = githubClient.getClient(
      { owner: "test-owner", repo: "test-repo" },
      "token"
    );

    let artifacts = await client.listCurrentWorkflowArtifacts();

    assert.strictEqual(artifacts.length, 0);

    await client.uploadWorkflowArtifact({
      name: "test",
      file: "file",
    });

    artifacts = await client.listWorkflowRunArtifacts({
      runId: 1,
    });

    assert.strictEqual(artifacts.length, 1);

    let artifact = await client.downloadWorkflowArtifact({
      name: "test",
    });

    assert.notStrictEqual(artifact, undefined);

    artifact = await client.downloadWorkflowRunArtifact({
      artifactId: 1,
    });

    assert.notStrictEqual(artifact, undefined);
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
        runId: 1,
      });
      assert.strictEqual("exception thrown", undefined);
    } catch (e) {
      assert.notStrictEqual(e, undefined);
    }

    try {
      await client.findLatestWorkflowRunForBranch({
        branch: "main",
      });
      assert.strictEqual("exception thrown", undefined);
    } catch (e) {
      assert.notStrictEqual(e, undefined);
    }

    try {
      await client.listReleaseAssets({
        release: {
          id: 2134,
        } as any,
      });
      assert.strictEqual("exception thrown", undefined);
    } catch (e) {
      assert.notStrictEqual(e, undefined);
    }
  });

  it("debugLog works", () => {
    setData({
      debug: {
        enabled: true,
        log: [],
      },
    });

    debugLog("the_label", "string");

    assert.strictEqual(data.debug.log.length, 1);
    assert.strictEqual(data.debug.log[0], "string");
  });

  it("finds a draft release", async () => {
    setData({
      releases: [
        {
          id: 1234,
          draft: false,
        },
        {
          id: 5432,
          draft: true,
          tag_name: "v9",
        },
      ],
    });

    const client = githubClient.getClient(
      { owner: "test-owner", repo: "test-repo" },
      "token"
    );

    const release: any = await client.findRelease({ tag: "v9" });

    assert.strictEqual(release.id, 5432);
    assert.ok(release.draft);
  });
});
