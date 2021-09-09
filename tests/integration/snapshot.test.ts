import { runSyftAction } from "../../src/github/SyftGithubAction";
import * as artifactClient from "../../src/github/WorkflowArtifacts";
import * as core from "@actions/core";
import * as github from "@actions/github";
import { Artifact } from "../../src/github/WorkflowArtifacts";
import * as fs from "fs";
import * as client from "../../src/github/GithubClient";
import { GithubClient } from "../../src/github/GithubClient";

jest.setTimeout(30000);
Date.now = jest.fn(() => 1482363367071);

const testSource = async (source: string): Promise<string> => {
  let spdx = "";
  const artifacts: Artifact[] = [];

  // @ts-ignore
  (github as unknown).context = {
    eventName: "release",
    ref: "v0.0.0",
    payload: {},
    repo: "test-repo",
    runId: 1,
    job: "a_job",
    action: "__self",
  };

  const spyGetClient = jest
    .spyOn(client, "getClient")
    .mockImplementation(() => {
      return {
        rest: {
          actions: {},
          repos: {},
        },
      } as GithubClient;
    });

  const spyListArtifacts = jest
    .spyOn(artifactClient, "listWorkflowArtifacts")
    .mockImplementation(() => {
      return Promise.resolve(artifacts);
    });

  const spyUploadArtifact = jest
    .spyOn(artifactClient, "uploadArtifact")
    .mockImplementation(({ file }) => {
      spdx = fs.readFileSync(file).toString();
      return Promise.resolve();
    });

  const spyOutput = jest
    .spyOn(core, "setOutput")
    .mockImplementation((name, value) => {
      switch (name) {
        case "sbom":
          // this needs to be unescaped because of multi-line strings
          spdx = value
            .replace("%0A", "\n")
            .replace("%0D", "\r")
            .replace("%25", "%");
          break;
      }
    });

  const spyInput = jest.spyOn(core, "getInput").mockImplementation((name) => {
    // console.log(name, value);
    switch (name) {
      case "path":
        return source.startsWith("dir:") ? source.substr(4) : "";
      case "image":
        return source.startsWith("dir:") ? "" : source;
    }
    return "";
  });

  try {
    await runSyftAction();
  } finally {
    spyInput.mockRestore();
    spyOutput.mockRestore();
    spyGetClient.mockRestore();
    spyListArtifacts.mockRestore();
    spyUploadArtifact.mockRestore();
  }

  // FIXME these tests are already flaky because SPDX format is not sorted currently
  return spdx
    .replace(/[Cc]reated["]?[:][^\n]+/g, "")
    .split("\n")
    .sort()
    .join("\n");
};

describe("SPDX", () => {
  it("alpine", async () => {
    const spdx = await testSource(
      "localhost:5000/match-coverage/alpine:latest"
    );
    expect(spdx).toMatchSnapshot();
  });
  it("centos", async () => {
    await testSource("localhost:5000/match-coverage/centos:latest");
  });
  it("debian", async () => {
    const spdx = await testSource(
      "localhost:5000/match-coverage/debian:latest"
    );
    expect(spdx).toMatchSnapshot();
  });
  it("npm", async () => {
    const spdx = await testSource("dir:tests/fixtures/npm-project");
    expect(spdx).toMatchSnapshot();
  });
  it("yarn", async () => {
    const spdx = await testSource("dir:tests/fixtures/yarn-project");
    expect(spdx).toMatchSnapshot();
  });
});
