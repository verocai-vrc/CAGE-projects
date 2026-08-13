import { useHashRoute } from './router';
import { LabScreen } from './lab/LabScreen';
import { FightScreen } from './ui/screens/FightScreen';

export function App() {
  const route = useHashRoute();

  if (route === '/lab') return <LabScreen />;
  if (route === '/fight') return <FightScreen />;

  return <div id="app-root">CAGE</div>;
}
