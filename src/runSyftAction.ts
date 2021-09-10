import {
  attachReleaseArtifacts,
  runSyftAction,
} from "./github/SyftGithubAction";

(async () => {
  await runSyftAction();
  await attachReleaseArtifacts();
})();
