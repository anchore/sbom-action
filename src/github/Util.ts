import s from "fast-safe-stringify";

export function stringify(o: any): string {
  return s(o, undefined, 2);
}
