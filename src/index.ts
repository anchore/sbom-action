import * as core from "@actions/core";
import {
  attachReleaseAssets,
  getSyftCommand,
  runAndFailBuildOnException,
  runSyftAction,
  uploadDependencySnapshot,
} from "./github/SyftGithubAction";

const run = core.getInput("run") || "scan";

runAndFailBuildOnException(async () => {
  switch (run) {
    case "scan":
      await runSyftAction();
      await uploadDependencySnapshot();
      await attachReleaseAssets();
      break;
    case "download-syft": {
      const cmd = await getSyftCommand();
      core.setOutput("cmd", cmd);
      break;
    }
    case "publish-sbom":
      await attachReleaseAssets();
      break;
    default:
      throw new Error(`Unknown run mode: '${run}'`);
  }
});
