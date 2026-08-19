// shareCard.ts — Loop 5.2: the Wordle-style shareable result (DESIGN.md
// §8.5). computeCareerCardData is the single source of truth for the
// numbers Loop 3.5's CareerCardScreen renders — pulling it out here means
// the on-screen table and the share text can never drift apart. Only a
// player-chosen name and numbers already shown on the card ever reach the
// output text: no fighter/judge ids, no seeds, no JSON.

import type { FightSummary } from '../engine/types';
import type { CareerState } from '../state/store';

const FINISH_METHODS = new Set(['KO', 'TKO', 'SUB']);

export function computeGrade(winRate: number, finishRate: number): string {
  const score = winRate * 70 + finishRate * 30;
  if (score >= 85) return 'S';
  if (score >= 70) return 'A';
  if (score >= 55) return 'B';
  if (score >= 40) return 'C';
  if (score >= 25) return 'D';
  return 'F';
}

export type FightOutcomeGlyph = 'win-finish' | 'win-decision' | 'loss' | 'draw';

function classifyFight(summary: FightSummary, playerId: string): FightOutcomeGlyph {
  if (summary.winnerId === null) return 'draw';
  if (summary.winnerId !== playerId) return 'loss';
  return FINISH_METHODS.has(summary.method) ? 'win-finish' : 'win-decision';
}

export interface CareerCardData {
  archetype: string;
  retired: boolean;
  wins: number;
  losses: number;
  draws: number;
  noContests: number;
  finishes: number;
  finishRate: number; // 0..1
  winRate: number; // 0..1
  ranking: number | null;
  purse: number;
  grade: string;
  fightGlyphs: FightOutcomeGlyph[]; // chronological, one per recorded fight
}

// Pure: null when there's no active career (nothing to show or share yet).
export function computeCareerCardData(career: CareerState): CareerCardData | null {
  if (!career.player) return null;
  // Loop 7.4 (§16.5): the record comes off the fighter now — `career.record`
  // is gone, and `career.player.record` is the single source.
  const { player, fightHistory, purse, ranking, retired } = career;
  const record = player.record;

  const fightGlyphs = fightHistory.map((fight) => classifyFight(fight, player.id));
  const finishes = fightGlyphs.filter((g) => g === 'win-finish').length;
  const totalFights = record.wins + record.losses + record.draws;
  const winRate = totalFights > 0 ? record.wins / totalFights : 0;
  const finishRate = totalFights > 0 ? finishes / totalFights : 0;

  return {
    archetype: player.archetype,
    retired,
    wins: record.wins,
    losses: record.losses,
    draws: record.draws,
    noContests: record.noContests,
    finishes,
    finishRate,
    winRate,
    ranking,
    purse,
    grade: computeGrade(winRate, finishRate),
    fightGlyphs,
  };
}

const GLYPH: Record<FightOutcomeGlyph, string> = {
  'win-finish': '🟩',
  'win-decision': '🟨',
  loss: '🟥',
  draw: '⬜',
};

// Pure: title line, one stat line, a status line, and a Wordle-style row of
// result glyphs — readable at a glance, distinct across different outcomes.
export function formatShareText(card: CareerCardData, playerName: string): string {
  const record = `${card.wins}-${card.losses}-${card.draws}${card.noContests > 0 ? ` (${card.noContests} NC)` : ''}`;
  const ranking = card.ranking === null ? 'Unranked' : `#${card.ranking}`;
  const status = card.retired ? 'Retired' : 'Active';
  const glyphs = card.fightGlyphs.length > 0 ? card.fightGlyphs.map((g) => GLYPH[g]).join('') : '—';

  return [
    `CAGE — ${playerName} (${card.archetype})`,
    `${record} · ${card.finishes} finishes · Grade ${card.grade}`,
    `${status} · ${ranking} · $${card.purse.toLocaleString('en-US')}`,
    glyphs,
  ].join('\n');
}
