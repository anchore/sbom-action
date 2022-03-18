import {
  attachReleaseAssets,
  runAndFailBuildOnException,
  runSyftAction,
  uploadDependencySnapshot,
} from "./github/SyftGithubAction";

runAndFailBuildOnException(async () => {
  await runSyftAction();
  await uploadDependencySnapshot();
  await attachReleaseAssets();
});
