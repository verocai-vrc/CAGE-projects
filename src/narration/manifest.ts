// narration/manifest.ts — Loop 7.10: what the engine can actually emit
// (DESIGN.md §16.1, §16.6).
//
// "Reachability is narrower than the type." Of the variants `FightEvent`
// permits, only some are emitted by any code path. `landed: false`,
// `position: 'clinch'` and `position: 'bottomControl'` are unreachable by
// construction — no code path emits them — so a coverage test that walked the
// type union and demanded lines for them would be demanding content for events
// that can never fire.
//
// Hence a manifest, checked IN BOTH DIRECTIONS (tests/reachability.spec.ts):
// make `position: 'clinch'` reachable and the test fails until lines exist for
// it; break `knockdown` and the test fails too. A naive enum walk catches only
// one of those.
//
// This file deliberately holds no imports from /engine. `eventVariant` is typed
// structurally so /narration stays free of engine imports per Appendix B; the
// test supplies real `FightEvent`s and they satisfy it.

/**
 * A `FightEvent`, structurally. Narrowed by `t` exactly as the engine's union
 * is, without importing the union itself.
 */
export interface VariantSource {
  t: string;
  [field: string]: unknown;
}

/**
 * The stable key for one event variant.
 *
 * The shape is `type[:discriminator...]`, chosen so a variant reads as itself in
 * a failure message — a test that says `position:clinch` appeared is legible in
 * a way that an index into a union is not.
 */
export function eventVariant(event: VariantSource): string {
  switch (event.t) {
    case 'strike':
      return `strike:${event.kind}:landed=${event.landed}`;
    case 'takedown':
      return `takedown:success=${event.success}`;
    case 'position':
      return `position:${event.state}`;
    case 'knockdown':
      return 'knockdown';
    case 'submissionAttempt':
      return `submissionAttempt:escaped=${event.escaped}`;
    case 'cornerCall':
      return 'cornerCall';
    case 'playerMoment':
      return `playerMoment:${event.kind}:${event.outcome}:${event.played ? 'played' : 'auto'}`;
    case 'roundEnd':
      return 'roundEnd';
    case 'checkEnd':
      return `checkEnd:winner=${event.winner}`;
    case 'finish':
      return `finish:${event.method}`;
    default:
      // A new event type must be classified deliberately, not silently absorbed
      // into a bucket that then never gets lines written for it.
      return `UNCLASSIFIED:${event.t}`;
  }
}

/**
 * Every variant the shipped engine emits. Measured, not enumerated from the
 * type — see tests/reachability.spec.ts, which re-measures on every run and
 * fails if this list drifts in either direction.
 *
 * Three groups of entries here are NOT in §16.1's original list, and each has a
 * reason the list moved rather than the measurement being wrong:
 *
 *   `knockdown` and `finish:TKO` — §16.1 recorded both as "unreachable until the
 *   damage re-tune" and measured them firing 0 times in 400 bouts. Loop 7.2 ran
 *   that re-tune. They are now among the more common variants (knockdown fires
 *   ~1.2 times per bout), which is the re-tune working.
 *
 *   `checkEnd:winner=*` — the §6.6a per-minute checks postdate §16.1's
 *   measurement. §16.6a settles how they narrate: they fold into the beat kinds
 *   that already exist, so they add manifest entries but no `BeatKind`.
 *
 *   `playerMoment:*:*:played` — §16.1's list names these, but they only appear
 *   when moment overrides are supplied. The reachability test supplies them, per
 *   §16.6's "with corner tactics supplied".
 */
export const REACHABLE_EVENT_VARIANTS: readonly string[] = Object.freeze([
  'checkEnd:winner=a',
  'checkEnd:winner=b',
  'checkEnd:winner=even',
  'cornerCall',
  'finish:KO',
  'finish:SUB',
  'finish:TKO',
  'knockdown',
  'playerMoment:finishingSequence:fail:auto',
  'playerMoment:finishingSequence:fail:played',
  'playerMoment:finishingSequence:success:auto',
  'playerMoment:finishingSequence:success:played',
  'playerMoment:scramble:fail:auto',
  'playerMoment:scramble:fail:played',
  'playerMoment:scramble:success:auto',
  'playerMoment:scramble:success:played',
  'playerMoment:submissionEscape:fail:auto',
  'playerMoment:submissionEscape:fail:played',
  'playerMoment:submissionEscape:success:auto',
  'playerMoment:submissionEscape:success:played',
  'position:standing',
  'position:topControl',
  'roundEnd',
  'strike:groundStrike:landed=true',
  'strike:strike:landed=true',
  'submissionAttempt:escaped=false',
  'submissionAttempt:escaped=true',
  'takedown:success=false',
  'takedown:success=true',
]);

/**
 * Variants the type permits but no code path emits (§16.1). Kept explicit
 * rather than implied by absence: the reachability test asserts none of these
 * is ever observed, so "we made clinch reachable and forgot to write lines for
 * it" fails loudly instead of silently widening the manifest.
 */
export const UNREACHABLE_BY_CONSTRUCTION: readonly string[] = Object.freeze([
  'strike:strike:landed=false',
  'strike:groundStrike:landed=false',
  'position:clinch',
  'position:bottomControl',
]);
