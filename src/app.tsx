import { useHashRoute } from './router';
import { LabScreen } from './lab/LabScreen';
import { FightScreen } from './ui/screens/FightScreen';
import { CampScreen } from './ui/screens/CampScreen';
import { CareerScreen } from './ui/screens/CareerScreen';
import { CareerCardScreen } from './ui/screens/CareerCardScreen';
import { ChargenWrapper } from './ui/screens/ChargenWrapper';
import { KitScreen } from './ui/screens/KitScreen';

export function App() {
  const route = useHashRoute();

  if (route === '/lab') return <LabScreen />;
  if (route === '/kit') return <KitScreen />;
  if (route === '/fight') return <FightScreen />;
  if (route === '/camp') return <CampScreen />;
  if (route === '/card') return <CareerCardScreen />;
  if (route === '/chargen') return <ChargenWrapper />;

  return <CareerScreen />;
}
