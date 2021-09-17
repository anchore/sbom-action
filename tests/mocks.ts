export const artifacts: any = [];

export const assets: any = [];

export const workflowRun: WorkflowRun = {
  id: 4309583450,
} as any;

export let inputs: { [key: string]: string } = {};
export let outputs: { [key: string]: string } = {};

export function setInputs(i: typeof inputs) {
  Object.assign(inputs, i);
}

export const release = {} as Release;

export const latestRun = {
  id: 1245,
} as WorkflowRun;

export let context: Context;

export function setContext(c: Context) {
  context = c;
}

export let returnStatus = 200;

export function setReturnStatus(status: number) {
  returnStatus = status;
}

export const mocks = {
  "@actions/core": () => {
    return {
      getInput(name: string) {
        return inputs[name];
      },
      setOutput(name: string, value: string) {
        outputs[name] = value;
      },
      setFailed(msg: string) {
        outputs["@actions/core/setFailed"] = msg;
      },
      get info() {
        return () => {};
      },
      set info(_i) {},
      debug() {},
      addPath() {},
      isDebug() {
        return false;
      },
      exportVariable() {},
    };
  },

  "@actions/artifact/lib/internal/download-http-client": () => {
    return {
      DownloadHttpClient: class {
        listArtifacts() {
          return Promise.resolve({
            value: artifacts,
          });
        }
      },
    };
  },

  "@actions/artifact": () => {
    return {
      create() {
        return {
          uploadArtifact(name: string, file: string) {
            artifacts.push({
              id: artifacts.length,
              name: path.basename(name),
              file,
            });
          },
          downloadArtifact(name: string, tempPath: string) {
            fs.writeFileSync(`${tempPath}/${name}`, "file");
            return {
              downloadPath: tempPath,
              artifactName: name,
            };
          },
        };
      },
    };
  },

  "@actions/tool-cache": () => ({
    downloadTool() {
      return "download-tool";
    },
    extractZip() {
      const tempPath = fs.mkdtempSync(path.join(os.tmpdir(), "sbom-action-"));
      fs.writeFileSync(`${tempPath}/sbom-asdf.spdx`, "sbom");
      return tempPath;
    },
    find(name: string) {
      return name;
    },
  }),

  "@actions/exec": () => ({
    exec(cmd: string, args: string[], opts: ExecOptions) {
      if (opts) {
        const out = opts.listeners?.stdout;
        if (out) {
          out(Buffer.from("syft output"));
        }
      }
      return Promise.resolve(0);
    },
  }),

  "@actions/github": () => {
    return {
      get context() {
        return context;
      },
      getOctokit() {
        return {
          rest: {
            actions: {
              listWorkflowRunArtifacts() {
                return Promise.resolve({
                  status: returnStatus,
                  data: {
                    artifacts,
                  },
                });
              },
              downloadArtifact() {
                return Promise.resolve({
                  url: "http://artifact",
                });
              },
              listWorkflowRunsForRepo() {
                return Promise.resolve({
                  status: returnStatus,
                  data: {
                    workflow_runs: [workflowRun],
                  },
                });
              },
            },
            repos: {
              listReleaseAssets() {
                return Promise.resolve({
                  status: returnStatus,
                  data: assets,
                });
              },
              uploadReleaseAsset({ name }: any) {
                assets.push({
                  id: assets.length,
                  name,
                });
                return Promise.resolve();
              },
              deleteReleaseAsset({ id }: any) {
                const idx = assets.findIndex((a: any) => a.id === id);
                assets.splice(idx, 1);
              },
              getReleaseByTag() {
                return Promise.resolve({
                  data: release,
                });
              },
            },
          },
        };
      },
    };
  },
} as { [key: string]: () => any };

import { ExecOptions } from "@actions/exec";
import { Context } from "@actions/github/lib/context";
import { Release, WorkflowRun } from "@octokit/webhooks-types";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
