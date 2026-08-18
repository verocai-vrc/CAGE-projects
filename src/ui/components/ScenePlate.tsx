// ScenePlate.tsx — Loop 6.9: the location backdrop (DESIGN.md §15.6). One
// geometry per plate, in the shared sprite defs (ui/sprite/Sprite.tsx);
// this component is just the <use> plus the low-opacity placement. The two
// registers' treatments come from --text-soft alone (see the module CSS) —
// never a prop here, matching how Plate/Meter read corner identity.
//
// Decorative only: it never carries information a screen reader needs, so
// it's aria-hidden and never sits behind dense data (Screen wires it behind
// the header only, per the loop's own placement rule).

import { scenePlateSymbolId, type ScenePlateName } from '../sprite/scenePlates';
import styles from './ScenePlate.module.css';

interface ScenePlateProps {
  plate: ScenePlateName;
}

export function ScenePlate({ plate }: ScenePlateProps) {
  return (
    <div class={styles.root} aria-hidden="true">
      <svg class={styles.svg} viewBox="0 0 200 120" preserveAspectRatio="xMaxYMid slice">
        <use href={`#${scenePlateSymbolId(plate)}`} />
      </svg>
    </div>
  );
}
