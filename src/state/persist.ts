// persist.ts — localStorage load/save/migrate, debounced (DESIGN.md §11).
//
// Saving is convenience, never a dependency: any failure to read back a
// valid save (corrupt JSON, failed schema validation, a version bump with
// no migration path) falls back to a clean restart — it must never throw
// out to the caller.

import { CareerStateSchema } from './schema';
import type { CareerState } from '../career/types';

// Minimal shape persist.ts actually needs from Storage, so tests can supply
// an in-memory fake instead of requiring a DOM/localStorage environment.
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const SAVE_KEY = 'cage:save';
const SAVE_VERSION = 1;

interface SavePayload {
  version: number;
  career: CareerState;
}

function defaultStorage(): StorageLike | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

// Zod-validated load with a migration-or-clean-restart fallback. There is no
// migration path yet (SAVE_VERSION has only ever been 1) — a version
// mismatch takes the same clean-restart branch as a validation failure.
export function loadCareer(storage: StorageLike | null = defaultStorage()): CareerState | null {
  if (!storage) return null;

  const raw = storage.getItem(SAVE_KEY);
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    storage.removeItem(SAVE_KEY);
    return null;
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    (parsed as { version?: unknown }).version !== SAVE_VERSION
  ) {
    storage.removeItem(SAVE_KEY);
    return null;
  }

  const result = CareerStateSchema.safeParse((parsed as SavePayload).career);
  if (!result.success) {
    storage.removeItem(SAVE_KEY);
    return null;
  }

  return result.data;
}

export function saveCareerNow(career: CareerState, storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  const payload: SavePayload = { version: SAVE_VERSION, career };
  storage.setItem(SAVE_KEY, JSON.stringify(payload));
}

export function clearSave(storage: StorageLike | null = defaultStorage()): void {
  storage?.removeItem(SAVE_KEY);
}

const DEBOUNCE_MS = 500;

// Returns a debounced save function bound to one storage target — used to
// coalesce rapid store updates (e.g. dragging a camp-week allocation slider)
// into a single write.
export function createDebouncedSaver(
  storage: StorageLike | null = defaultStorage(),
  delayMs = DEBOUNCE_MS,
): (career: CareerState) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return function scheduleSave(career: CareerState) {
    if (!storage) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      saveCareerNow(career, storage);
    }, delayMs);
  };
}
