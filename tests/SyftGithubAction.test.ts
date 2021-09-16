import {
  artifacts,
  assets,
  inputs,
  latestRun,
  mocks,
  outputs,
  release,
  setContext,
  setInputs,
  // @ts-ignore
} from "./mocks";
for (const mock of Object.keys(mocks)) {
  jest.mock(mock, mocks[mock]);
}

jest.mock("../src/github/GithubClient", () => {
  const client: GithubClient = {
    listWorkflowArtifacts() {
      return Promise.resolve(artifacts);
    },
    uploadWorkflowArtifact({ name, file }) {
      const artifact = fs.readFileSync(file).toString();
      artifacts.push({
        id: artifacts.length,
        name,
        file,
      });
      return Promise.resolve();
    },
    repo: {
      owner: "test-org",
      repo: "test-repo",
    },
    listWorkflowRunArtifacts() {
      return Promise.resolve(artifacts);
    },
    findRelease({ tag }) {
      return Promise.resolve(release);
    },
    findLatestWorkflowRunForBranch({ branch }) {
      return Promise.resolve(latestRun);
    },
    deleteReleaseAsset({ asset }) {
      const idx = artifacts.findIndex((a: any) => a.id === asset.id);
      artifacts.splice(idx, 1);
      return Promise.resolve();
    },
    downloadWorkflowArtifact({ name }) {
      const f = artifacts.find((a: any) => a.name === name);
      return Promise.resolve(f && f.file);
    },
    downloadWorkflowRunArtifact({ artifactId }) {
      return Promise.resolve("downloaded-artifact-path");
    },
    listReleaseAssets({ release }) {
      return Promise.resolve(assets);
    },
    uploadReleaseAsset({ release, assetName, contents, contentType }) {
      assets.push({
        name: assetName,
      } as ReleaseAsset);
      return Promise.resolve();
    },
    client: undefined as any,
  };

  return {
    getClient() {
      return client;
    },
    dashWrap() {},
    debugLog() {},
  };
});

import {
  PullRequestEvent,
  PushEvent,
  ReleaseAsset,
  ReleaseEvent,
} from "@octokit/webhooks-types";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { GithubClient } from "../src/github/GithubClient";
import * as action from "../src/github/SyftGithubAction";
import { runAndFailBuildOnException } from "../src/github/SyftGithubAction";

jest.setTimeout(30000);
Date.now = jest.fn(() => 1482363367071);

describe("Action", () => {
  beforeEach(() => {
    artifacts.splice(0, artifacts.length);
    assets.splice(0, assets.length);
  });
  it("runs with default inputs", async () => {
    setInputs({
      path: ".",
      "github-token": "asdf",
      "upload-artifact": "true",
    });
    setContext({
      eventName: "release",
      ref: "v0.0.0",
      payload: {
        ref: "v45435",
      } as PushEvent,
      repo: {
        owner: "test-org",
        repo: "test-repo",
      },
      runId: 1,
      job: "a_job",
      action: "__self",
    } as any);

    const artifactLength = artifacts.length;
    const assetLength = assets.length;

    await action.runSyftAction();

    expect(artifacts.length).toBe(artifactLength + 1);
    expect(assets.length).toBe(assetLength);
    // expect(outputs).toBe("download-tool-path_syft/syft");
  });

  it("runs with release uploads inputs", async () => {
    setInputs({
      image: "org/img",
      "github-token": "asdf",
      "upload-artifact": "true",
      "output-var": "my-output",
      "output-file": `${fs.mkdtempSync(
        path.join(os.tmpdir(), "sbom-action-")
      )}/sbom.spdx`,
      "upload-release-assets": "true",
    });
    setContext({
      eventName: "release",
      ref: "v0.0.0",
      payload: {
        release: {
          id: 4095345,
          name: "v3.5.6",
        },
      } as ReleaseEvent,
      repo: {
        owner: "test-org",
        repo: "test-repo",
      },
      runId: 1,
      job: "a_job",
      action: "__self",
    } as any);

    const artifactLength = artifacts.length;
    const assetLength = assets.length;

    await action.runSyftAction();

    expect(fs.existsSync(inputs["output-file"])).toBeTruthy();
    expect(outputs["my-output"]).toBeDefined();

    await action.attachReleaseAssets();

    expect(artifacts.length).toBe(artifactLength + 1);
    expect(assets.length).toBe(assetLength + 1);
    // expect(path).toBe("download-tool-path_syft/syft");
  });

  it("runs pull-request compare", async () => {
    setInputs({
      image: "org/img",
      "github-token": "asdf",
      "compare-pulls": "true",
    });
    setContext({
      eventName: "pull_request",
      ref: "v0.0.0",
      payload: {
        pull_request: {
          base: {
            ref: "asdf",
          },
        },
      } as PullRequestEvent,
      repo: {
        owner: "test-org",
        repo: "test-repo",
      },
      runId: 1,
      job: "pr_job_job",
      action: "__self",
    } as any);

    const artifactLength = artifacts.length;

    await action.runSyftAction();

    expect(artifacts.length).toBe(artifactLength + 1);
  });

  it("fails build with runAndFailBuildOnException", async () => {
    try {
      await runAndFailBuildOnException(() => {
        return Promise.reject("fail");
      });
      expect(outputs["@actions/core/setFailed"]).toBeDefined();
    } catch (e) {
      expect("should not throw exception").toBeUndefined();
    }
  });
});
