import {
  attachReleaseArtifacts,
  runSyftAction,
} from "./github/SyftGithubAction";

runSyftAction();
attachReleaseArtifacts();
