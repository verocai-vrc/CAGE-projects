// CareerCardScreen.tsx — Loop 3.5: the retirement payoff (DESIGN.md §8.5).
// Renders record/finishes/grade from real accumulated career state. The full
// shareable-text career card (rival, highlight moments, title reigns) is a
// later loop (M5, Loop 5.2) — this is the stub that proves the numbers behind
// it are real.

import { useCageStore } from '../../state/store';

const FINISH_METHODS = new Set(['KO', 'TKO', 'SUB']);

function computeGrade(winRate: number, finishRate: number): string {
  const score = winRate * 70 + finishRate * 30;
  if (score >= 85) return 'S';
  if (score >= 70) return 'A';
  if (score >= 55) return 'B';
  if (score >= 40) return 'C';
  if (score >= 25) return 'D';
  return 'F';
}

export function CareerCardScreen() {
  const career = useCageStore((s) => s.career);

  if (!career.player) {
    return <div id="career-card-screen">No career on record — start one first.</div>;
  }

  const { player, record, fightHistory, purse, ranking } = career;
  const totalFights = record.wins + record.losses + record.draws;
  const finishes = fightHistory.filter(
    (fight) => fight.winnerId === player.id && FINISH_METHODS.has(fight.method),
  ).length;
  const winRate = totalFights > 0 ? record.wins / totalFights : 0;
  const finishRate = totalFights > 0 ? finishes / totalFights : 0;
  const grade = computeGrade(winRate, finishRate);

  return (
    <div id="career-card-screen" style={{ maxWidth: '28rem', padding: '1rem' }}>
      <h2>{player.name} — Career Card</h2>
      <p style={{ color: '#888' }}>
        {career.retired ? 'Retired' : 'Active'} · {player.archetype}
      </p>

      <table>
        <tbody>
          <tr>
            <td>Record</td>
            <td>
              {record.wins}-{record.losses}-{record.draws}
              {record.noContests > 0 ? ` (${record.noContests} NC)` : ''}
            </td>
          </tr>
          <tr>
            <td>Finishes</td>
            <td>
              {finishes} ({Math.round(finishRate * 100)}%)
            </td>
          </tr>
          <tr>
            <td>Final ranking</td>
            <td>{ranking === null ? 'Unranked' : `#${ranking}`}</td>
          </tr>
          <tr>
            <td>Career purse</td>
            <td>${purse.toLocaleString('en-US')}</td>
          </tr>
          <tr>
            <td>Grade</td>
            <td>{grade}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
