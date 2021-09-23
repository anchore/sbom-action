import {context, getMocks} from "./mocks";
const { data, setData, restoreInitialData, mocks } = getMocks();
const {
  artifacts,
  assets,
  inputs,
  latestRun,
} = data;
for (const mock of Object.keys(mocks)) {
  jest.mock(mock, mocks[mock]);
}

jest.mock("../src/github/GithubClient", () => {
  const client: GithubClient = {
    listWorkflowArtifacts() {
      return Promise.resolve(artifacts);
    },
    uploadWorkflowArtifact({ name, file }) {
      artifacts.push({
        id: artifacts.length,
        name,
        file,
      } as never);
      return Promise.resolve();
    },
    repo: {
      owner: "test-org",
      repo: "test-repo",
    },
    listWorkflowRunArtifacts() {
      return Promise.resolve(artifacts);
    },
    findRelease() {
      return Promise.resolve(data.releases[0]);
    },
    findDraftRelease() {
      return Promise.resolve({
        ...data.releases[0],
        draft: true,
        target_commitish: "main",
        tag_name: "v3.6.1",
      });
    },
    findLatestWorkflowRunForBranch() {
      return Promise.resolve(latestRun);
    },
    deleteReleaseAsset({ asset }) {
      const idx = artifacts.findIndex((a: any) => a.id === asset.id);
      artifacts.splice(idx, 1);
      return Promise.resolve();
    },
    downloadWorkflowArtifact({ name }) {
      const f = artifacts.find((a: any) => a.name === name);
      return Promise.resolve(f && f.file || "");
    },
    downloadWorkflowRunArtifact() {
      return Promise.resolve("downloaded-artifact-path");
    },
    listReleaseAssets() {
      return Promise.resolve(assets);
    },
    uploadReleaseAsset({ assetName }) {
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
    dashWrap() {
      // ignore
    },
    debugInspect() {
      // ignore
    },
  };
});

import {
  ReleaseAsset,
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
    restoreInitialData();
  });

  it("runs with default inputs on push", async () => {
    setData({
      inputs: {
        path: ".",
      },
      context: {
        ...context.push({
          ref: "main",
        }),
        job: "default-import-job",
        action: "__anchore_sbom-action",
      },
    });

    const artifactLength = artifacts.length;
    const assetLength = assets.length;

    await action.runSyftAction();
    await action.attachReleaseAssets();

    expect(artifacts.length).toBe(artifactLength + 1);
    expect(assets.length).toBe(assetLength);
  });

  it("runs with release uploads inputs", async () => {
    setData({
      inputs: {
        image: "org/img",
        "upload-artifact": "true",
        "output-file": `${fs.mkdtempSync(
        path.join(os.tmpdir(), "sbom-action-")
      )}/sbom.spdx`,
        "upload-release-assets": "true",
      },
      context: context.release({
        release: {
          id: 4095345,
          name: "v3.5.6",
        },
      }),
    });

    const artifactLength = artifacts.length;
    const assetLength = assets.length;

    await action.runSyftAction();

    expect(fs.existsSync(inputs["output-file"])).toBeTruthy();

    await action.attachReleaseAssets();

    expect(artifacts.length).toBe(artifactLength + 1);
    expect(assets.length).toBe(assetLength + 1);
  });

  it("runs without uploading anything", async () => {
    setData({
      inputs: {
        image: "org/img",
        "upload-artifact": "false",
        "upload-release-assets": "false",
      },
      context: context.release({
        release: {
          id: 4095345,
          name: "v3.5.6",
        },
      }),
    });

    const artifactLength = artifacts.length;
    const assetLength = assets.length;

    await action.runSyftAction();

    await action.attachReleaseAssets();

    expect(artifacts.length).toBe(artifactLength);
    expect(assets.length).toBe(assetLength);
  });

  it("runs pull-request compare", async () => {
    setData({
      inputs:{
        image: "org/img",
        "compare-pulls": "true",
      },
      context: context.pull_request({
        pull_request: {
          base: {
            ref: "asdf",
          },
        },
      }),
    });

    const artifactLength = artifacts.length;

    await action.runSyftAction();

    expect(artifacts.length).toBe(artifactLength + 1);
  });

  it("fails build with runAndFailBuildOnException", async () => {
    try {
      await runAndFailBuildOnException(() => {
        return Promise.reject("fail");
      });
      expect(data.failed.message).toBeDefined();
    } catch (e) {
      expect("should not throw exception").toBeUndefined();
    }
  });

  it("does not include docker scheme by default", async () => {
    setData({
      inputs:{
        image: "somewhere/org/img",
      }
    });

    await action.runSyftAction();

    const { cmd, args, env } = data.execArgs;

    expect(cmd).toBe("syft");
    expect(args).toContain("somewhere/org/img");
    expect(env.SYFT_REGISTRY_AUTH_USERNAME).toBeFalsy();
    expect(env.SYFT_REGISTRY_AUTH_PASSWORD).toBeFalsy();
  });

  it("uses registry scheme with username and password", async () => {
    setData({
      inputs:{
        image: "somewhere/org/img",
        "registry-username": "mr_awesome",
        "registry-password": "super_secret",
      },
    });

    await action.runSyftAction();

    const { cmd, args, env } = data.execArgs;

    expect(cmd).toBe("syft");
    expect(args).toContain("registry:somewhere/org/img");
    expect(env.SYFT_REGISTRY_AUTH_USERNAME).toBe("mr_awesome");
    expect(env.SYFT_REGISTRY_AUTH_PASSWORD).toBe("super_secret");
  });
});
