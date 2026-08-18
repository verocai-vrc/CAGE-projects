// CareerScreen.tsx — Loop 3.5: the career hub that closes the M3 loop
// (camp -> fight -> aftermath -> retire). Fight resolution here is
// simulate-and-report, not the interactive round-by-round playback
// (FightScreen, M2) — wiring the two together is a later concern. Loop 4.4
// replaced the Loop 3.5 stub Origin with the real §9.3 skip path: an
// RNG-rolled Origin through the same buildOriginFromChoices fold the
// amateur wrapper uses, so this entry point and #/chargen's are identical
// from startCareer's point of view. Loop 6.7 rebuilds the hub on the
// component kit — Sheet/FormRow for the filed readings, Stamp for the
// retirement verdict.

import { useState } from 'preact/hooks';
import { mulberry32, seedFromString, simulateFight } from '../../engine';
import type { Fighter, Tactics } from '../../engine/types';
import { amateurMoments, archetypes, balance, lifeEvents, namePools } from '../../content';
import { generateOpponent, offerQuality } from '../../career/matchmaking';
import { faceFromSeed, serializeFaceCode } from '../portrait/faceCode';
import { applyAftermath, checkRetirement, startCareer } from '../../career/progression';
import { rollRandomOrigin } from '../../career/origin';
import { buildDailySetup } from '../../career/daily';
import { sponsorPurseMultiplier } from '../../career/life';
import { classifyCut, initialCutProgress } from '../../career/weightcut';
import { useCageStore } from '../../state/store';
import { Button } from '../components/Button';
import { FighterIdentity } from '../components/FighterIdentity';
import { FormRow } from '../components/FormRow';
import { Screen } from '../components/Screen';
import { Sheet } from '../components/Sheet';
import { Stamp } from '../components/Stamp';

// Local calendar date (not UTC) so "today" matches the player's own clock —
// DESIGN.md §11's daily challenge is meant to change at midnight for them,
// not at UTC midnight.
function todayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function CareerScreen() {
  const career = useCageStore((s) => s.career);
  const setCareer = useCageStore((s) => s.setCareer);
  const [lastFight, setLastFight] = useState<string | null>(null);

  function skipToRandomProspect() {
    const rng = mulberry32(seedFromString(`skip-${Date.now()}`));
    const origin = rollRandomOrigin(amateurMoments, rng);
    // §9.3/§15.4: the skip path rolls a face from its own seed and shows no
    // editor — this is that roll, drawn after the origin from the same stream.
    const face = serializeFaceCode(faceFromSeed(rng));
    setCareer(startCareer(origin, 'player-1', 'Your Fighter', undefined, undefined, face));
    setLastFight(null);
  }

  // DESIGN.md §8.5/§11: everyone who plays today's prospect gets the same
  // origin (and, once camp draws from the deck, the same event order) —
  // buildDailySetup derives both from today's date string alone.
  function startTodaysProspect() {
    const { origin } = buildDailySetup(todayDateString(), amateurMoments, lifeEvents);
    // Same seed as the origin (the date string), so today's prospect has the same
    // face for every player — Loop 5.1's determinism contract extended to faces.
    const rng = mulberry32(seedFromString(todayDateString()));
    const face = serializeFaceCode(faceFromSeed(rng));
    setCareer(startCareer(origin, 'player-1', 'Your Fighter', undefined, undefined, face));
    setLastFight(null);
  }

  function findFightAndResolve() {
    if (!career.player) return;
    const rng = mulberry32(seedFromString(`${career.player.id}-${career.fightHistory.length}-${Date.now()}`));
    const opponent: Fighter = generateOpponent(
      archetypes,
      namePools,
      rng,
      { weightClass: career.player.weightClass, idPrefix: 'opp' },
      (faceRng) => serializeFaceCode(faceFromSeed(faceRng)),
    );
    const offer = offerQuality(career.ranking, career.hype, balance, sponsorPurseMultiplier(career.lifeBars));
    const cutQuality = classifyCut(career.weightCutProgress, balance);
    const tactics: Tactics = { [career.player.id]: { cutQuality, rounds: {} } };
    const result = simulateFight(career.player, opponent, tactics, rng);
    const after = applyAftermath(career, career.player, result, offer, balance, rng);
    const retired = checkRetirement(after, balance);

    // The cut is a single-use camp-long resource — consumed on fight night,
    // discipline has to be rebuilt from scratch for the next one.
    setCareer({ ...after, retired, weightCutProgress: initialCutProgress });
    const outcome =
      result.winnerId === career.player.id ? 'won' : result.winnerId === opponent.id ? 'lost' : 'drew';
    setLastFight(`You ${outcome} vs ${opponent.name} by ${result.method} (${cutQuality} cut).`);
  }

  if (!career.player) {
    return (
      <Screen register="file" id="career-screen" title="CAGE" plate="home">
        <Sheet>
          <p>No active career.</p>
          <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap', marginTop: 'var(--sp-3)' }}>
            <a href="#/chargen">
              <Button variant="primary">Create your fighter</Button>
            </a>
            <Button variant="ghost" onClick={skipToRandomProspect}>
              Skip: random prospect
            </Button>
            <Button variant="ghost" onClick={startTodaysProspect}>
              Today's prospect
            </Button>
          </div>
        </Sheet>
      </Screen>
    );
  }

  const totalFights = career.record.wins + career.record.losses + career.record.draws;

  return (
    <Screen register="file" id="career-screen" eyebrow="Career file" title={career.player.name} plate="home">
      {/* The player is the one fighter whose record has a real source today — it
          lives on CareerState. An opponent's stays empty until Loop 7.4 moves
          `record` onto Fighter. */}
      <FighterIdentity fighter={career.player} record={career.record} corner="red" />

      <Sheet title="Standing" caption={`Week ${career.week}`}>
        <FormRow label="Ranking" value={career.ranking === null ? 'Unranked' : `#${career.ranking}`} />
        <FormRow label="Purse" value={`$${career.purse.toLocaleString('en-US')}`} />
        <FormRow label="Hype" value={Math.round(career.hype)} />
        <FormRow
          label="Cut discipline"
          value={`${Math.round(career.weightCutProgress)}/100`}
        />
        <FormRow label="Would go in" value={classifyCut(career.weightCutProgress, balance)} prose />
      </Sheet>

      {career.retired ? (
        <Sheet>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
            <Stamp>Career over</Stamp>
            <a href="#/card">
              <Button variant="primary">View career card</Button>
            </a>
          </div>
        </Sheet>
      ) : (
        <Sheet>
          <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
            <a href="#/camp">
              <Button variant="primary">Camp</Button>
            </a>
            <Button
              variant="ghost"
              onClick={findFightAndResolve}
              disabled={totalFights >= balance.maxCareerFights}
            >
              Find opponent &amp; fight
            </Button>
            {/* Not the player's real next fight — #/fight still plays the Loop
                2.1 fixture matchup (Loop 7.16 wires the career's own opponent
                in). This is the walkout's (§15.7) and the interactive
                playback's (M2) only reachable entry point today, so it's
                labelled as a preview rather than implying it resolves
                anything on the career. */}
            <a href="#/fight">
              <Button variant="ghost">Watch a demo bout</Button>
            </a>
          </div>
        </Sheet>
      )}

      {lastFight && (
        <Sheet variant="carbon">
          <p>{lastFight}</p>
        </Sheet>
      )}
    </Screen>
  );
}
