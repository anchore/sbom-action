import { runSyftAction } from "../../src/github/SyftGithubAction";
import * as core from "@actions/core";

jest.setTimeout(30000);
Date.now = jest.fn(() => 1482363367071);

const testSource = async (source: string): Promise<string> => {
  let spdx = "";
  const spyOutput = jest
    .spyOn(core, "setOutput")
    .mockImplementation((name, value) => {
      switch(name) {
        case "sbom":
          spdx = value;
          break;
      }
    });

  const spyInput = jest
    .spyOn(core, "getInput")
    .mockImplementation((name, value) => {
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
