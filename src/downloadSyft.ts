import * as core from "@actions/core";
import {
  getSyftCommand,
  runAndFailBuildOnException,
} from "./github/SyftGithubAction";

runAndFailBuildOnException(async () => {
  const cmd = await getSyftCommand();
  core.setOutput("cmd", cmd);
});
