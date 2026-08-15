// lab/LabScreen.tsx — hidden #/lab route rendering the balance report
// (DESIGN.md §10). Table/text only, no styling investment yet.

import { useState } from 'preact/hooks';
import { runAllPairings } from './simulate';
import {
  averageEndRound,
  buildFinishRateDistribution,
  buildStaminaFadeCurves,
  buildWinRateMatrix,
  type FinishRateDistribution,
  type WinRateMatrixRow,
} from './report';
import { Screen } from '../ui/components/Screen';

const SIMS_PER_PAIRING = 10_000;

export function LabScreen() {
  const [running, setRunning] = useState(false);
  const [matrix, setMatrix] = useState<WinRateMatrixRow[] | null>(null);
  const [finishes, setFinishes] = useState<FinishRateDistribution | null>(null);
  const [avgRound, setAvgRound] = useState<number | null>(null);
  const [staminaCurves, setStaminaCurves] = useState<Record<string, number[]> | null>(null);

  function run() {
    setRunning(true);
    // Synchronous on purpose: /lab is a hidden dev route, not player-facing
    // — no need for a worker/async pipeline for a one-off batch report.
    const records = runAllPairings(SIMS_PER_PAIRING);
    setMatrix(buildWinRateMatrix(records));
    setFinishes(buildFinishRateDistribution(records));
    setAvgRound(averageEndRound(records));
    setStaminaCurves(buildStaminaFadeCurves());
    setRunning(false);
  }

  return (
    <Screen register="file" id="lab-screen" eyebrow="Internal · not player-facing" title="Balance lab" wide>
      <button type="button" onClick={run} disabled={running}>
        {running ? 'Running...' : `Run ${SIMS_PER_PAIRING.toLocaleString()} sims per pairing`}
      </button>

      {finishes && (
        <section>
          <h2>Finish-rate distribution</h2>
          <table>
            <tbody>
              <tr>
                <td>KO</td>
                <td>{(finishes.koRate * 100).toFixed(1)}%</td>
              </tr>
              <tr>
                <td>TKO</td>
                <td>{(finishes.tkoRate * 100).toFixed(1)}%</td>
              </tr>
              <tr>
                <td>SUB</td>
                <td>{(finishes.subRate * 100).toFixed(1)}%</td>
              </tr>
              <tr>
                <td>Decision</td>
                <td>{(finishes.decisionRate * 100).toFixed(1)}%</td>
              </tr>
              <tr>
                <td>Draw</td>
                <td>{(finishes.drawRate * 100).toFixed(1)}%</td>
              </tr>
            </tbody>
          </table>
          <p>Average end round: {avgRound?.toFixed(2)}</p>
        </section>
      )}

      {matrix && (
        <section>
          <h2>Win-rate matrix (field average)</h2>
          <table>
            <thead>
              <tr>
                <th>Archetype</th>
                {matrix.map((row) => (
                  <th key={row.archetype}>{row.archetype}</th>
                ))}
                <th>Field avg</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((row) => (
                <tr key={row.archetype}>
                  <td>{row.archetype}</td>
                  {matrix.map((col) => (
                    <td key={col.archetype}>
                      {row.archetype === col.archetype
                        ? '—'
                        : `${((row.winRateVs[col.archetype] ?? 0) * 100).toFixed(1)}%`}
                    </td>
                  ))}
                  <td>{(row.fieldAverageWinRate * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {staminaCurves && (
        <section>
          <h2>Stamina-fade curves (final stamina after 60 ticks, by archetype cardio)</h2>
          <ul>
            {Object.entries(staminaCurves).map(([id, curve]) => (
              <li key={id}>
                {id}: {curve[curve.length - 1].toFixed(1)} stamina remaining
              </li>
            ))}
          </ul>
        </section>
      )}
    </Screen>
  );
}
