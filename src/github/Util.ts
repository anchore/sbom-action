import s from "fast-safe-stringify";

export function stringify(o: any): string {
  return s(o, undefined, 2);
}

export function stripEmojis(text: string): string {
  // Regular expression to match emojis
  const emojiRegex =
    /(?:[\u2700-\u27BF]|[\uE000-\uF8FF]|[\uD83C-\uDBFF][\uDC00-\uDFFF]|\ud83d[\udc00-\ude4f\ude80-\udeff]|\ud83e[\udd10-\udd3f\udd40-\uddff])/g;
  return text.replace(emojiRegex, "");
}

/**
 * Reports whether the given version is a Syft release tag. The version is
 * interpolated into the URL of a script that gets executed, so this has to
 * match the whole string: a value such as "v1/../../../someone/else/main"
 * would otherwise resolve to an installer from another repository.
 */
export function isReleaseTag(version: string): boolean {
  return /^v\d+\.\d+\.\d+([-+][\w.+-]+)?$/.test(version);
}
