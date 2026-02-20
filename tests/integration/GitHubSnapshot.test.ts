import test, { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert";
import { context, getMocks } from "../mocks";

const { setData, restoreInitialData, mocks } = getMocks(test);

// actually run syft so we know if this output format is properly working
delete mocks["@actions/tool-cache"];
delete mocks["@actions/exec"];

// set up a mock for octokit.request
let requestArgs: any;
const mockCreator = mocks["@actions/github"];
mocks["@actions/github"] = () => {
  const actionsBase = mockCreator() as any;
  return {
    ...actionsBase,
    getOctokit() {
      const kit = actionsBase.getOctokit();
      kit.request = (...args: any[]) => {
        requestArgs = args;
        return args;
      };
      return kit;
    },
  };
};

for (const [name, factory] of Object.entries(mocks)) {
  const exports = factory() as object;
  mock.module(name, { namedExports: exports, defaultExport: exports });
}


mock.method(Date, "now", () => 1482363367071);

// setting up mocks must happen before this import
const action = await import("../../src/github/SyftGithubAction");

describe("GitHub Snapshot", { timeout: 30000 }, () => {
  beforeEach(() => {
    restoreInitialData();
  });

  it("runs with default inputs", async (t) => {
    setData({
      inputs: {
        path: "tests/fixtures/npm-project",
        "dependency-snapshot": "true",
        "upload-artifact": "false",
      },
      context: {
        ...context.push({
          ref: "main",
        }),
        sha: "f293f09uaw90gwa09f9wea",
        workflow: "my-workflow",
        job: "default-import-job",
        action: "__anchore_sbom-action",
      },
    });

    await action.runSyftAction();
    await action.uploadDependencySnapshot();

    // validate the request was made
    assert.notStrictEqual(requestArgs, undefined);
    assert.strictEqual(requestArgs.length, 2);
    assert.strictEqual(
      requestArgs[0],
      "POST /repos/test-org/test-repo/dependency-graph/snapshots"
    );

    // check the resulting snapshot file
    const data = requestArgs[1].data;
    const submission = JSON.parse(data);

    assert.deepStrictEqual(
      submission.job.correlator,
      "my-workflow_default-import-job"
    );
    assert.notStrictEqual(submission.scanned, undefined);

    // redact changing data
    submission.scanned = "";
    submission.detector.version = "";

    t.assert.snapshot(submission);
  });

  it("runs with artifact-name input", async (t) => {
    setData({
      inputs: {
        path: "tests/fixtures/npm-project",
        "dependency-snapshot": "true",
        "upload-artifact": "false",
        "artifact-name": "my-matrix-build-1",
      },
      context: {
        ...context.push({
          ref: "main",
        }),
        sha: "f293f09uaw90gwa09f9wea",
        workflow: "my-workflow",
        job: "default-import-job",
        action: "__anchore_sbom-action",
      },
    });

    await action.runSyftAction();
    await action.uploadDependencySnapshot();

    // validate the request was made
    assert.notStrictEqual(requestArgs, undefined);
    assert.strictEqual(requestArgs.length, 2);
    assert.strictEqual(
      requestArgs[0],
      "POST /repos/test-org/test-repo/dependency-graph/snapshots"
    );

    // check the resulting snapshot file
    const data = requestArgs[1].data;
    const submission = JSON.parse(data);

    assert.notStrictEqual(submission.scanned, undefined);

    // redact changing data
    submission.scanned = "";
    submission.detector.version = "";

    assert.notStrictEqual(submission.job, undefined);
    assert.deepStrictEqual(
      submission.job.correlator,
      "my-workflow_default-import-job_my-matrix-build-1"
    );

    t.assert.snapshot(submission);
  });

  it("runs with dependency-snapshot-correlator defined", async (t) => {
    setData({
      inputs: {
        path: "tests/fixtures/npm-project",
        "dependency-snapshot": "true",
        "upload-artifact": "false",
        "dependency-snapshot-correlator": "some-correlator",
      },
      context: {
        ...context.push({
          ref: "main",
        }),
        sha: "f293f09uaw90gwa09f9wea",
        workflow: "my-workflow",
        job: "default-import-job",
        action: "__anchore_sbom-action",
      },
    });

    await action.runSyftAction();
    await action.uploadDependencySnapshot();

    // validate the request was made
    assert.notStrictEqual(requestArgs, undefined);
    assert.strictEqual(requestArgs.length, 2);
    assert.strictEqual(
      requestArgs[0],
      "POST /repos/test-org/test-repo/dependency-graph/snapshots"
    );

    // check the resulting snapshot file
    const data = requestArgs[1].data;
    const submission = JSON.parse(data);

    assert.notStrictEqual(submission.scanned, undefined);

    // redact changing data
    submission.scanned = "";
    submission.detector.version = "";

    assert.notStrictEqual(submission.job, undefined);
    assert.deepStrictEqual(submission.job.correlator, "some-correlator");

    t.assert.snapshot(submission);
  });
});
