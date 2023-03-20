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
import {mapToWSLPath} from "../src/github/Executor";

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

  it("runs with image input", async () => {
    setData({
      inputs: {
        image: "some-image:latest",
      },
    });

    await action.runSyftAction();

    const { args } = data.execArgs;

    expect(args).toBeDefined()
    expect(args.length > 2).toBeTruthy();
    expect(args[2]).toBe("some-image:latest")
  });

  it("runs with path input", async () => {
    setData({
      inputs: {
        path: "some-path",
      },
    });

    await action.runSyftAction();

    const { args } = data.execArgs;

    expect(args).toBeDefined()
    expect(args.length > 2).toBeTruthy();
    expect(args[2]).toBe("dir:some-path")
  });

  it("runs with file input", async () => {
    setData({
      inputs: {
        file: "some-file.jar",
      },
    });

    await action.runSyftAction();

    const { args } = data.execArgs;

    expect(args).toBeDefined()
    expect(args.length > 2).toBeTruthy();
    expect(args[2]).toBe("file:some-file.jar")
  });

  it("runs with release uploads inputs", async () => {
    const outputFile = `${fs.mkdtempSync(
      path.join(os.tmpdir(), "sbom-action-")
    )}/sbom.spdx`;

    setData({
      inputs: {
        image: "org/img",
        "upload-artifact": "true",
        "output-file": outputFile,
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

    expect(fs.existsSync(inputs["output-file"] as string)).toBeTruthy();

    await action.attachReleaseAssets();

    expect(artifacts.length).toBe(1);
    expect(assets.length).toBe(1);

    expect(fs.existsSync(outputFile)).toBeTruthy();
  });

  it("runs with retention input", async () => {
    setData({
      inputs: {
        image: "org/img",
        "upload-artifact": "true",
        "upload-artifact-retention": "3",
      },
    });

    await action.runSyftAction();

    const { artifacts } = data;

    expect(artifacts).toHaveLength(1);

    const opts = (artifacts[0] as any).options

    expect(opts.retentionDays).toEqual(3)
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

    expect(cmd.endsWith("syft")).toBeTruthy();
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

    expect(cmd.endsWith("syft")).toBeTruthy();
    expect(args).toContain("registry:somewhere/org/img");
    expect(env.SYFT_REGISTRY_AUTH_USERNAME).toBe("mr_awesome");
    expect(env.SYFT_REGISTRY_AUTH_PASSWORD).toBe("super_secret");
  });

  it("uses image name for default artifact name", () => {
    setData({
      inputs: {
        image: "something-something/image-image"
      }
    });

    expect(action.getArtifactName()).toBe("something-something-image-image.spdx.json");

    setData({
      inputs: {
        image: "ghcr.io/something-something/image-image"
      }
    });

    expect(action.getArtifactName()).toBe("something-something-image-image.spdx.json");
  });

  it("format informs artifact name", () => {
    setData({
      inputs: {
        image: "img",
        format: "spdx",
      }
    });

    expect(action.getArtifactName()).toBe("img.spdx");

    setData({
      inputs: {
        image: "img",
        format: "spdx-json",
      }
    });

    expect(action.getArtifactName()).toBe("img.spdx.json");

    setData({
      inputs: {
        image: "img",
        format: "cyclonedx",
      }
    });

    expect(action.getArtifactName()).toBe("img.cyclonedx.xml");

    setData({
      inputs: {
        image: "img",
        format: "cyclonedx-json",
      }
    });

    expect(action.getArtifactName()).toBe("img.cyclonedx.json");
  });

  it ("properly maps paths for WSL", () => {
    expect(mapToWSLPath("basic arg")).toBe("basic arg");
    expect(mapToWSLPath("D:\\Some\\Path")).toBe("/mnt/d/Some/Path");
    expect(mapToWSLPath("C:\\Some\\Path")).toBe("/mnt/c/Some/Path");
  });
});
