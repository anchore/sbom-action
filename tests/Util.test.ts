import { describe, it } from "node:test";
import assert from "node:assert";
import { isReleaseTag, stripEmojis } from "../src/github/Util";

describe("stripEmojis", () => {
  it("Should not modify strings without emojis", () => {
    const input = "Workflow for building my awesome app";
    const output = stripEmojis(input);
    assert.equal(output, input);
  });

  it("should remove single emojis from strings", () => {
    const input = "Workflow for building my awesome app🏗";
    const output = stripEmojis(input);
    assert.equal(output, "Workflow for building my awesome app");
  });

  it("should remove multiple emojis from strings", () => {
    const input = "🚀Good 🧹morning 🏗!";
    const output = stripEmojis(input);
    assert.equal(output, "Good morning !");
  });
});

describe("isReleaseTag", () => {
  // the version ends up in the URL of a script that gets executed, so anything
  // that could point at another repository has to be rejected
  const tests: { version: string; expected: boolean }[] = [
    { version: "v1.42.3", expected: true },
    { version: "v0.1.0", expected: true },
    { version: "v1.0.0-rc.1", expected: true },
    { version: "v1.0.0+build.1", expected: true },
    { version: "latest", expected: false },
    { version: "main", expected: false },
    { version: "1.42.3", expected: false },
    { version: "v1.42", expected: false },
    { version: "v1.42.3.4", expected: false },
    { version: "v1.42.3 ", expected: false },
    { version: "v1.42.3\n", expected: false },
    { version: "prefix-v1.42.3", expected: false },
    { version: "v1.42.3/../../../someone/else/main", expected: false },
    { version: "v1/../../../someone/else/main", expected: false },
    { version: "", expected: false },
  ];

  for (const { version, expected } of tests) {
    it(`should report ${JSON.stringify(version)} as ${expected}`, () => {
      assert.equal(isReleaseTag(version), expected);
    });
  }
});
