// StatRadar.tsx — generic labeled radar/spider chart over 0..max axes.
// Built for the FightScreen pillar comparison HUD (Loop 2.2), rethemed onto
// corner identity in Loop 6.8 (§15.2): a series carries a `corner`, not a raw
// colour, and its polygon reads --corner-fill from a wrapping <g class=
// "corner-red"/"corner-blue"> exactly the way Plate and Meter already do —
// CSS custom properties inherit through SVG <g> like any other element.
// Kept series-generic enough for the amateur wrapper's reveal screen
// (DESIGN.md §9.2) to reuse for a single fighter's attribute spread.

import styles from './StatRadar.module.css';

export interface RadarSeries {
  name: string;
  corner: 'red' | 'blue';
  values: number[]; // aligned with `axes`, same length
}

interface StatRadarProps {
  axes: string[];
  series: RadarSeries[];
  max?: number;
  size?: number;
}

function pointOnAxis(index: number, count: number, radius: number, center: number): [number, number] {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
  return [center + radius * Math.cos(angle), center + radius * Math.sin(angle)];
}

const LABEL_MARGIN = 44;

function labelAnchor(x: number, center: number): 'start' | 'middle' | 'end' {
  if (x > center + 4) return 'start';
  if (x < center - 4) return 'end';
  return 'middle';
}

export function StatRadar({ axes, series, max = 100, size = 240 }: StatRadarProps) {
  const center = size / 2;
  const radius = size / 2 - LABEL_MARGIN;
  const rings = [0.25, 0.5, 0.75, 1];

  function ringPoints(scale: number): string {
    return axes.map((_, i) => pointOnAxis(i, axes.length, radius * scale, center).join(',')).join(' ');
  }

  function seriesPoints(values: number[]): string {
    return values.map((v, i) => pointOnAxis(i, axes.length, radius * (Math.min(v, max) / max), center).join(',')).join(' ');
  }

  return (
    <svg width={size} height={size} style={{ overflow: 'visible' }} role="img" aria-label="attribute radar chart">
      {rings.map((scale) => (
        <polygon key={scale} points={ringPoints(scale)} class={styles.ring} />
      ))}
      {axes.map((_, i) => {
        const [x, y] = pointOnAxis(i, axes.length, radius, center);
        return <line key={i} x1={center} y1={center} x2={x} y2={y} class={styles.axis} />;
      })}
      {series.map((s) => (
        <g key={s.name} class={`corner-${s.corner}`}>
          <polygon points={seriesPoints(s.values)} class={styles.series} />
        </g>
      ))}
      {axes.map((label, i) => {
        const [x, y] = pointOnAxis(i, axes.length, radius + 16, center);
        return (
          <text key={label} x={x} y={y} class={styles.axisLabel} textAnchor={labelAnchor(x, center)} dominantBaseline="middle">
            {label}
          </text>
        );
      })}
    </svg>
  );
}
