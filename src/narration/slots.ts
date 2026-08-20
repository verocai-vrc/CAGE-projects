// narration/slots.ts — Loop 7.12: total slot resolution (DESIGN.md §16.6).
//
// §16.6: "Slot resolution is TOTAL. A fighter without a nickname must never
// render {NICK_A}. Lines using an optional slot carry the matching tag
// (needsNickname, needsGym) and the selector filters them out when the slot is
// unavailable — never a fallback string, which is how 'Riko "undefined" Tanaka'
// reaches a screenshot."
//
// That sentence sets the architecture. There is no default, no placeholder, and
// no empty-string substitution anywhere in this file: a line whose slots cannot
// all be filled is not selected in the first place (see `canFill`). Resolution
// then cannot fail, which is what "total" means.

import type { NarrationLine } from './types';
import { OPTIONAL_SLOT_TAGS, slotsIn } from './types';

/**
 * What narration knows about one fighter.
 *
 * A deliberately small projection rather than `Fighter` itself: /narration is
 * pure over data it is handed, and a selector that took the whole fighter would
 * invite reading attributes it has no business narrating from. The caller maps
 * (Loops 7.15/7.16).
 */
export interface FighterView {
  name: string;
  /** null for the ~35% who never get one (§16.5). Guards `{NICK_*}`. */
  nickname: string | null;
  /** null when the fighter has no gym to name. Guards `{GYM_*}`. */
  gym: string | null;
  /** Displayed record, e.g. "12-3". Fills `{N}`. */
  record: string;
}

export interface SlotContext {
  a: FighterView;
  b: FighterView;
  /** The beat's round, for `{R}`. */
  round: number;
  /** The technique a beat names, for `{TECH}`, when it has one. */
  technique?: string;
}

/** The last word of a name — `{LAST_A}` / `{LAST_B}`. */
function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1];
}

/**
 * Resolve one slot, or `null` when it cannot be filled.
 *
 * `null` is the signal `canFill` reads. It never becomes text.
 */
function slotValue(slot: string, context: SlotContext): string | null {
  switch (slot) {
    case 'A': return context.a.name;
    case 'B': return context.b.name;
    case 'NICK_A': return context.a.nickname;
    case 'NICK_B': return context.b.nickname;
    case 'LAST_A': return lastName(context.a.name);
    case 'LAST_B': return lastName(context.b.name);
    case 'GYM_A': return context.a.gym;
    case 'GYM_B': return context.b.gym;
    case 'R': return String(context.round);
    case 'N': return context.a.record;
    case 'TECH': return context.technique ?? null;
    default: return null;
  }
}

/**
 * Can every slot in this line be filled right now?
 *
 * This is the filter §16.6 requires, and it is checked against the actual
 * values rather than against the line's tags alone. Tags are an authoring aid —
 * `needsNickname` documents intent and the content lint can check it — but a
 * line that forgot its tag must still not render "{NICK_A}" as the literal
 * string, so the real gate is whether the value exists.
 */
export function canFill(line: NarrationLine, context: SlotContext): boolean {
  return slotsIn(line.text).every((slot) => slotValue(slot, context) !== null);
}

/**
 * Fill every slot in a template.
 *
 * Total by construction: `canFill` has already established every slot resolves,
 * so this cannot produce a placeholder. It throws rather than degrading if that
 * invariant is ever broken, because a silent "{NICK_A}" on screen is the exact
 * failure §16.6 is legislating against — better a loud test failure than a
 * screenshot with a hole in it.
 */
export function fillSlots(text: string, context: SlotContext): string {
  return text.replace(/\{([A-Z_]+)\}/g, (match, slot: string) => {
    const value = slotValue(slot, context);
    if (value === null) {
      throw new Error(
        `unfillable slot ${match} reached fillSlots — canFill should have excluded this line`,
      );
    }
    return value;
  });
}

/**
 * The tags a line ought to carry, given the slots it uses.
 *
 * Used by the content check rather than by selection: `canFill` gates on values,
 * so a missing tag cannot put a placeholder on screen — it just makes the line
 * silently rarer than the author intended, which is worth failing a test over.
 */
export function requiredTagsFor(text: string): string[] {
  const tags = new Set<string>();
  for (const slot of slotsIn(text)) {
    const tag = OPTIONAL_SLOT_TAGS[slot];
    if (tag) tags.add(tag);
  }
  return [...tags].sort();
}
