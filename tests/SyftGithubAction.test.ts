import {context, getMocks} from "./mocks";
const { data, setData, restoreInitialData, mocks } = getMocks();
const {
  artifacts,
  assets,
  inputs,
} = data;
for (const mock of Object.keys(mocks)) {
  jest.mock(mock, mocks[mock]);
}

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as action from "../src/github/SyftGithubAction";
import {
  downloadSyft,
  runAndFailBuildOnException
} from "../src/github/SyftGithubAction";

jest.setTimeout(30000);
Date.now = jest.fn(() => 1482363367071);

describe("Action", () => {
  beforeEach(() => {
    restoreInitialData();
  });

  it("downloads syft", async () => {
    const path = await downloadSyft();
    expect(path).toBe("download-tool_syft/syft")
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

    await action.runSyftAction();
    await action.attachReleaseAssets();

    expect(artifacts.length).toBe(1);
    expect(assets.length).toBe(0);
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

    await action.runSyftAction();

    expect(fs.existsSync(inputs["output-file"])).toBeTruthy();

    await action.attachReleaseAssets();

    expect(artifacts.length).toBe(1);
    expect(assets.length).toBe(1);
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

    await action.runSyftAction();
    await action.attachReleaseAssets();

    expect(artifacts.length).toBe(0);
    expect(assets.length).toBe(0);
  });

  it("runs pull-request compare", async () => {
    setData({
      inputs:{
        image: "org/img",
        "compare-pulls": "true",
        "artifact-name": "sbom.spdx.json"
      },
      context: context.pull_request({
        pull_request: {
          base: {
            ref: "main",
          },
        },
      }),
      workflowRuns: [{
        id: 6,
        head_branch: "main",
        conclusion: "success",
      }],
      artifacts: [{
        runId: 6,
        name: "sbom.spdx.json",
        file: "the_sbom",
      }],
    });

    await action.runSyftAction();

    expect(artifacts.length).toBe(2);
  });

  it("runs in tag workflow", async () => {
    setData({
      inputs:{
        "sbom-artifact-match": ".*.spdx.json$"
      },
      context: {
        ...context.push({}),
        ref: "refs/tags/v34.8451",
      },
      releases: [{
        tag_name: "v34.8451"
      }],
      artifacts: [{
        name: "awesome.spdx.json"
      }],
    });

    await action.attachReleaseAssets();

    expect(assets.length).toBe(1);
  });

  it("runs in tag workflow with draft release", async () => {
    setData({
      inputs:{
        "sbom-artifact-match": ".*.spdx.json$"
      },
      context: {
        ...context.push({}),
        ref: "refs/tags/v34.8451",
      },
      releases: [{
        draft: true,
        tag_name: "v34.8451"
      }],
      artifacts: [{
        name: "awesome.spdx.json"
      }],
    });

    await action.attachReleaseAssets();

    expect(assets.length).toBe(1);
  });

  it("runs in release with prior workflow artifacts", async () => {
    setData({
      inputs:{
        "sbom-artifact-match": ".*.spdx.json$"
      },
      context: {
        ...context.release({
          release: {
            target_commitish: "main"
          }
        }),
        ref: "refs/tags/v34.8451",
      },
      releases: [{
        draft: true,
        tag_name: "v34.8451"
      }],
      artifacts: [{
        runId: 9,
        name: "awesome.spdx.json"
      }],
      workflowRuns: [{
        id: 9,
        head_branch: "main",
        conclusion: "success"
      }]
    });

    await action.attachReleaseAssets();

    expect(assets.length).toBe(1);
  });

  it("fails build with runAndFailBuildOnException", async () => {
    try {
      await runAndFailBuildOnException(async () => {
        throw new Error();
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
