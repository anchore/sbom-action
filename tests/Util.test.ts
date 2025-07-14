import { stripEmojis } from "../src/github/Util";

describe("stripEmojis", () => {
  it("Should not modify strings without emojis", () => {
    const input = "Workflow for building my awesome app";
    const output = stripEmojis(input);
    expect(output).toBe(input);
  });

  it("should remove single emojis from strings", () => {
    const input = "Workflow for building my awesome app🏗";
    const output = stripEmojis(input);
    expect(output).toBe("Workflow for building my awesome app");
  });

  it("should remove multiple emojis from strings", () => {
    const input = "🚀Good 🧹morning 🏗!";
    const output = stripEmojis(input);
    expect(output).toBe("Good morning !");
  });
});
