import { useHashRoute } from './router';
import { LabScreen } from './lab/LabScreen';

export function App() {
  const route = useHashRoute();

  if (route === '/lab') return <LabScreen />;

  return <div id="app-root">CAGE</div>;
}
