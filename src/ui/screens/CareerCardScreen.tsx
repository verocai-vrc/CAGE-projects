// CareerCardScreen.tsx — Loop 3.5 built the retirement payoff (DESIGN.md
// §8.5): record/finishes/grade from real accumulated career state. Loop 5.2
// adds the shareable-text half — computeCareerCardData (career/shareCard.ts)
// is now the single source for these numbers, and a copy button turns them
// into Wordle-style text via formatShareText.

import { useState } from 'preact/hooks';
import { computeCareerCardData, formatShareText } from '../../career/shareCard';
import { useCageStore } from '../../state/store';
import { Screen } from '../components/Screen';

export function CareerCardScreen() {
  const career = useCageStore((s) => s.career);
  const [copied, setCopied] = useState(false);

  const card = computeCareerCardData(career);
  if (!card || !career.player) {
    return (
      <Screen register="file" id="career-card-screen" title="Career card">
        <p>No career on record — start one first.</p>
      </Screen>
    );
  }

  const { player } = career;

  async function copyShareText() {
    const text = formatShareText(card!, player.name);
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
      <p style={{ color: 'var(--text-soft)' }}>
        {card.retired ? 'Retired' : 'Active'} · {card.archetype}
      </p>

      <table>
        <tbody>
          <tr>
            <td>Record</td>
            <td>
              {card.wins}-{card.losses}-{card.draws}
              {card.noContests > 0 ? ` (${card.noContests} NC)` : ''}
            </td>
          </tr>
          <tr>
            <td>Finishes</td>
            <td>
              {card.finishes} ({Math.round(card.finishRate * 100)}%)
            </td>
          </tr>
          <tr>
            <td>Final ranking</td>
            <td>{card.ranking === null ? 'Unranked' : `#${card.ranking}`}</td>
          </tr>
          <tr>
            <td>Career purse</td>
            <td>${card.purse.toLocaleString('en-US')}</td>
          </tr>
          <tr>
            <td>Grade</td>
            <td>{card.grade}</td>
          </tr>
        </tbody>
      </table>

      <pre
        style={{
          whiteSpace: 'pre-wrap',
          background: '#1a1a1a',
          padding: '0.75rem',
          borderRadius: '4px',
          fontSize: '0.9rem',
        }}
      >
        {formatShareText(card, player.name)}
      </pre>

      <button type="button" onClick={copyShareText}>
        {copied ? 'Copied!' : 'Copy shareable result'}
      </button>
    </Screen>
  );
}
