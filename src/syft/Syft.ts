/**
 * Used for filesystem directory input to Syft
 */
export interface SyftDirectoryInput {
  path: string;
}

/**
 * Used to point Syft to a registry to scan an image
 */
export interface SyftRegistryInput {
  registry: string;
  image: string;
}

/**
 * Used to point Syft to a local image
 */
export interface SyftImageInput {
  image: string;
}

/**
 * Syft invocation options
 */
export interface SyftOptions {
  input: SyftDirectoryInput | SyftRegistryInput | SyftImageInput;
  format: "spdx" | "spdx-json" | "cyclonedx" | "table" | "text" | "json";
  outputFile: string;
}

/**
 * Captured Syft report output
 */
export interface SyftOutput {
  report: string;
}

/**
 * Provide all the stdout and stderr when an error occurs
 */
export interface SyftError {
  error: unknown;
  out: string;
  err: string;
}

/**
 * Provides a simple separation of syft output in the case of an error
 */
export class SyftErrorImpl extends Error implements SyftError {
  constructor({ error, err, out }: SyftError) {
    super();
    this.error = error;
    this.err = err;
    this.out = out;
  }

  error: unknown;
  err: string;
  out: string;
}

/**
 * Syft interface, for options and types
 */
export interface Syft {
  execute: (options: SyftOptions) => Promise<SyftOutput>;
}
