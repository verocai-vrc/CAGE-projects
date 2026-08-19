// Types for check-content.mjs, which stays plain JS because CI runs it with
// `node scripts/check-content.mjs` before any build step exists to compile it.
// tests/nickname.spec.ts imports the rules so the generated nickname product
// space is checked against the same denylist the CI lint applies.

export declare const BANNED_MARKS: string[];
export declare const BANNED_MONIKERS: string[];

/** A reason string if the value is denied, or null if it is clean. */
export declare function denyReason(value: string): string | null;

export interface ContentViolation {
  file: string;
  path: string;
  value: string;
  reason: string;
}

/** Every denied string in every JSON file under the given directory. */
export declare function checkContentDir(dir?: string): ContentViolation[];
