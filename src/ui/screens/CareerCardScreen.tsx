// CareerCardScreen.tsx — Loop 3.5 built the retirement payoff (DESIGN.md
// §8.5): record/finishes/grade from real accumulated career state. Loop 5.2
// added the shareable-text half — computeCareerCardData (career/shareCard.ts)
// is the single source for these numbers, and a copy button turns them into
// Wordle-style text via formatShareText. Loop 6.11 rebuilds the screen on
// the component kit and adds the debut/retirement face pair §15.4 promises:
// the same FaceCode rendered with NO_WEAR beside itself rendered through
// faceWear(player, record, fightHistory) — the only difference is the wear
// layers, so side by side they read as the same person, older.

import { useState } from 'preact/hooks';
import { computeCareerCardData, formatShareText } from '../../career/shareCard';
import { useCageStore } from '../../state/store';
import { faceWear } from '../portrait/wear';
import { Portrait } from '../portrait/Portrait';
import { Button } from '../components/Button';
import { FormRow } from '../components/FormRow';
import { Screen } from '../components/Screen';
import { Sheet } from '../components/Sheet';
import { Stamp } from '../components/Stamp';
import styles from './CareerCardScreen.module.css';

export function CareerCardScreen() {
  const career = useCageStore((s) => s.career);
  const [copied, setCopied] = useState(false);

  const card = computeCareerCardData(career);
  if (!card || !career.player) {
    return (
      <Screen register="file" id="career-card-screen" title="Career card">
        <Sheet>
          <p>No career on record — start one first.</p>
        </Sheet>
      </Screen>
    );
  }

  const { player, record, fightHistory } = career;
  const wear = faceWear(player, record, fightHistory);

  async function copyShareText() {
    const text = formatShareText(card!, player!.name);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied/unavailable — the text is still
      // visible on screen for the player to select and copy by hand.
      setCopied(false);
    }
  }

  return (
    <Screen register="file" id="career-card-screen" eyebrow="Career card" title={player.name}>
      <Sheet title={player.name} caption={card.archetype}>
        <div class={styles.faces}>
          <div class={styles.face}>
            <Portrait face={player.face} size="7rem" />
            <span class={styles.faceLabel}>Debut</span>
          </div>
          <div class={styles.face}>
            <Portrait face={player.face} wear={wear} size="7rem" />
            <span class={styles.faceLabel}>{card.retired ? 'Retirement' : 'Current'}</span>
          </div>
        </div>

        <p class={styles.status}>
          <Stamp tone={card.retired ? 'mark' : 'blue'} flat>
            {card.retired ? 'Retired' : 'Active'}
          </Stamp>
        </p>

        <FormRow
          label="Record"
          value={`${card.wins}-${card.losses}-${card.draws}${card.noContests > 0 ? ` (${card.noContests} NC)` : ''}`}
        />
        <FormRow label="Finishes" value={`${card.finishes} (${Math.round(card.finishRate * 100)}%)`} />
        <FormRow label="Final ranking" value={card.ranking === null ? 'Unranked' : `#${card.ranking}`} />
        <FormRow label="Career purse" value={`$${card.purse.toLocaleString('en-US')}`} />
        <FormRow label="Grade" value={card.grade} />
      </Sheet>

      <Sheet title="Shareable result" variant="carbon">
        <pre class={styles.shareText}>{formatShareText(card, player.name)}</pre>
        <Button variant="primary" block onClick={copyShareText}>
          {copied ? 'Copied!' : 'Copy shareable result'}
        </Button>
      </Sheet>
    </Screen>
  );
}
