// narration/index.ts — Loop 7.10 (DESIGN.md §16.6).
//
// Types and the manifest are safe to import from anywhere: they are pure data
// and cost a few hundred bytes. `load.ts` is deliberately NOT re-exported here —
// importing it pulls the pool glob, and a barrel that quietly dragged the
// narration chunk into the initial bundle would defeat §16.9's whole reason for
// splitting it. Import `narration/load` directly, from fight night only.

export * from './types';
export * from './manifest';
