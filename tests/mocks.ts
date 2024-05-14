import {
  DownloadArtifactOptions,
  DownloadArtifactResponse,
  FindOptions,
  ListArtifactsResponse,
  UploadArtifactOptions,
  UploadArtifactResponse
} from "@actions/artifact";

/**
 * Get all the mocks and mock data
 */
export function getMocks() {
  class Data {
    artifacts: Partial<(Artifact & { runId: number, id: number, files: string[] })>[] = [];

    assets: Partial<ReleaseAsset>[] = [];

    workflowRuns: Partial<WorkflowRun>[] = [];

    inputs: { [key: string]: string | number } = {};

    outputs: { [key: string]: string } = {};

    releases: Partial<Release>[] = [];

    latestRun: Partial<WorkflowRun> = {} as never;

    context: Omit<Context, "payload"> & { payload?: PartialDeep<PullRequestEvent | PushEvent | ReleaseEvent> } = context.push({}) as never;

    execArgs: {
      cmd: string,
      args: string[],
      opts: ExecOptions,
      env: { [key: string]: string }
    } = {} as never;

    returnStatus: { status: number } = {
      status: 200,
    };

    failed: { message?: string } = {};

    debug: {
      enabled: boolean,
      log: string[],
    } = {
      enabled: false,
      log: [],
    }
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
        Object.assign(prop, newProp);
      // If this was a mutable object, we might want to do this:
      // } else {
      //   (data as any)[d] = newProp;
      }
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
            data.failed.message = msg;
          },
          info() {
            // ignore
          },
          warning() {
            // ignore
          },
          debug(msg: any) {
            if (data.debug.enabled) {
              data.debug.log.push(msg);
            }
          },
          addPath() {
            // ignore
          },
          isDebug() {
            return data.debug.enabled;
          },
          exportVariable() {
            // ignore
          },
          async group(_name: string, callback: () => Promise<unknown>) {
            return callback();
          }
        };
      },

      "@actions/artifact": () => {
        return {
          /*
          export interface ArtifactClient {
            uploadArtifact(name: string, files: string[], rootDirectory: string, options?: UploadArtifactOptions): Promise<UploadArtifactResponse>;
            listArtifacts(options?: ListArtifactsOptions & FindOptions): Promise<ListArtifactsResponse>;
            getArtifact(artifactName: string, options?: FindOptions): Promise<GetArtifactResponse>;
            downloadArtifact(artifactId: number, options?: DownloadArtifactOptions & FindOptions): Promise<DownloadArtifactResponse>;
            deleteArtifact(artifactName: string, options?: FindOptions): Promise<DeleteArtifactResponse>;
          }
          */
          uploadArtifact(name: string, files: string[], rootDirectory: string, options?: UploadArtifactOptions): UploadArtifactResponse {
            const id = data.artifacts.length;
            data.artifacts.push({
              id,
              name: path.basename(name),
              files,
              rootDirectory,
              options,
            } as never);
            return {
              id,
            };
          },
          downloadArtifact(artifactId: number, options?: DownloadArtifactOptions & FindOptions): DownloadArtifactResponse {
            const tempPath = options?.path || "/tmp";
            const artifact = data.artifacts.find(a => a.id == artifactId);
            if (artifact) {
              const name = "my-artifact-name";
              fs.writeFileSync(`${tempPath}/${name}`, "file");
              return {
                downloadPath: `${tempPath}/${name}`,
              };
            }
            throw new Error(`no artifact for id: ${artifactId}`);
          },
          listArtifacts() {
            return {
              artifacts: data.artifacts.filter(a => !a.runId),
            };
          },
          getArtifact(artifactName: string, options?: FindOptions) {
            return {
              artifact: data.artifacts.find(a => a.name == artifactName)
            }
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
        async exec(cmd: string, args: string[], opts: ExecOptions = {}) {
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
          return 0;
        },
      }),

      "@actions/github": () => {
        return {
          get context() {
            return data.context;
          },
          getOctokit() {
            return {
              request(request: any): any {
                return request;
              },
              rest: {
                actions: {
                  async listWorkflowRunArtifacts({ run_id }: any) {
                    return {
                      status: data.returnStatus.status,
                      data: {
                        artifacts: data.artifacts.filter(a => a.runId === run_id),
                      },
                    };
                  },
                  async downloadArtifact() {
                    return {
                      url: "http://artifact",
                    };
                  },
                  async listWorkflowRunsForRepo({ branch, status }: any) {
                    return {
                      status: data.returnStatus.status,
                      data: {
                        workflow_runs: data.workflowRuns.filter(r =>
                          r.head_branch === branch && r.conclusion === status
                        ),
                      },
                    };
                  },
                },
                repos: {
                  async listReleaseAssets() {
                    return {
                      status: data.returnStatus.status,
                      data: data.assets,
                    };
                  },
                  async uploadReleaseAsset({name}: ReleaseAsset) {
                    data.assets.push({
                      id: data.assets.length,
                      name,
                    } as never);
                  },
                  async deleteReleaseAsset({id}: ReleaseAsset) {
                    const idx = data.assets.findIndex(a => a.id === id);
                    data.assets.splice(idx, 1);
                  },
                  async getReleaseByTag({ tag }: any) {
                    return {
                      data: data.releases.find(r => r.tag_name === tag),
                    };
                  },
                  async listReleases() {
                    return {
                      data: data.releases,
                    };
                  }
                },
              },
            };
          },
        };
      },
    } as { [key: string]: () => unknown }
  };
}

const contextBase = {
  ref: "v0.0.0",
  sha: "a89b7d99c7097",
  payload: {},
  repo: {
    owner: "test-org",
    repo: "test-repo",
  },
  runId: 1,
  job: "my_job",
  action: "__anchore_sbom-action_2",
};

export const context = {
  pull_request(payload: PartialDeep<PullRequestEvent>) {
    return {
      ...contextBase,
      eventName: "pull_request",
      payload,
    };
  },
  push(payload: PartialDeep<PushEvent>) {
    return {
      ...contextBase,
      eventName: "push",
      payload,
    };
  },
  release(payload: PartialDeep<ReleaseEvent>) {
    return {
      ...contextBase,
      eventName: "release",
      payload,
    };
  }
};

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
