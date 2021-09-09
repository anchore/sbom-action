import * as core from "@actions/core";
import { getSyftCommand } from "./github/SyftGithubAction";

(async () => {
  const cmd = await getSyftCommand();
  core.setOutput("cmd", cmd);
})();
