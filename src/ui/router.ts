import { useEffect, useState } from 'react';

export const ROUTES = [
  { path: '/meetings', label: 'Meetings' },
  { path: '/people', label: 'People' },
  { path: '/projects', label: 'Projects' },
] as const;

const read = () => window.location.hash.replace(/^#/, '') || '/meetings';

/** Tiny hash router: no dependency, and works on any static host. */
export function useRoute(): string {
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
