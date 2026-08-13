// HudBar.tsx — a single labeled 0-100 meter (health, stamina, ...). Pure
// presentational component: the caller derives the value from the event log.

interface HudBarProps {
  label: string;
  value: number; // 0..100
  max?: number;
  tone: 'health' | 'stamina';
}

const TONE_COLOR: Record<HudBarProps['tone'], string> = {
  health: '#d64545',
  stamina: '#4a9d5f',
};

export function HudBar({ label, value, max = 100, tone }: HudBarProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));

  return (
    <div style={{ marginBottom: '0.35rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
        <span>{label}</span>
        <span>{Math.round(value)}</span>
      </div>
      <div style={{ background: '#2a2a2a', height: '0.6rem', borderRadius: '0.3rem', overflow: 'hidden' }}>
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: TONE_COLOR[tone],
            transition: 'width 200ms linear',
          }}
        />
      </div>
    </div>
  );
}
