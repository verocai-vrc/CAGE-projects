// PortraitEditor.tsx — Loop 6.5: "who's in the mirror," step 0 of the amateur
// wrapper (DESIGN.md §9.1/§15.4). Per-slot cyclers over the feature dictionary,
// a randomize control, and a confirm — no statline, exactly like every other
// wrapper step. The authored FaceCode is the only thing this component hands
// back; it never touches Origin, career state, or the RNG stream that seeds
// the skip path (that stays independent, per §9.3).

import { useState } from 'preact/hooks';
import type { RNG } from '../../engine';
import { faceFromSeed, serializeFaceCode, SLOT_COUNTS, SLOT_ORDER, type FaceCode } from './faceCode';
import { Portrait } from './Portrait';
import { Button } from '../components/Button';
import { FormRow } from '../components/FormRow';
import styles from './PortraitEditor.module.css';

const SLOT_LABELS: Record<keyof FaceCode, string> = {
  skin: 'Skin tone',
  head: 'Face shape',
  hair: 'Hair',
  hairColor: 'Hair colour',
  brow: 'Brow',
  eyes: 'Eyes',
  nose: 'Nose',
  mouth: 'Mouth',
  facialHair: 'Facial hair',
};

function cycle(value: number, count: number, delta: number): number {
  return (value + delta + count) % count;
}

interface PortraitEditorProps {
  /** Seeds the initial face and the randomize control — same RNG the caller
   *  already owns, so a given playthrough starts from a stable-but-real face
   *  rather than the all-zero default. */
  rng: RNG;
  onConfirm: (face: string) => void;
}

export function PortraitEditor({ rng, onConfirm }: PortraitEditorProps) {
  const [code, setCode] = useState<FaceCode>(() => faceFromSeed(rng));

  function setSlot(slot: keyof FaceCode, delta: number) {
    setCode((prev) => ({ ...prev, [slot]: cycle(prev[slot], SLOT_COUNTS[slot], delta) }));
  }

  function randomize() {
    setCode(faceFromSeed(rng));
  }

  function confirm() {
    onConfirm(serializeFaceCode(code));
  }

  return (
    <div class={styles.root}>
      <div class={styles.top}>
        <Portrait face={code} size="96px" />
        <p class={styles.hint}>
          Cycle each feature below, or randomize. This is who shows up on your license — you can't
          change it once you're signed.
        </p>
      </div>

      <div class={styles.slots}>
        {SLOT_ORDER.map((slot) => (
          <FormRow key={slot} label={SLOT_LABELS[slot]}>
            <div
              class={styles.cycler}
              role="group"
              aria-label={`${SLOT_LABELS[slot]}, option ${code[slot] + 1} of ${SLOT_COUNTS[slot]}`}
            >
              <Button type="button" aria-label={`Previous ${SLOT_LABELS[slot]}`} onClick={() => setSlot(slot, -1)}>
                &larr;
              </Button>
              <span class={styles.cyclerValue} aria-hidden="true">
                {'●'.repeat(code[slot] + 1)}
                {'○'.repeat(SLOT_COUNTS[slot] - code[slot] - 1)}
              </span>
              <Button type="button" aria-label={`Next ${SLOT_LABELS[slot]}`} onClick={() => setSlot(slot, 1)}>
                &rarr;
              </Button>
            </div>
          </FormRow>
        ))}
      </div>

      <div class={styles.actions}>
        <Button type="button" onClick={randomize}>
          Randomize
        </Button>
        <Button type="button" variant="primary" onClick={confirm}>
          Confirm face
        </Button>
      </div>
    </div>
  );
}
