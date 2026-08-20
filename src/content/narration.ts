// content/narration.ts — Loop 7.10: the lazy content chunk
// (DESIGN.md §16.6, §16.9).
//
// Lives in /content rather than /narration because Appendix B is explicit that
// "/narration imports nothing from /ui or /state" — and validating a pool means
// importing its Zod schema, which §2 keeps in state/schema.ts with every other
// content schema. A content loader in /content is where that import is
// legitimate, and it sits beside content/load.ts, which does the same job for
// the eagerly-loaded files. (Loop 7.10 originally put this in /narration and
// enforced the purity rule in the wrong direction; 7.11 corrected both.)
//
// §16.9 has the arithmetic that forces this: M7's content measures ~12KB gzip
// against ~10KB of headroom under the 150KB initial-transfer ceiling. "M7 as
// specified breaches the ceiling by a few KB if everything ships in the initial
// bundle." So narration content is fetched on entry to fight night and is not
// initial transfer, and §16.9's second CI check caps the chunk at 13KB gzip
// (scripts/check-budgets.mjs, which has been waiting for this loop to create it).
//
// THE IMPORTANT PART: nothing in the initial bundle may import this module's
// content statically. `content/index.ts` deliberately does not load
// `narration/*.json` the way it loads every other content file — that is what
// keeps the chunk lazy, and tests/narration.spec.ts asserts it.
//
// This bends §2's "validated at boot" rule and §16.6 requires the bend be
// stated: a CI test imports and validates EVERY content file including these
// pools, so malformed content cannot ship at all. The runtime validation below
// is a shipping-integrity check whose failure path is "commentary off, tape on"
// — degraded, never a crash, and never mid-bout, since the load completes
// before the walkout.

import { NarrationPoolSchema } from '../state/schema';
import type { NarrationLine } from '../narration/types';

/**
 * Every narration pool file, as lazy importers.
 *
 * `import.meta.glob` rather than a hand-maintained import list: 7.13 and 7.14
 * add pool files, and a list they must remember to update is a content gap
 * waiting to happen. Vite resolves the glob at build time, so the file set is
 * still static — this is not a runtime directory read.
 */
const poolModules = import.meta.glob<{ default: unknown }>('./narration/*.json');

/** Resolved once per session and cached (§16.6: "cached for the session"). */
let cached: readonly NarrationLine[] | null = null;
let inFlight: Promise<readonly NarrationLine[]> | null = null;

export class NarrationLoadError extends Error {
  // Declared and assigned rather than a constructor parameter property:
  // tsconfig sets `erasableSyntaxOnly`, which forbids the shorthand.
  file: string;

  constructor(message: string, file: string) {
    super(message);
    this.name = 'NarrationLoadError';
    this.file = file;
  }
}

/**
 * Load, validate, and freeze every narration pool.
 *
 * Throws `NarrationLoadError` on a malformed pool. The caller's failure path is
 * §16.6's "commentary off, tape on" — the mechanical play-by-play log is always
 * there, so a failed narration load degrades fight night rather than ending it.
 *
 * Concurrent callers share one in-flight promise: fight night may prefetch while
 * the walkout screen also asks, and validating the same pools twice is waste.
 */
export async function loadNarration(): Promise<readonly NarrationLine[]> {
  if (cached) return cached;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const files = Object.keys(poolModules).sort();
    if (files.length === 0) {
      throw new NarrationLoadError('no narration pools found', 'content/narration/*.json');
    }

    const lines: NarrationLine[] = [];
    const seen = new Map<string, string>();

    for (const file of files) {
      const module = await poolModules[file]();
      const parsed = NarrationPoolSchema.safeParse(module.default);
      if (!parsed.success) {
        throw new NarrationLoadError(`invalid narration pool: ${parsed.error.message}`, file);
      }
      for (const line of parsed.data.lines) {
        // An id collision would silently break the cooldown and anti-repeat
        // window, which key on it — two different lines sharing an id would
        // suppress each other and read as a thin pool.
        const previous = seen.get(line.id);
        if (previous) {
          throw new NarrationLoadError(`duplicate line id '${line.id}' (also in ${previous})`, file);
        }
        seen.set(line.id, file);
        lines.push(line as NarrationLine);
      }
    }

    cached = Object.freeze(lines);
    return cached;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

/** Test-only: drop the session cache so a spec can load twice. */
export function resetNarrationCache(): void {
  cached = null;
  inFlight = null;
}
