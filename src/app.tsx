import { useHashRoute } from './router';
import { LabScreen } from './lab/LabScreen';
import { FightScreen } from './ui/screens/FightScreen';
import { CampScreen } from './ui/screens/CampScreen';
import { CareerScreen } from './ui/screens/CareerScreen';
import { CareerCardScreen } from './ui/screens/CareerCardScreen';
import { ChargenWrapper } from './ui/screens/ChargenWrapper';
import { KitScreen } from './ui/screens/KitScreen';
import { Sprite } from './ui/sprite/Sprite';

function Routed() {
  const route = useHashRoute();

  if (route === '/lab') return <LabScreen />;
  if (route === '/kit') return <KitScreen />;
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
