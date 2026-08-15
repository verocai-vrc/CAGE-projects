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
import type { Fighter } from '../../engine/types';
import { Button } from '../components/Button';
import { FighterIdentity } from '../components/FighterIdentity';
import { FlagChip } from '../components/FlagChip';
import { FormRow } from '../components/FormRow';
import { Meter } from '../components/Meter';
import { Plate } from '../components/Plate';
import { Screen, type Register } from '../components/Screen';
import { Sheet } from '../components/Sheet';
import { Stamp } from '../components/Stamp';
import styles from './KitScreen.module.css';

// §15.5's five real values plus both sentinels — the set this loop's verify
// screenshots at 16px to confirm none falls back to a missing glyph.
const NATIONALITIES = ['Brazil', 'Ireland', 'Japan', 'Poland', 'USA', 'lab', 'fixture'];

function kitFighter(name: string, nationality: string, archetype: string): Fighter {
  return {
    id: `kit-${name}`,
    name,
    nationality,
    weightClass: 'lightweight',
    stance: 'orthodox',
    attributes: {
      power: 60, technique: 60, speed: 60, wrestling: 60,
      groundControl: 60, chin: 60, cardio: 60, fightIQ: 60,
    },
    archetype,
    weakness: null,
    traits: [],
    condition: { health: 100, injuries: [] },
  };
}

const KIT_PLAYER = kitFighter('Wanderlei Nascimento', 'Brazil', 'striker');
const KIT_OPPONENT = kitFighter('Kamil Wisniewski', 'Poland', 'wrestler');
const KIT_RECORD = { wins: 12, losses: 3, draws: 0, noContests: 1 };

/** The identical prop set both registers are handed. */
function KitBody({ sweep }: { sweep: number }) {
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

      <Sheet title="Fighter identity" caption="record present vs absent">
        {/* The player: record from career state. The opponent: no record source
            until Loop 7.4, so the slot stays empty rather than fabricating 0-0-0. */}
        <FighterIdentity fighter={KIT_PLAYER} record={KIT_RECORD} corner="red" />
        <FighterIdentity fighter={KIT_OPPONENT} corner="blue" />
        <FighterIdentity fighter={KIT_OPPONENT} compact />
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
          <KitBody sweep={sweep} />
        </Screen>
      ))}
    </div>
  );
}
