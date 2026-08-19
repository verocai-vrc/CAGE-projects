import { useEffect, useState } from 'preact/hooks';
import type { ComponentType } from 'preact';
import { useHashRoute } from './router';
import { FightScreen } from './ui/screens/FightScreen';
import { CampScreen } from './ui/screens/CampScreen';
import { CareerScreen } from './ui/screens/CareerScreen';
import { CareerCardScreen } from './ui/screens/CareerCardScreen';
import { ChargenWrapper } from './ui/screens/ChargenWrapper';
import { Sprite } from './ui/sprite/Sprite';

// Loop 6.12: `#/lab` and `#/kit` are not on any player's path — one is the
// balance lab (DESIGN.md §10, a developer deliverable) and the other is the
// component gallery built as Loop 6.2's verification surface. Both were riding
// in the initial chunk, costing 8.7KB raw that no player ever executes, against
// a §15.9 JS-delta ceiling of 20KB. A dynamic import moves them into their own
// chunks: still reachable at their routes, no longer part of what a player
// downloads to reach fight night. See scripts/check-budgets.mjs for the numbers.
const DEFERRED_SCREENS: Record<string, () => Promise<{ default: ComponentType }>> = {
  '/lab': () => import('./lab/LabScreen').then((m) => ({ default: m.LabScreen })),
  '/kit': () => import('./ui/screens/KitScreen').then((m) => ({ default: m.KitScreen })),
};

/** Loads a deferred screen's chunk on first navigation to its route. Renders a
 *  bare status line while the chunk is in flight — these two routes are the only
 *  ones that can show one, and both are developer surfaces. */
function DeferredScreen({ route }: { route: string }) {
  const [Screen, setScreen] = useState<ComponentType | null>(null);

  useEffect(() => {
    let live = true;
    setScreen(null);
    DEFERRED_SCREENS[route]().then((m) => {
      if (live) setScreen(() => m.default);
    });
    return () => {
      live = false;
    };
  }, [route]);

  if (!Screen) return <p aria-live="polite">Loading…</p>;
  return <Screen />;
}

function Routed() {
  const route = useHashRoute();

  if (route in DEFERRED_SCREENS) return <DeferredScreen route={route} />;
  if (route === '/fight') return <FightScreen />;
  if (route === '/camp') return <CampScreen />;
  if (route === '/card') return <CareerCardScreen />;
  if (route === '/chargen') return <ChargenWrapper />;

  return <CareerScreen />;
}

export function App() {
  // The sprite defs block mounts once here and never unmounts, so every <use> in
  // the tree — flags now, faces from Loop 6.4 — references geometry that is defined
  // exactly once for the life of the app (§15.4, §2's DOM-reuse rule).
  return (
    <>
      <Sprite />
      <Routed />
    </>
  );
}
