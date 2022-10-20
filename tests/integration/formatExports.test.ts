import * as core from "@actions/core";
import * as github from "@actions/github";
import * as fs from "fs";
import * as client from "../../src/github/GithubClient";
import { runSyftAction } from "../../src/github/SyftGithubAction";

jest.setTimeout(30000);
Date.now = jest.fn(() => 1482363367071);

const testSource = async (source: string, format = "spdx"): Promise<string> => {
  let sbom = "";
  const artifacts: client.Artifact[] = [];

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  (github as unknown).context = {
    eventName: "release",
    ref: "v0.0.0",
    payload: {},
    repo: {
      owner: "test-org",
      repo: "test-repo",
    },
    runId: 1,
    job: "a_job",
    action: "__self",
  };

  const spyGetClient = jest
    .spyOn(client, "getClient")
    .mockImplementation(() => {
      return {
        listWorkflowArtifacts() {
          return Promise.resolve(artifacts);
        },
        uploadWorkflowArtifact({ file }) {
          sbom = fs.readFileSync(file).toString();
          return Promise.resolve();
        },
      } as client.GithubClient;
    });

  const spyOutput = jest
    .spyOn(core, "setOutput")
    .mockImplementation((name, value) => {
      switch (name) {
        case "sbom":
          // this needs to be unescaped because of multi-line strings
          sbom = value
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
      case "format":
        // SPDX-json is not consistently sorted,
        // so we sort text SPDX output for snapshots
        return format;
    }
    return "";
  });

  try {
    await runSyftAction();
  } finally {
    spyInput.mockRestore();
    spyOutput.mockRestore();
    spyGetClient.mockRestore();
  }

  // Remove non-static data:
  switch (format) {
    case "spdx":
    case "spdx-tag-value":
      return sbom
        .replace(/[Cc]reated["]?[:][^\n]+/g, "")
        .replace(/Creator[:][^\n]+/g, "")
        .replace(/SPDXID[:][^\n]+/g, "")
        .replace(/LicenseListVersion[:][^\n]+/g, "")
        .replace(/DocumentNamespace[:][^\n]+/g, "");
    case "spdx-json":
      return sbom
        .replace(/"(created|SPDXID|licenseListVersion|documentNamespace|spdxElementId|relatedSpdxElement)": "[^"]+",?/g, "")
        .replace(/"Tool:[^"]+"/g, "");
    case "cyclonedx":
    case "cyclonedx-xml":
      return sbom
        .replace(/serialNumber=["]?[^"]+/g, "")
        .replace(/bom-ref="[^"]+"/g, "")
        .replace(/<timestamp>[^<]+<\/timestamp>/g, "")
        .replace(/<property name="syft:location[^<]+<\/property>/g, "")
        .replace(/<version>[^<]+<\/version>/g, "");
    case "cyclonedx-json":
      return sbom
        .replace(/"(bom-ref|serialNumber|timestamp|value|version)": "[^"]+",?/g, "");
  }

  return sbom;
};

describe("SPDX Tag Value", () => {
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

describe("SPDX JSON", () => {
  it("alpine", async () => {
    const sbom = await testSource(
      "localhost:5000/match-coverage/alpine:latest",
      "spdx-json"
    );
    expect(sbom).toMatchSnapshot();
  });
  it("centos", async () => {
    await testSource(
      "localhost:5000/match-coverage/centos:latest",
      "spdx-json");
  });
  it("debian", async () => {
    const sbom = await testSource(
      "localhost:5000/match-coverage/debian:latest",
      "spdx-json"
    );
    expect(sbom).toMatchSnapshot();
  });
  it("npm", async () => {
    const sbom = await testSource(
      "dir:tests/fixtures/npm-project",
      "spdx-json");
    expect(sbom).toMatchSnapshot();
  });
  it("yarn", async () => {
    const sbom = await testSource(
      "dir:tests/fixtures/yarn-project",
      "spdx-json");
    expect(sbom).toMatchSnapshot();
  });
});

describe("CycloneDX XML", () => {
  it("alpine", async () => {
    const sbom = await testSource(
      "localhost:5000/match-coverage/alpine:latest",
      "cyclonedx"
    );
    expect(sbom).toMatchSnapshot();
  });
  it("centos", async () => {
    await testSource(
      "localhost:5000/match-coverage/centos:latest",
      "cyclonedx");
  });
  it("debian", async () => {
    const sbom = await testSource(
      "localhost:5000/match-coverage/debian:latest",
      "cyclonedx"
    );
    expect(sbom).toMatchSnapshot();
  });
  it("npm", async () => {
    const sbom = await testSource(
      "dir:tests/fixtures/npm-project",
      "cyclonedx");
    expect(sbom).toMatchSnapshot();
  });
  it("yarn", async () => {
    const sbom = await testSource(
      "dir:tests/fixtures/yarn-project",
      "cyclonedx");
    expect(sbom).toMatchSnapshot();
  });
});

describe("CycloneDX JSON", () => {
  it("alpine", async () => {
    const sbom = await testSource(
      "localhost:5000/match-coverage/alpine:latest",
      "cyclonedx-json"
    );
    expect(sbom).toMatchSnapshot();
  });
  it("centos", async () => {
    await testSource(
      "localhost:5000/match-coverage/centos:latest",
      "cyclonedx-json");
  });
  it("debian", async () => {
    const sbom = await testSource(
      "localhost:5000/match-coverage/debian:latest",
      "cyclonedx-json"
    );
    expect(sbom).toMatchSnapshot();
  });
  it("npm", async () => {
    const sbom = await testSource(
      "dir:tests/fixtures/npm-project",
      "cyclonedx-json");
    expect(sbom).toMatchSnapshot();
  });
  it("yarn", async () => {
    const sbom = await testSource(
      "dir:tests/fixtures/yarn-project",
      "cyclonedx-json");
    expect(sbom).toMatchSnapshot();
  });
});
