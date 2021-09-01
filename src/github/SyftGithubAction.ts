import { Log } from "../syft/Log";
import * as exec from "@actions/exec";
import * as cache from "@actions/tool-cache";
import * as core from "@actions/core";
import { Syft, SyftErrorImpl, SyftOptions, SyftOutput } from "../syft/Syft";
import { GithubActionLog } from "./GithubActionLog";

export const SYFT_BINARY_NAME = "syft";
export const SYFT_VERSION = "v0.21.0";

export class SyftGithubAction implements Syft {
  log: Log;

  constructor(logger: Log) {
    this.log = logger;
  }

  async execute({ input, format }: SyftOptions): Promise<SyftOutput> {
    let outStream = "";
    let errStream = "";

    const cmd = await this.getSyftCommand();

    const env: { [key: string]: string } = {
      SYFT_CHECK_FOR_APP_UPDATE: "false",
    };

    // https://github.com/anchore/syft#configuration
    let args = ["packages"];

    if ("image" in input && input.image) {
      args = [...args, `docker:${input.image}`];
    } else if ("path" in input && input.path) {
      args = [...args, `dir:${input.path}`];
    } else {
      throw new Error("Invalid input, no image or path specified");
    }

    args = [...args, "-o", format];

    try {
      const exitCode = await core.group("Syft Output", async () => {
        core.info(`Executing: ${cmd} ${args.join(" ")}`);
        return exec.exec(cmd, args, {
          env,
          // outStream,
          // errStream,
          listeners: {
            stdout(buffer) {
              outStream += buffer.toString();
            },
            stderr(buffer) {
              errStream += buffer.toString();
            },
            debug(message) {
              errStream += message.toString();
            },
          },
        });
      });

      if (exitCode > 0) {
        throw new Error("An error occurred running Syft");
      }
      return {
        report: outStream,
      };
    } catch (e) {
      this.log.error(e);
      throw new SyftErrorImpl({
        error: e,
        out: outStream,
        err: errStream,
      });
    }
  }

  async download(): Promise<string> {
    const name = SYFT_BINARY_NAME;
    const version = SYFT_VERSION;

    const url = `https://raw.githubusercontent.com/anchore/${name}/main/install.sh`;

    this.log.debug(`Installing ${name} ${version}`);

    // Download the installer, and run
    const installPath = await cache.downloadTool(url);

    // Make sure the tool's executable bit is set
    await exec.exec(`chmod +x ${installPath}`);

    const cmd = `${installPath} -b ${installPath}_${name} ${version}`;
    await exec.exec(cmd);
    const path = `${installPath}_${name}/${name}`;

    // Cache the downloaded file
    return cache.cacheFile(path, name, name, version);
  }

  async getSyftCommand(): Promise<string> {
    const name = SYFT_BINARY_NAME;
    const version = SYFT_VERSION;

    let path = cache.find(name, version);
    if (!path) {
      // Not found, install it
      path = await this.download();
    }

    // Add tool to path for this and future actions to use
    core.addPath(path);
    return name;
  }
}

export async function runSyftAction(): Promise<void> {
  try {
    core.debug(new Date().toTimeString());
    const syft = new SyftGithubAction(new GithubActionLog());
    const output = await syft.execute({
      input: {
        path: core.getInput("path"),
        image: core.getInput("image"),
      },
      format: (core.getInput("format") as SyftOptions["format"]) || "spdx",
      outputFile: core.getInput("outputFile"),
    });
    core.debug(new Date().toTimeString());

    if ("report" in output) {
      core.setOutput("sbom", output.report);
    } else {
      core.error(JSON.stringify(output));
    }
  } catch (e: unknown) {
    if (e instanceof SyftErrorImpl) {
      core.setFailed(`ERROR executing Syft: ${e.message}
      Caused by: ${e.error}
      STDOUT: ${e.out}
      STDERR: ${e.err}`);
    } else if (e instanceof Error) {
      core.setFailed(e.message);
    } else if (e instanceof Object) {
      core.setFailed(e.toString());
    } else {
      core.setFailed("An unknown error occurred");
    }
    throw e;
  }
}
