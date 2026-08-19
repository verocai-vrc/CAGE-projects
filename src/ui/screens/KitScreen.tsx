// KitScreen.tsx — Loop 6.2: the component gallery at #/kit.
//
// A hidden dev route like #/lab, and it exists because of this loop's verify: the
// kit has to be shown rendering "correctly in both registers from the same props",
// and the only honest way to check that is to render one array of props twice under
// two register roots and look at the result.
//
// It earns its keep past this loop — 6.3's flags, 6.4's portraits and 6.6's wear
// all need somewhere to be looked at side by side without playing a career to reach
// them.

import { useEffect, useState } from 'preact/hooks';
import type { Fighter, FightRecord } from '../../engine/types';
import { mulberry32 } from '../../engine/rng';
import { BudgetSplit, type BudgetPillar } from '../components/BudgetSplit';
import { Button } from '../components/Button';
import { FighterIdentity } from '../components/FighterIdentity';
import { FlagChip } from '../components/FlagChip';
import { FormRow } from '../components/FormRow';
import { Meter } from '../components/Meter';
import { Plate } from '../components/Plate';
import { ScenePlate } from '../components/ScenePlate';
import { SCENE_PLATES } from '../sprite/scenePlates';
import { Portrait } from '../portrait/Portrait';
import { faceFromSeed, serializeFaceCode } from '../portrait/faceCode';
import { faceWear, NO_WEAR } from '../portrait/wear';
import { Screen, type Register } from '../components/Screen';
import { Sheet } from '../components/Sheet';
import { Stamp } from '../components/Stamp';
import styles from './KitScreen.module.css';
import type { FightSummary } from '../../engine/types';

// §15.5's five real values plus both sentinels — the set this loop's verify
// screenshots at 16px to confirm none falls back to a missing glyph.
const NATIONALITIES = ['Brazil', 'Ireland', 'Japan', 'Poland', 'USA', 'lab', 'fixture'];

function kitFighter(
  name: string,
  nationality: string,
  archetype: string,
  face: string,
  record: FightRecord = { wins: 8, losses: 2, draws: 0, noContests: 0 },
  nickname: string | null = null,
): Fighter {
  return {
    id: `kit-${name}`,
    name,
    nickname,
    nationality,
    face,
    weightClass: 'lightweight',
    stance: 'orthodox',
    attributes: {
      power: 60, technique: 60, speed: 60, wrestling: 60,
      groundControl: 60, chin: 60, cardio: 60, fightIQ: 60,
    },
    archetype,
    weakness: null,
    record,
    traits: [],
    condition: { health: 100, injuries: [] },
  };
}

// Loop 7.4: both sides carry a record now, so the gallery shows the NC variant
// against a plain one rather than "record present vs absent".
// Loop 7.6: and one of the two carries a nickname, because ~35% of fighters do
// not (§16.5) — both states have to be looked at side by side.
const KIT_PLAYER = kitFighter(
  'Wanderlei Nascimento', 'Brazil', 'striker', '412030201',
  { wins: 12, losses: 3, draws: 0, noContests: 1 },
  'Riverside Undertow',
);
const KIT_OPPONENT = kitFighter('Kamil Wisniewski', 'Poland', 'wrestler', '203142310', {
  wins: 19, losses: 6, draws: 1, noContests: 0,
});

// --- Loop 6.6's wear demonstration: one FaceCode, three points in a career.
// This is the loop's own screenshot verify — "the same FaceCode at debut,
// mid-career, and after a brutal run — the three must be obviously
// distinguishable" — with nowhere else in the app yet to show it (that's
// Loop 6.11's job, once the career/retirement screens are rebuilt).
const WEAR_FACE = '531420310';
const WEAR_FIGHTER = kitFighter('Dusan Kovac', 'Poland', 'wrestler', WEAR_FACE);

function wearFixtureSummary(overrides: Partial<FightSummary>): FightSummary {
  return {
    seed: '',
    fighterAId: WEAR_FIGHTER.id,
    fighterBId: 'kit-opponent',
    winnerId: WEAR_FIGHTER.id,
    method: 'UD',
    endRound: 3,
    scorecardTotals: [],
    knockdownsA: 0,
    knockdownsB: 0,
    ...overrides,
  };
}

const BUDGET_PILLARS: BudgetPillar[] = [
  { id: 'training', label: 'Training' },
  { id: 'weightManagement', label: 'Weight management' },
  { id: 'rest', label: 'Rest' },
  { id: 'life', label: 'Life' },
];
const BUDGET_TOTAL = 10;

const WEAR_MID_RECORD = { wins: 4, losses: 2, draws: 0, noContests: 0 };
const WEAR_BRUTAL_RECORD = { wins: 9, losses: 6, draws: 0, noContests: 0 };

// A nose injury so the debut/mid/brutal grid also proves the noseBreak layer
// — the fixture fighter carries it from mid-career onward, same as a real
// career's condition.injuries only ever grows.
const NOSE_INJURY = { id: 'kit-nose', bodyPart: 'nose', severity: 40, weeksRemaining: 3 };

const WEAR_MID_FIGHTER = {
  ...WEAR_FIGHTER,
  condition: { ...WEAR_FIGHTER.condition, injuries: [NOSE_INJURY] },
};
// knockdownsB is knockdowns scored BY the opponent AGAINST the kit fighter
// (fighterAId) — that is the signal that shows up as wear on this fighter's
// own face, per engine/types.ts's FightSummary convention.
const WEAR_MID_HISTORY: FightSummary[] = [
  wearFixtureSummary({ knockdownsB: 1 }),
  wearFixtureSummary({}),
  wearFixtureSummary({ winnerId: 'kit-opponent', method: 'UD' }),
  wearFixtureSummary({ winnerId: 'kit-opponent', method: 'TKO' }),
  wearFixtureSummary({}),
  wearFixtureSummary({}),
];

const WEAR_BRUTAL_FIGHTER = WEAR_MID_FIGHTER;
const WEAR_BRUTAL_HISTORY: FightSummary[] = [
  ...WEAR_MID_HISTORY,
  wearFixtureSummary({ knockdownsB: 1 }),
  wearFixtureSummary({ winnerId: 'kit-opponent', method: 'TKO' }),
  wearFixtureSummary({ knockdownsB: 1 }),
  wearFixtureSummary({}),
  wearFixtureSummary({}),
  wearFixtureSummary({}),
  wearFixtureSummary({}),
  // The most recent fight: a brutal TKO loss — this is what makes swelling
  // present at the "brutal run" point but absent at "mid-career", proving the
  // transient/recency behaviour, not just the cumulative layers.
  wearFixtureSummary({ winnerId: 'kit-opponent', method: 'TKO' }),
];

// A 4x6 grid of faces drawn from consecutive seeds — this loop's verify calls for
// "a grid of 24 seeded faces, confirm visible variety, no two identical, none
// broken". The kit is where that lives, alongside everything else this loop's
// screenshots check.
const FACE_GRID = Array.from({ length: 24 }, (_, i) =>
  serializeFaceCode(faceFromSeed(mulberry32(1000 + i))),
);

/** The identical prop set both registers are handed. */
function KitBody({
  sweep,
  budgetAllocation,
  setBudgetAllocation,
}: {
  sweep: number;
  budgetAllocation: Record<string, number>;
  setBudgetAllocation: (next: Record<string, number>) => void;
}) {
  return (
    <>
      <Sheet title="Meters" caption="same props, both registers">
        <Meter label="Health" value={82} />
        <Meter label="Stamina" value={41} />
        <Meter label="Rocked" value={17} tone="warn" />
        {/* The jitter check: a meter counting 0 → 100. The value column is mono and
            tabular with a reserved width, so its left edge must not move. */}
        <div id="kit-sweep">
          <Meter label="Sweep" value={sweep} />
        </div>
      </Sheet>

      <Sheet title="Corners" caption="red is always the player">
        <div class="corner-red">
          <Meter label="Player health" value={64} />
        </div>
        <div class="corner-blue">
          <Meter label="Opponent health" value={64} />
        </div>
      </Sheet>

      <Sheet title="Buttons">
        <div class={styles.row}>
          <Button variant="primary">Primary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="stamp">Stamp</Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
        </div>
      </Sheet>

      <Sheet title="Budget split" caption={`${BUDGET_TOTAL} to split`}>
        <BudgetSplit
          budget={BUDGET_TOTAL}
          pillars={BUDGET_PILLARS}
          value={budgetAllocation}
          onChange={setBudgetAllocation}
        />
      </Sheet>

      <Sheet variant="carbon" title="Carbon copy" caption="second sheet">
        <FormRow label="Record" value="12-3-0" />
        <FormRow label="Purse" value="$99,855" />
        <FormRow label="Opponent" value="Wanderlei Nascimento" prose />
        <FormRow label="Ranking" value="#5" />
      </Sheet>

      <Sheet variant="medical" title="Medical" caption="pink sheet only">
        <FormRow label="Suspension" value="180 days" />
        <FormRow label="Injury" value="Orbital fracture" prose />
      </Sheet>

      <Sheet title="Stamps + flags">
        <div class={styles.row}>
          <Stamp>Resolved</Stamp>
          <Stamp tone="blue">Licensed</Stamp>
          <Stamp flat>Daily · 2026-08-15</Stamp>
        </div>
        <div class={styles.chips}>
          {NATIONALITIES.map((n) => (
            <FlagChip key={n} nationality={n} showLabel />
          ))}
        </div>
      </Sheet>

      <Sheet title="Scene plates" caption="all six, both registers — §15.6">
        <div class={styles.plateGrid}>
          {SCENE_PLATES.map((plate) => (
            <div key={plate} class={styles.plateSwatch}>
              <ScenePlate plate={plate} />
              <span>{plate}</span>
            </div>
          ))}
        </div>
      </Sheet>

      <Sheet title="Fighter identity" caption="both corners, record on the fighter">
        {/* Loop 7.4: the record rides on Fighter, so the player and a generated
            opponent render through the identical path. Red carries a no-contest,
            blue does not — the two formatRecord branches, side by side. */}
        <FighterIdentity fighter={KIT_PLAYER} corner="red" />
        <FighterIdentity fighter={KIT_OPPONENT} corner="blue" />
        <FighterIdentity fighter={KIT_OPPONENT} compact />
      </Sheet>

      <Sheet title="Portraits" caption="24 seeded faces — no two identical">
        <div class={styles.portraitGrid}>
          {FACE_GRID.map((face, i) => (
            <Portrait key={i} face={face} size="40px" />
          ))}
        </div>
      </Sheet>

      <Sheet title="Wear" caption="one FaceCode, three points in a career">
        <div class={styles.row}>
          <div>
            <Portrait face={WEAR_FACE} wear={NO_WEAR} size="72px" />
            <p class={styles.wearLabel}>Debut</p>
          </div>
          <div>
            <Portrait face={WEAR_FACE} wear={faceWear(WEAR_MID_FIGHTER, WEAR_MID_RECORD, WEAR_MID_HISTORY)} size="72px" />
            <p class={styles.wearLabel}>Mid-career</p>
          </div>
          <div>
            <Portrait
              face={WEAR_FACE}
              wear={faceWear(WEAR_BRUTAL_FIGHTER, WEAR_BRUTAL_RECORD, WEAR_BRUTAL_HISTORY)}
              size="72px"
            />
            <p class={styles.wearLabel}>After a brutal run</p>
          </div>
        </div>
      </Sheet>

      {/* `corner` is meaningless without a corner ancestor to inherit from — the
          accent bar and the meter inside would fall back to two different colours.
          Fight night sets the class once per side; so does this. */}
      <div class="corner-red">
        <Plate eyebrow="Red corner" title="Riko Tanaka" corner>
          <Meter label="Health" value={73} />
        </Plate>
      </div>
    </>
  );
}

export function KitScreen() {
  const [sweep, setSweep] = useState(0);
  const [budgetAllocation, setBudgetAllocation] = useState<Record<string, number>>({
    training: 4,
    weightManagement: 2,
    rest: 1,
    life: 0,
  });

  // Drive the sweep meter continuously so a screenshot at any moment catches it
  // mid-count. Values are chosen to cross every digit-width boundary (1, 2 and 3
  // characters), which is exactly where a non-tabular face would jitter.
  useEffect(() => {
    // Steps to exactly 100 before wrapping, so the sweep actually renders the
    // three-digit reading the jitter check needs to see.
    const id = setInterval(() => setSweep((v) => (v >= 100 ? 0 : Math.min(100, v + 7))), 400);
    return () => clearInterval(id);
  }, []);

  const registers: Register[] = ['file', 'broadcast'];

  return (
    <div id="kit-screen">
      {registers.map((register) => (
        <Screen
          key={register}
          register={register}
          id={`kit-${register}`}
          eyebrow="Component kit · not player-facing"
          title={register === 'file' ? 'The File' : 'The Broadcast'}
        >
          <KitBody sweep={sweep} budgetAllocation={budgetAllocation} setBudgetAllocation={setBudgetAllocation} />
        </Screen>
      ))}
    </div>
  );
}
