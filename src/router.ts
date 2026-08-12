// router.ts — ~20-line hash router (DESIGN.md §11): #/chargen, #/camp,
// #/fight, #/card, #/lab. No react-router.

import { useEffect, useState } from 'preact/hooks';

export function currentRoute(): string {
  return window.location.hash.replace(/^#/, '') || '/';
}

export function useHashRoute(): string {
  const [route, setRoute] = useState(currentRoute());

  useEffect(() => {
    const onHashChange = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return route;
}
