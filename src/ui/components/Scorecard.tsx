// Scorecard.tsx — Loop 6.8: the round-by-round judge grid (§15.3, §15.8),
// replacing the bare inline <table> FightScreen used to render. Renders only
// the rounds revealed so far (matching FightScreen's existing reveal
// discipline — the HUD never shows a round the play-by-play hasn't reached
// yet), plus a running total column per judge.

import { Plate } from './Plate';
import type { Scorecard as ScorecardData } from '../../engine/types';
import type { Judge } from '../../engine/judging';
import styles from './Scorecard.module.css';

interface ScorecardProps {
  scorecards: ScorecardData[];
  judges: readonly Judge[];
  roundsScored: number;
  fighterAName: string;
  fighterBName: string;
}

export function Scorecard({ scorecards, judges, roundsScored, fighterAName, fighterBName }: ScorecardProps) {
  if (roundsScored === 0) return null;

  return (
    <Plate eyebrow="Scorecards">
      <table class={styles.table}>
        <thead>
          <tr>
            <th class={styles.judgeCol}>Judge</th>
            {Array.from({ length: roundsScored }, (_, i) => (
              <th key={i}>R{i + 1}</th>
            ))}
            <th class={styles.headA}>{fighterAName}</th>
            <th class={styles.headB}>{fighterBName}</th>
          </tr>
        </thead>
        <tbody>
          {scorecards.map((sc) => {
            const judge = judges.find((j) => j.id === sc.judgeId);
            const scored = sc.roundScores.slice(0, roundsScored);
            const total = scored.reduce((acc, r) => ({ a: acc.a + r.a, b: acc.b + r.b }), { a: 0, b: 0 });
            return (
              <tr key={sc.judgeId} class={styles.total}>
                <td class={styles.judgeCol}>{judge?.name ?? sc.judgeId}</td>
                {scored.map((r, i) => (
                  <td key={i}>
                    {r.a}-{r.b}
                  </td>
                ))}
                <td class={styles.headA}>{total.a}</td>
                <td class={styles.headB}>{total.b}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Plate>
  );
}
