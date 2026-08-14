// persist.ts — versioned localStorage save/load (DESIGN.md §11). Saving is
// convenience, never a hard dependency: a corrupt or missing save must fall
// back to a clean restart, never throw.

import { CareerStateSchema } from './schema';
import { initialCareerState, type CareerState } from './store';

const STORAGE_KEY = 'cage:save';
const SAVE_VERSION = 1;
const DEBOUNCE_MS = 500;

interface SaveEnvelope {
  version: number;
  career: CareerState;
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
// missing key, malformed JSON, schema mismatch, or an unknown save version.
export function loadCareer(storage: Storage = defaultStorage()): CareerState {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return initialCareerState;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return initialCareerState;
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('version' in parsed) ||
    !('career' in parsed) ||
    (parsed as { version: unknown }).version !== SAVE_VERSION
  ) {
    return initialCareerState;
  }

  const result = CareerStateSchema.safeParse((parsed as SaveEnvelope).career);
  return result.success ? result.data : initialCareerState;
}

export function clearCareer(storage: Storage = window.localStorage): void {
  if (debounceTimer !== undefined) {
    clearTimeout(debounceTimer);
    debounceTimer = undefined;
  }
  storage.removeItem(STORAGE_KEY);
}
