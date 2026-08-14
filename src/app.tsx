import { useHashRoute } from './router';
import { LabScreen } from './lab/LabScreen';
import { FightScreen } from './ui/screens/FightScreen';
import { CampScreen } from './ui/screens/CampScreen';

export function App() {
  const route = useHashRoute();

  if (route === '/lab') return <LabScreen />;
  if (route === '/fight') return <FightScreen />;
  if (route === '/camp') return <CampScreen />;

  return <div id="app-root">CAGE</div>;
}
