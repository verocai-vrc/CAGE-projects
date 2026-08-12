// Per-tick stamina feedback loop (DESIGN.md §6.3) — "worth more than ten
// extra attributes." No strikes, damage, or finishes yet; those land in
// Loop 1.4. Stamina drain scales inversely with cardio; current stamina
// multiplies accuracy, takedown defense, and effective chin via
// staminaFactor().

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
// Placeholder harness for Loop 1.3 — round.ts grows strike/position
// resolution against this same stamina state in Loop 1.4.
export function simulateStaminaCurve(cardio: number, balance: StaminaBalance, ticks: number): number[] {
  const curve: number[] = [];
  let stamina = MAX_STAMINA;
  for (let i = 0; i < ticks; i++) {
    stamina = tickStamina(stamina, cardio, balance);
    curve.push(stamina);
  }
  return curve;
}
