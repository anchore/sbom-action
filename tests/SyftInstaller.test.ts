import test, { describe, it, mock } from "node:test";
import assert from "node:assert";
import { getMocks } from "./mocks";

const { data, setData, mocks } = getMocks(test);

// The requested Syft version is read when the action module loads, so it has
// to be set before importing it.
setData({
  inputs: {
    "syft-version": "latest",
  },
});

for (const [name, factory] of Object.entries(mocks)) {
  const exports = factory() as object;
  mock.module(name, { namedExports: exports, defaultExport: exports });
}

const { downloadSyft } = await import("../src/github/SyftGithubAction");

describe("Installer", () => {
  it("falls back to the default branch for a version that is not a tag", async () => {
    await downloadSyft();

    assert.deepEqual(data.downloadedUrls, [
      "https://raw.githubusercontent.com/anchore/syft/main/install.sh",
    ]);
    // the installer resolves "latest" itself and fetches its tagged version
    assert.equal(data.execArgs.env.DOWNLOAD_TAG_INSTALL_SCRIPT, "true");
  });
});
