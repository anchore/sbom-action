/**
 * Get all the mocks and mock data
 */
export function getMocks() {
  class Data {
    artifacts: (Artifact & { id: number, file: string })[] = [];

    assets: ReleaseAsset[] = [];

    workflowRun: WorkflowRun = {
      id: 4309583450,
    } as never;

    inputs: { [key: string]: string } = {};

    outputs: { [key: string]: string } = {};

    release: Release = {} as never;

    latestRun: WorkflowRun = {
      id: 1245,
    } as never;

    context: Omit<Context, "payload"> & { payload?: PartialDeep<PullRequestEvent | PushEvent | ReleaseEvent> } = {
      eventName: "pull_request",
      ref: "v0.0.0",
      payload: {
        pull_request: {
          base: {
            ref: "asdf",
          },
        },
      },
      repo: {
        owner: "test-org",
        repo: "test-repo",
      },
      runId: 1,
      job: "pr_job_job",
      action: "__self",
    } as never;

    execArgs: {
      cmd: string,
      args: string[],
      opts: ExecOptions,
      env: { [key: string]: string }
    } = {} as any;

    returnStatus: { status: number } = {
      status: 200,
    };
  }

  const data = Object.freeze(new Data());
  const initialState = Object.freeze(JSON.parse(JSON.stringify(data)));

  const setData = (newData: PartialDeep<Data>) => {
    for (const d of Object.keys(newData)) {
      const prop: any = (data as any)[d];
      const newProp: any = (newData as any)[d];
      if (Array.isArray(prop)) {
        prop.splice(0, prop.length);
        prop.push(...newProp);
      } else if (typeof prop === "object") {
        for (const k of Object.keys(prop)) {
          delete prop[k];
        }
      } else {
        (data as any)[d] = newProp;
      }
      Object.assign(prop, newProp);
    }
  };

  const restoreInitialData = () => {
    setData(JSON.parse(JSON.stringify(initialState)));
  };

  return {
    data,
    setData,
    restoreInitialData,
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
          info() {
            // ignore
          },
          debug() {
            // ignore
          },
          addPath() {
            // ignore
          },
          isDebug() {
            return false;
          },
          exportVariable() {
            // ignore
          },
          group(_name: string, callback: () => Promise<unknown>) {
            return callback();
          }
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
                } as never);
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
          data.execArgs.cmd = cmd;
          data.execArgs.args = args;
          data.execArgs.opts = opts;
          data.execArgs.env = opts.env as any;
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
                      status: data.returnStatus.status,
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
                      status: data.returnStatus.status,
                      data: {
                        workflow_runs: [data.workflowRun],
                      },
                    });
                  },
                },
                repos: {
                  listReleaseAssets() {
                    return Promise.resolve({
                      status: data.returnStatus.status,
                      data: data.assets,
                    });
                  },
                  uploadReleaseAsset({name}: ReleaseAsset) {
                    data.assets.push({
                      id: data.assets.length,
                      name,
                    } as never);
                    return Promise.resolve();
                  },
                  deleteReleaseAsset({id}: ReleaseAsset) {
                    const idx = data.assets.findIndex(a => a.id === id);
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
    } as { [key: string]: () => unknown }
  };
}

import { PartialDeep } from "type-fest";
import { Artifact } from "../src/github/GithubClient";
import { ExecOptions } from "@actions/exec";
import { Context } from "@actions/github/lib/context";
import {
  PullRequestEvent, PushEvent,
  Release,
  ReleaseAsset, ReleaseEvent,
  WorkflowRun
} from "@octokit/webhooks-types";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
