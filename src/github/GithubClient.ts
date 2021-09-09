import { GitHub } from "@actions/github/lib/utils";
import * as github from "@actions/github";
import * as core from "@actions/core";

export type GithubRepo = { owner: string; repo: string };
export type GithubClient = InstanceType<typeof GitHub>;

export function getClient(githubToken: string): GithubClient {
  // This should be a token with access to your repository scoped in as a secret.
  // The YML workflow will need to set myToken with the GitHub Secret Token
  // myToken: ${{ secrets.GITHUB_TOKEN }}
  // https://help.github.com/en/actions/automating-your-workflow-with-github-actions/authenticating-with-the-github_token#about-the-github_token-secret
  return github.getOctokit(githubToken, {
    throttle: {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      onRateLimit: (retryAfter, options) => {
        core.warning(
          `Request quota exhausted for request ${options.method} ${options.url}`
        );
        if (options.request.retryCount === 0) {
          // only retries once
          core.info(`Retrying after ${retryAfter} seconds!`);
          return true;
        }
      },
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      onAbuseLimit: (retryAfter, options) => {
        // does not retry, only logs a warning
        core.warning(
          `Abuse detected for request ${options.method} ${options.url}`
        );
      },
    },
  });
}

export interface GithubClientProp {
  client: GithubClient;
}

export async function suppressOutput<T>(call: () => Promise<T>): Promise<T> {
  const info = core.info;
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    core.info = core.debug;
    return await call();
  } finally {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    core.info = info;
  }
}
