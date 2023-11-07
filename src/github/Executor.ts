import * as exec from "@actions/exec";

/**
 * Execute directly for linux & macOS and use WSL for Windows
 * @param cmd command to execute
 * @param args command args
 * @param options command options
 */
export async function execute(
  cmd: string,
  args: string[],
  options?: exec.ExecOptions
) {
  return exec.exec(cmd, args, options);
}

/**
 * Maps the given parameter to a Windows Subsystem for Linux style path
 * @param arg
 */
export function mapToWSLPath(arg: string) {
  return arg.replace(
    /^([A-Z]):(.*)$/,
    (v, drive, path) => `/mnt/${drive.toLowerCase()}${path.replace(/\\/g, "/")}`
  );
}
