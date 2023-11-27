/**
 * Used for filesystem directory input to Syft
 */
export interface SyftDirectoryInput {
  path: string;
}

/**
 * Used for file input to Syft
 */
export interface SyftFileInput {
  file: string;
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
  input:
    | SyftDirectoryInput
    | SyftFileInput
    | SyftRegistryInput
    | SyftImageInput;
  format:
    | "spdx"
    | "spdx-tag-value"
    | "spdx-json"
    | "cyclonedx"
    | "cyclonedx-xml"
    | "cyclonedx-json"
    | "table"
    | "text"
    | "json";
  uploadToDependencySnapshotAPI: boolean;
  configFile: string;
}
