// persist.ts — versioned localStorage save/load (DESIGN.md §11). Saving is
// convenience, never a hard dependency: a corrupt or missing save must fall
// back to a clean restart, never throw.

import { CareerStateSchema } from './schema';
import { initialCareerState, type CareerState } from './store';

const STORAGE_KEY = 'cage:save';
// Loop 6.4: Fighter gained a required `face` field. A v1 envelope has no such
// field on its saved player/opponent, and CareerStateSchema now requires it, so a
// v1 save would fail validation anyway — bumping the version makes that a clean,
// intentional "discard and restart" instead of a schema-validation surprise
// (§14 accepts losing a save costs one session).
// Loop 7.1: CareerState gained a required `seed` (§16.2). A v2 envelope has
// none, so it would fail validation anyway — the bump makes that an intentional
// "discard and restart" rather than a schema surprise, and `status: 'discarded'`
// now lets the caller say so out loud instead of silently starting over.
// Loop 7.4: `record` moved from CareerState onto Fighter (§16.5). A v3 envelope
// has it in the old place, so the new FighterSchema rejects it and the old
// CareerStateSchema field is gone — the bump makes that an intentional discard
// rather than a schema surprise, same as the two bumps above.
// Loop 7.6: `nickname` joins Fighter as a required (nullable) field, so a v4
// envelope's player fails FighterSchema. Same intentional discard as above.
// Loop 7.7: FaceCode went 9 slots to 12, and `build` was inserted at index 1.
// `face` is still just a string to the schema, so a v5 save would LOAD — and
// silently decode to a different face, because every slot after `skin` has
// shifted one place. A wrong face is worse than a discarded one: the player
// would think the editor lied to them. Hence the bump.
// Loop 7.8: CareerState gained a required `gymId` (§16.8). A v6 envelope has
// none, so it fails validation — the bump makes that an intentional discard.
// Loop 7.9: CareerState gained required `coach` and `currentGym` (§16.8). Both
// are nullable, so a v7 envelope missing them would FAIL validation rather than
// load — Zod treats a missing key as undefined, not null. The bump makes the
// discard intentional rather than a schema surprise, same as every bump above.
const SAVE_VERSION = 8;
const DEBOUNCE_MS = 500;

interface SaveEnvelope {
  version: number;
  career: CareerState;
}

/**
 * Why `loadCareer` returned what it returned (§16.2).
 *
 *   'empty'     — no save existed. A first run.
 *   'loaded'    — a save existed and was restored.
 *   'discarded' — a save existed and could not be used: malformed JSON, a
 *                 failed schema parse, or an unknown version. The player lost
 *                 a career and is owed an explanation, which is exactly what
 *                 the old signature could not express.
 */
export type LoadStatus = 'empty' | 'loaded' | 'discarded';

export interface LoadResult {
  career: CareerState;
  status: LoadStatus;
}

let debounceTimer: ReturnType<typeof setTimeout> | undefined;

function defaultStorage(): Storage {
  return window.localStorage;
}

function writeNow(career: CareerState, storage: Storage): void {
  const envelope: SaveEnvelope = { version: SAVE_VERSION, career };
  storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
}

// Debounced by default so rapid store updates (e.g. slider drags in camp
// allocation) don't hit localStorage on every tick.
export function saveCareer(career: CareerState, storage: Storage = defaultStorage()): void {
  if (debounceTimer !== undefined) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => writeNow(career, storage), DEBOUNCE_MS);
}

// Bypasses the debounce — for explicit "save now" actions or tests.
export function saveCareerImmediate(career: CareerState, storage: Storage = defaultStorage()): void {
  if (debounceTimer !== undefined) {
    clearTimeout(debounceTimer);
    debounceTimer = undefined;
  }
  writeNow(career, storage);
}

// Never throws. Returns the initial (empty) career state on any failure:
// missing key, malformed JSON, schema mismatch, or an unknown save version —
// and, since Loop 7.1, says which of those happened. The never-throws contract
// and the clean-restart fallback are unchanged (§16.2).
export function loadCareer(storage: Storage = defaultStorage()): LoadResult {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return { career: initialCareerState, status: 'empty' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { career: initialCareerState, status: 'discarded' };
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('version' in parsed) ||
    !('career' in parsed) ||
    (parsed as { version: unknown }).version !== SAVE_VERSION
  ) {
    return { career: initialCareerState, status: 'discarded' };
  }

  const result = CareerStateSchema.safeParse((parsed as SaveEnvelope).career);
  return result.success
    ? { career: result.data, status: 'loaded' }
    : { career: initialCareerState, status: 'discarded' };
}

export function clearCareer(storage: Storage = window.localStorage): void {
  if (debounceTimer !== undefined) {
    clearTimeout(debounceTimer);
    debounceTimer = undefined;
  }
  storage.removeItem(STORAGE_KEY);
}
