// Career-layer state (DESIGN.md §8, §11). This is what gets persisted —
// distinct from the engine's own types (Fighter, Origin, FightSummary),
// which the career layer composes rather than redefines.

import type { Fighter, FightSummary, Origin } from '../engine/types';

export interface CareerRecord {
  wins: number;
  losses: number;
  draws: number;
  noContests: number;
}

export interface CareerState {
  fighter: Fighter;
  origin: Origin;
  week: number; // camp weeks resolved so far
  purse: number; // accumulated career earnings
  hype: number; // 0..100, feeds matchmaking offer quality and purse size
  ranking: number | null; // null = unranked, 1 = champion
  record: CareerRecord;
  fightHistory: FightSummary[]; // compact, persistable — never the full event log
  retired: boolean;
}
