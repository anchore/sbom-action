import test, { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert";
import { context, getMocks } from "../mocks";

const { setData, restoreInitialData, mocks } = getMocks(test);
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

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
    // reset request state
    requestArgs = null;
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
    assert.ok(requestArgs);
    assert.equal(requestArgs.length, 2);
    assert.equal(
      requestArgs[0],
      "POST /repos/test-org/test-repo/dependency-graph/snapshots"
    );

    // check the resulting snapshot file
    const data = requestArgs[1].data;
    const submission = JSON.parse(data);

    assert.deepEqual(
      submission.job.correlator,
      "my-workflow_default-import-job"
    );
    assert.ok(submission.scanned);

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
    assert.ok(requestArgs);
    assert.equal(requestArgs.length, 2);
    assert.equal(
      requestArgs[0],
      "POST /repos/test-org/test-repo/dependency-graph/snapshots"
    );

    // check the resulting snapshot file
    const data = requestArgs[1].data;
    const submission = JSON.parse(data);

    assert.ok(submission.scanned);

    // redact changing data
    submission.scanned = "";
    submission.detector.version = "";

    assert.ok(submission.job);
    assert.deepEqual(
      submission.job.correlator,
      "my-workflow_default-import-job_my-matrix-build-1"
    );

    t.assert.snapshot(submission);
  });

  it("runs with output file", async (t) => {
    const outputFile = `${fs.mkdtempSync(
          path.join(os.tmpdir(), "sbom-action-")
        )}/sbom-output.github.sbom.json`;

    setData({
      inputs: {
        path: "tests/fixtures/npm-project",
        "dependency-snapshot-output-file": outputFile,
        "dependency-snapshot": "true"
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

    assert.ok(fs.existsSync(outputFile));
    
    await action.uploadDependencySnapshot();

    // validate the request was made
    assert.ok(requestArgs);
    assert.equal(requestArgs.length, 2);
    assert.equal(
      requestArgs[0],
      "POST /repos/test-org/test-repo/dependency-graph/snapshots"
    );

    // check the resulting snapshot file
    const data = requestArgs[1].data;
    const submission = JSON.parse(data);

    assert.ok(submission.scanned);

    // redact changing data
    submission.scanned = "";
    submission.detector.version = "";

    assert.ok(submission.job);

    t.assert.snapshot(submission);
  });

  it("runs with output file without upload", async () => {
    const outputFile = `${fs.mkdtempSync(
          path.join(os.tmpdir(), "sbom-action-")
        )}/sbom-output.github.sbom.json`;

    setData({
      inputs: {
        path: "tests/fixtures/npm-project",
        "dependency-snapshot-output-file": outputFile,
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

    assert.ok(fs.existsSync(outputFile));
    
    await action.uploadDependencySnapshot();

    // validate no request was made
    assert.equal(requestArgs, null);
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
    assert.ok(requestArgs);
    assert.equal(requestArgs.length, 2);
    assert.equal(
      requestArgs[0],
      "POST /repos/test-org/test-repo/dependency-graph/snapshots"
    );

    // check the resulting snapshot file
    const data = requestArgs[1].data;
    const submission = JSON.parse(data);

    assert.ok(submission.scanned);

    // redact changing data
    submission.scanned = "";
    submission.detector.version = "";

    assert.ok(submission.job);
    assert.deepEqual(submission.job.correlator, "some-correlator");

    t.assert.snapshot(submission);
  });
});
