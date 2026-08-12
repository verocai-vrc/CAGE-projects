// Round tick resolution: stamina feedback (§6.3), striking and position
// exchanges (§6.1-6.2), and damage/finish rolls (§6.4). Everything routes
// through the one logistic dial (rng.ts's rollLogistic) — no special-cased
// scripting, per DESIGN.md's "do NOT roll for KO directly" rule.

import type { Attributes } from './types';
import type { RNG } from './rng';
import { rollLogistic } from './rng';

const MAX_STAMINA = 100;

export interface StaminaBalance {
  staminaDrainBase: number;
  cardioDrainScale: number;
}

export function staminaDrainPerTick(cardio: number, balance: StaminaBalance): number {
  return balance.staminaDrainBase * (1 - balance.cardioDrainScale * (cardio / 100));
}

export function tickStamina(stamina: number, cardio: number, balance: StaminaBalance): number {
  const drained = stamina - staminaDrainPerTick(cardio, balance);
  return Math.max(0, Math.min(MAX_STAMINA, drained));
}

// Multiplier applied to accuracy / takedown defense / effective chin.
export function staminaFactor(stamina: number): number {
  return stamina / MAX_STAMINA;
}

// Runs the tick loop for a fighter of fixed cardio, starting at full stamina.
export function simulateStaminaCurve(cardio: number, balance: StaminaBalance, ticks: number): number[] {
  const curve: number[] = [];
  let stamina = MAX_STAMINA;
  for (let i = 0; i < ticks; i++) {
    stamina = tickStamina(stamina, cardio, balance);
    curve.push(stamina);
  }
  return curve;
}

// --- Pillars (§4.1) — derived, never stored. ---

export interface Pillars {
  striking: number;
  grappling: number;
  durability: number;
  mind: number;
}

export function computePillars(attributes: Attributes): Pillars {
  return {
    striking: (attributes.power + attributes.technique + attributes.speed) / 3,
    grappling: (attributes.wrestling + attributes.groundControl) / 2,
    durability: (attributes.chin + attributes.cardio) / 2,
    mind: attributes.fightIQ,
  };
}

// --- Striking (§6.1-6.2) ---

// Whether a strike attempt lands: striking pillar vs striking pillar,
// each scaled by the fighter's current stamina (§6.3 — stamina multiplies
// accuracy and takedown defense).
export function resolveStrike(
  attackerStriking: number,
  attackerStamina: number,
  defenderStriking: number,
  defenderStamina: number,
  k: number,
  rng: RNG,
): boolean {
  const effectiveAttack = attackerStriking * staminaFactor(attackerStamina);
  const effectiveDefense = defenderStriking * staminaFactor(defenderStamina);
  return rollLogistic(effectiveAttack, effectiveDefense, k, rng);
}

export function strikeDamage(power: number, baseStrikeDamage: number): number {
  return baseStrikeDamage * (power / 100);
}

// --- Position (§6.2) ---

// A position-change attempt (e.g. a takedown): grappling pillar vs
// grappling pillar, stamina-scaled the same way as striking.
export function resolvePositionChange(
  attackerGrappling: number,
  attackerStamina: number,
  defenderGrappling: number,
  defenderStamina: number,
  k: number,
  rng: RNG,
): boolean {
  const effectiveAttack = attackerGrappling * staminaFactor(attackerStamina);
  const effectiveDefense = defenderGrappling * staminaFactor(defenderStamina);
  return rollLogistic(effectiveAttack, effectiveDefense, k, rng);
}

// --- Damage and finishes (§6.4 — do NOT roll for KO directly) ---

// Already folds in accumulated damage, current stamina, and the weight-cut
// penalty (cutPenalty <= 1, from weightcut.ts — Loop 1.6; pass 1 until then).
export function effectiveChin(
  chin: number,
  health: number,
  maxHealth: number,
  stamina: number,
  cutPenalty: number,
): number {
  return chin * (health / maxHealth) * staminaFactor(stamina) * cutPenalty;
}

// Per-landed-strike KO/TKO roll: power vs the defender's effectiveChin,
// through the shared logistic form at kFinish. Submissions reuse this same
// form on the grappling delta (attacker's grappling vs the defender's
// stamina-scaled ground defense), gated by dominant position at the
// call site — no separate finish function needed.
export function rollFinish(attackValue: number, effectiveDefense: number, kFinish: number, rng: RNG): boolean {
  return rollLogistic(attackValue, effectiveDefense, kFinish, rng);
}
