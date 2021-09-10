import {
  attachReleaseAssets,
  runAndFailBuildOnException,
} from "./github/SyftGithubAction";

runAndFailBuildOnException(attachReleaseAssets);
