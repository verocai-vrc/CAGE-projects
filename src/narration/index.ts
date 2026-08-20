// narration/index.ts — Loop 7.10 (DESIGN.md §16.6).
//
// Types, the manifest, and beat extraction are safe to import from anywhere:
// pure code over data, no content behind them.
//
// The content LOADER is deliberately not here and not even in this directory —
// it lives in content/narration.ts, because Appendix B bans /narration from
// importing /state and validating a pool needs the schema. Importing it pulls
// the pool glob with it, so fight night imports `content/narration` directly
// (Loops 7.15/7.16); a barrel that dragged the chunk into the initial bundle
// would defeat §16.9's whole reason for splitting it.

export * from './types';
export * from './manifest';
export * from './beats';
export * from './slots';
export * from './select';
