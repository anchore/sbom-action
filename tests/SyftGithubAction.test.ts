import test, { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert";
import { context, getMocks } from "./mocks";

const { data, setData, restoreInitialData, mocks } = getMocks(test);
const { artifacts, assets, inputs } = data;

for (const [name, factory] of Object.entries(mocks)) {
  const exports = factory() as object;
  mock.module(name, { namedExports: exports, defaultExport: exports });
}

mock.method(Date, "now", () => 1482363367071);

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const action = await import("../src/github/SyftGithubAction");
const { downloadSyft, runAndFailBuildOnException } = action;
const { mapToWSLPath } = await import("../src/github/Executor");

describe("Action", { timeout: 30000 }, () => {
  beforeEach(() => {
    restoreInitialData();
  });

  it("downloads syft", async () => {
    const path = await downloadSyft();
    assert.strictEqual(path, "download-tool_syft/syft");
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

    assert.strictEqual(artifacts.length, 1);
    assert.strictEqual(assets.length, 0);
  });

  it("runs with image input", async () => {
    setData({
      inputs: {
        image: "some-image:latest",
      },
    });

    await action.runSyftAction();

    const { args } = data.execArgs;

    assert.notStrictEqual(args, undefined);
    assert.ok(args.length > 1);
    assert.strictEqual(args[1], "some-image:latest");
  });

  it("runs with path input", async () => {
    setData({
      inputs: {
        path: "some-path",
      },
    });

    await action.runSyftAction();

    const { args } = data.execArgs;

    assert.notStrictEqual(args, undefined);
    assert.ok(args.length > 1);
    assert.strictEqual(args[1], "dir:some-path");
  });

  it("runs with file input", async () => {
    setData({
      inputs: {
        file: "some-file.jar",
      },
    });

    await action.runSyftAction();

    const { args } = data.execArgs;

    assert.notStrictEqual(args, undefined);
    assert.ok(args.length > 1);
    assert.strictEqual(args[1], "file:some-file.jar");
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

    assert.ok(fs.existsSync(inputs["output-file"] as string));

    await action.attachReleaseAssets();

    assert.strictEqual(artifacts.length, 1);
    assert.strictEqual(assets.length, 1);

    assert.ok(fs.existsSync(outputFile));
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

    assert.strictEqual(artifacts.length, 1);

    const opts = (artifacts[0] as any).options;

    assert.deepStrictEqual(opts.retentionDays, 3);
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

    assert.strictEqual(artifacts.length, 0);
    assert.strictEqual(assets.length, 0);
  });

  it("runs pull-request compare", async () => {
    setData({
      inputs: {
        image: "org/img",
        "compare-pulls": "true",
        "artifact-name": "sbom.spdx.json",
      },
      context: context.pull_request({
        pull_request: {
          base: {
            ref: "main",
          },
        },
      }),
      workflowRuns: [
        {
          id: 6,
          head_branch: "main",
          conclusion: "success",
        },
      ],
      artifacts: [
        {
          runId: 6,
          name: "sbom.spdx.json",
          files: ["the_sbom"],
        },
      ],
    });

    await action.runSyftAction();

    assert.strictEqual(artifacts.length, 2);
  });

  it("runs in tag workflow", async () => {
    setData({
      inputs: {
        "sbom-artifact-match": ".*.spdx.json$",
      },
      context: {
        ...context.push({}),
        ref: "refs/tags/v34.8451",
      },
      releases: [
        {
          tag_name: "v34.8451",
        },
      ],
      artifacts: [
        {
          name: "awesome.spdx.json",
        },
      ],
    });

    await action.attachReleaseAssets();

    assert.strictEqual(assets.length, 1);
  });

  it("runs in tag workflow with draft release", async () => {
    setData({
      inputs: {
        "sbom-artifact-match": ".*.spdx.json$",
      },
      context: {
        ...context.push({}),
        ref: "refs/tags/v34.8451",
      },
      releases: [
        {
          draft: true,
          tag_name: "v34.8451",
        },
      ],
      artifacts: [
        {
          name: "awesome.spdx.json",
        },
      ],
    });

    await action.attachReleaseAssets();

    assert.strictEqual(assets.length, 1);
  });

  it("runs in release with prior workflow artifacts", async () => {
    setData({
      inputs: {
        "sbom-artifact-match": ".*.spdx.json$",
      },
      context: {
        ...context.release({
          release: {
            target_commitish: "main",
          },
        }),
        ref: "refs/tags/v34.8451",
      },
      releases: [
        {
          draft: true,
          tag_name: "v34.8451",
        },
      ],
      artifacts: [
        {
          runId: 9,
          name: "awesome.spdx.json",
        },
      ],
      workflowRuns: [
        {
          id: 9,
          head_branch: "main",
          conclusion: "success",
        },
      ],
    });

    await action.attachReleaseAssets();

    assert.strictEqual(assets.length, 1);
  });

  it("fails build with runAndFailBuildOnException", async () => {
    try {
      await runAndFailBuildOnException(async () => {
        throw new Error();
      });
      assert.notStrictEqual(data.failed.message, undefined);
    } catch (e) {
      assert.strictEqual("should not throw exception", e);
    }
  });

  it("does not include docker scheme by default", async () => {
    setData({
      inputs: {
        image: "somewhere/org/img",
      },
    });

    await action.runSyftAction();

    const { cmd, args, env } = data.execArgs;

    assert.ok(cmd.endsWith("syft"));
    assert.ok(args.includes("somewhere/org/img"));
    assert.ok(!env.SYFT_REGISTRY_AUTH_USERNAME);
    assert.ok(!env.SYFT_REGISTRY_AUTH_PASSWORD);
  });

  it("uses registry scheme with username and password", async () => {
    setData({
      inputs: {
        image: "somewhere/org/img",
        "registry-username": "mr_awesome",
        "registry-password": "super_secret",
      },
    });

    await action.runSyftAction();

    const { cmd, args, env } = data.execArgs;

    assert.ok(cmd.endsWith("syft"));
    assert.ok(args.includes("registry:somewhere/org/img"));
    assert.strictEqual(env.SYFT_REGISTRY_AUTH_USERNAME, "mr_awesome");
    assert.strictEqual(env.SYFT_REGISTRY_AUTH_PASSWORD, "super_secret");
  });

  it("uses image name for default artifact name", () => {
    setData({
      inputs: {
        image: "something-something/image-image",
      },
    });

    assert.strictEqual(
      action.getArtifactName(),
      "something-something-image-image.spdx.json"
    );

    setData({
      inputs: {
        image: "ghcr.io/something-something/image-image",
      },
    });

    assert.strictEqual(
      action.getArtifactName(),
      "something-something-image-image.spdx.json"
    );
  });

  it("format informs artifact name", () => {
    setData({
      inputs: {
        image: "img",
        format: "spdx",
      },
    });

    assert.strictEqual(action.getArtifactName(), "img.spdx");

    setData({
      inputs: {
        image: "img",
        format: "spdx-json",
      },
    });

    assert.strictEqual(action.getArtifactName(), "img.spdx.json");

    setData({
      inputs: {
        image: "img",
        format: "cyclonedx",
      },
    });

    assert.strictEqual(action.getArtifactName(), "img.cyclonedx.xml");

    setData({
      inputs: {
        image: "img",
        format: "cyclonedx-json",
      },
    });

    assert.strictEqual(action.getArtifactName(), "img.cyclonedx.json");
  });

  it("correctly encode tags", () => {
    setData({
      inputs: {
        image: "ghcr.io/something-something/image-image:0.1.2-dev",
      },
    });

    assert.strictEqual(
      action.getArtifactName(),
      "something-something-image-image_0_1_2-dev.spdx.json"
    );
  });

  it("properly maps paths for WSL", () => {
    assert.strictEqual(mapToWSLPath("basic arg"), "basic arg");
    assert.strictEqual(mapToWSLPath("D:\\Some\\Path"), "/mnt/d/Some/Path");
    assert.strictEqual(mapToWSLPath("C:\\Some\\Path"), "/mnt/c/Some/Path");
  });

  it("calls with config", async () => {
    setData({
      inputs: {
        image: "some-image:latest",
        config: "syft-config.yaml",
      },
    });

    await action.runSyftAction();
    const { args } = data.execArgs;

    assert.ok(args.includes("-c"));
    assert.ok(args.includes("syft-config.yaml"));
  });
});
