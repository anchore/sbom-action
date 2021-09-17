/**
 * Get all the mocks and mock data
 */
export function getMocks() {
  class Data {
    artifacts: any = [];

    assets: any = [];

    workflowRun: WorkflowRun = {
      id: 4309583450,
    } as any;

    inputs: { [key: string]: string } = {};

    outputs: { [key: string]: string } = {};

    release: Release = {} as Release;

    latestRun: WorkflowRun = {
      id: 1245,
    } as WorkflowRun;

    context: Context = {} as Context;
  }

  const data = Object.freeze(new Data());
  let returnStatus = 200;

  return {
    data,
    setInputs(inputs: { [key: string]: string }) {
      for (const k of Object.keys(data.inputs)) {
        delete data.inputs[k];
      }
      Object.assign(data.inputs, inputs);
    },
    setContext(context: Context) {
      for (const k of Object.keys(data.context)) {
        delete (data.context as any)[k];
      }
      Object.assign(data.context, context);
    },
    setReturnStatus(status: number) {
      returnStatus = status;
    },
    mocks: {
      "@actions/core": () => {
        return {
          getInput(name: string) {
            return data.inputs[name];
          },
          setOutput(name: string, value: string) {
            data.outputs[name] = value;
          },
          setFailed(msg: string) {
            data.outputs["@actions/core/setFailed"] = msg;
          },
          get info() {
            return () => {
            };
          },
          set info(_i) {
          },
          debug() {
          },
          addPath() {
          },
          isDebug() {
            return false;
          },
          exportVariable() {
          },
        };
      },

      "@actions/artifact/lib/internal/download-http-client": () => {
        return {
          DownloadHttpClient: class {
            listArtifacts() {
              return Promise.resolve({
                value: data.artifacts,
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
                data.artifacts.push({
                  id: data.artifacts.length,
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
            return data.context;
          },
          getOctokit() {
            return {
              rest: {
                actions: {
                  listWorkflowRunArtifacts() {
                    return Promise.resolve({
                      status: returnStatus,
                      data: {
                        artifacts: data.artifacts,
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
                        workflow_runs: [data.workflowRun],
                      },
                    });
                  },
                },
                repos: {
                  listReleaseAssets() {
                    return Promise.resolve({
                      status: returnStatus,
                      data: data.assets,
                    });
                  },
                  uploadReleaseAsset({name}: any) {
                    data.assets.push({
                      id: data.assets.length,
                      name,
                    });
                    return Promise.resolve();
                  },
                  deleteReleaseAsset({id}: any) {
                    const idx = data.assets.findIndex((a: any) => a.id === id);
                    data.assets.splice(idx, 1);
                  },
                  getReleaseByTag() {
                    return Promise.resolve({
                      data: data.release,
                    });
                  },
                },
              },
            };
          },
        };
      },
    } as { [key: string]: () => any }
  };
}

import { ExecOptions } from "@actions/exec";
import { Context } from "@actions/github/lib/context";
import { Release, WorkflowRun } from "@octokit/webhooks-types";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
