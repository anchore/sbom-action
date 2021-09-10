import {
  attachReleaseAssets,
  runAndFailBuildOnException,
  runSyftAction,
} from "./github/SyftGithubAction";

runAndFailBuildOnException(async () => {
  await runSyftAction();
  await attachReleaseAssets();
});
