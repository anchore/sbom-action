import { Log } from "../syft/Log";
import { debug, info, warning, error } from "@actions/core";

export class GithubActionLog implements Log {
  debug(...parts: unknown[]): void {
    debug(parts.join(" "));
  }
  info(...parts: unknown[]): void {
    info(parts.join(" "));
  }
  warn(...parts: unknown[]): void {
    warning(parts.join(" "));
  }
  error(...parts: unknown[]): void {
    error(parts.join(" "));
  }
}
