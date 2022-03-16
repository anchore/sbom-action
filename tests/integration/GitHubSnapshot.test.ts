import {context, getMocks} from "../mocks";
const { setData, restoreInitialData, mocks } = getMocks();
let requestArgs: any;
delete mocks["@actions/exec"]
const mockCreator = mocks["@actions/github"]
mocks["@actions/github"] = () => {
  const actionBase = mockCreator() as any;
  return {
    ...actionBase,
    getOctokit() {
      const kit = actionBase.getOctokit();
      kit.request = (...args: any[]) => {
        requestArgs = args
        return args;
      }
      return kit
    }
  }
}
for (const mock of Object.keys(mocks)) {
  jest.mock(mock, mocks[mock]);
}
import * as action from "../../src/github/SyftGithubAction";

jest.setTimeout(30000);
Date.now = jest.fn(() => 1482363367071);

describe("GitHub Snapshot", () => {
  beforeEach(() => {
    restoreInitialData();
  });

  it("runs with default inputs on push", async () => {
    jest.mock("")
    setData({
      inputs: {
        path: ".",
        "dependency-snapshot": "true",
        "upload-artifact": "false",
      },
      context: {
        ...context.push({
          ref: "main",
        }),
        sha: "f293f09uaw90gwa09f9wea",
        job: "default-import-job",
        action: "__anchore_sbom-action",
      },
    });

    await action.runSyftAction();
    await action.uploadDependencySnapshot();

    expect(requestArgs).toBeDefined()

    const data = requestArgs[1].data;
    const submission = JSON.parse(data);
    submission.scanned = "";
    expect(JSON.stringify(submission)).toMatchSnapshot();
  });
});
