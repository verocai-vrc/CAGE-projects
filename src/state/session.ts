// session.ts — Loop 7.1: the wiring that makes persistence actually run.
//
// persist.ts has been complete and tested since Loop 3.1 and called by no
// application code — `loadCareer`/`saveCareer` appeared only in
// tests/persist.spec.ts. Nothing was ever written, so nothing ever survived a
// reload. This is the twenty lines that were missing.
//
// Deliberately not a hook and not a component: hydration has to happen once,
// before the first render, and a `useEffect` in App would let the empty initial
// state paint first and — worse — let the autosave subscription overwrite a real
// save with that empty state before the load landed. main.tsx calls this ahead
// of `render`.

import { loadCareer, saveCareer, type LoadStatus } from './persist';
import { useCageStore } from './store';

let loadStatus: LoadStatus = 'empty';
let started = false;

/**
 * Why the session started the way it did — 'empty' on a first run, 'loaded'
 * when a save was restored, 'discarded' when one existed and could not be used.
 *
 * §16.2 routes this to the title screen so a dropped save gets a plain
 * explanation rather than a silent restart. That screen is Loop 8.2; until it
 * exists this is recorded rather than displayed, which is the honest order —
 * the status has to be captured at hydration time or it is gone.
 */
export function sessionLoadStatus(): LoadStatus {
  return loadStatus;
}

/**
 * Restore any saved career into the store, then keep the store written back.
 *
 * Idempotent: calling it twice is a no-op, so a hot reload in dev does not end
 * up with two subscriptions racing to write the same key.
 */
export function startSession(storage?: Storage): LoadStatus {
  if (started) return loadStatus;
  started = true;

  // Passing `undefined` through falls to persist.ts's own default parameter
  // (window.localStorage), so tests can inject a storage without app code
  // needing to know one exists.
  const result = loadCareer(storage);
  loadStatus = result.status;
  if (result.status === 'loaded') {
    useCageStore.getState().setCareer(result.career);
  }

  // Every store change is written back, debounced inside saveCareer (500ms) so
  // a BudgetSplit drag does not hit localStorage on every pointer move.
  //
  // Subscribing AFTER hydration matters: subscribing first would fire on the
  // hydrating `setCareer` and write the save back over itself, which is
  // harmless today but stops being harmless the moment a migration rewrites
  // state on load.
  useCageStore.subscribe((state, prev) => {
    if (state.career === prev.career) return;
    saveCareer(state.career, storage);
  });

  return loadStatus;
}

/** Test seam: forget that a session was started. Never called by app code. */
export function resetSessionForTests(): void {
  started = false;
  loadStatus = 'empty';
}
