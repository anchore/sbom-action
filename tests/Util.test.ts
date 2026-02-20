import { describe, it } from "node:test";
import assert from "node:assert";
import { stripEmojis } from "../src/github/Util";

describe("stripEmojis", () => {
  it("Should not modify strings without emojis", () => {
    const input = "Workflow for building my awesome app";
    const output = stripEmojis(input);
    assert.strictEqual(output, input);
  });

  it("should remove single emojis from strings", () => {
    const input = "Workflow for building my awesome app🏗";
    const output = stripEmojis(input);
    assert.strictEqual(output, "Workflow for building my awesome app");
  });

  it("should remove multiple emojis from strings", () => {
    const input = "🚀Good 🧹morning 🏗!";
    const output = stripEmojis(input);
    assert.strictEqual(output, "Good morning !");
  });
});
