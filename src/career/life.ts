// life.ts — Loop 4.1: the life bars (DESIGN.md §8.3) and their neglect
// penalties. Every bar decays each week if unfed — the "permanently short of
// something" tension DESIGN.md calls out — and camp.ts's `life` allocation
// pillar is the only thing that counteracts it, competing for the same
// weekly energy budget as training/weight-management/rest.
//
// `hype` isn't tracked here even though DESIGN.md's table lists it alongside
// these bars: it's already a top-level CareerState field fed by fight
// outcomes (progression.ts). This module only adds its *weekly* decay.

export interface LifeBars {
  trainingPartners: number; // 0..100 — neglect: camp training gains lose their multiplier
  partner: number; // 0..100 — neglect: rest regen drops, a "focus penalty" in camp
  sponsors: number; // 0..100 — neglect: matchmaking offers pay less
}

export const initialLifeBars: LifeBars = { trainingPartners: 100, partner: 100, sponsors: 100 };

export interface LifeBalance {
  weeklyDecay: { partner: number; hype: number; sponsor: number; trainingPartners: number };
  lifeGainPerEnergy: number;
}

function clamp100(value: number): number {
  return Math.max(0, Math.min(100, value));
}

// Pure: applies one week's decay to every bar (and hype), then feeds back in
// whatever the player spent this week's `life` camp energy on, split evenly
// across the three bars — hype isn't fed by camp energy, only by fighting.
export function resolveLifeWeek(
  bars: LifeBars,
  hype: number,
  lifeEnergy: number,
  balance: LifeBalance,
): { bars: LifeBars; hype: number } {
  const gainPerBar = (Math.max(0, lifeEnergy) * balance.lifeGainPerEnergy) / 3;

  return {
    bars: {
      trainingPartners: clamp100(bars.trainingPartners - balance.weeklyDecay.trainingPartners + gainPerBar),
      partner: clamp100(bars.partner - balance.weeklyDecay.partner + gainPerBar),
      sponsors: clamp100(bars.sponsors - balance.weeklyDecay.sponsor + gainPerBar),
    },
    hype: clamp100(hype - balance.weeklyDecay.hype),
  };
}

// Derived multipliers — the only channels life bars are allowed to act
// through (DESIGN.md's table maps neatly onto camp.ts's gain multipliers and
// matchmaking.ts's offer quality; nothing here reaches further than that).
export function trainingPartnerQuality(bars: LifeBars): number {
  return bars.trainingPartners / 100;
}

export function campFocusMultiplier(bars: LifeBars): number {
  return bars.partner / 100;
}

// Floored at 0.5 so a fully-neglected sponsor bar dents offers without ever
// zeroing a purse outright — losing sponsors shouldn't end the career on its
// own, that's the injury/health floor's job (progression.ts's retirement check).
export function sponsorPurseMultiplier(bars: LifeBars): number {
  return 0.5 + 0.5 * (bars.sponsors / 100);
}
