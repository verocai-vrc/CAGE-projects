import type { z } from 'zod';

// Loads + Zod-validates + Object.freeze()s a content file at boot
// (DESIGN.md §2 memory rules: content is immutable, never cloned per fight).
export function loadContent<T>(name: string, raw: unknown, schema: z.ZodType<T>): Readonly<T> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid content in ${name}: ${parsed.error.message}`);
  }
  return Object.freeze(parsed.data) as Readonly<T>;
}
