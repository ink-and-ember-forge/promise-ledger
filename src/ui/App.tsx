import { useEffect } from 'react';
import { repo } from './repo';
import { ROUTES, useRoute } from './router';
import { MeetingsScreen } from './screens/MeetingsScreen';
import { PeopleScreen } from './screens/PeopleScreen';
import { ProjectsScreen } from './screens/ProjectsScreen';

export function App() {
  const route = useRoute();

  useEffect(() => {
    void repo.ensureSelf();
  }, []);

  return (
    <>
      <header className="bar">
        <strong>Promise Ledger</strong>
        <nav aria-label="Main">
          {ROUTES.map((r) => (
            <a key={r.path} href={`#${r.path}`} aria-current={route === r.path ? 'page' : undefined}>
              {r.label}
            </a>
          ))}
        </nav>
      </header>
      <main>
        {route === '/people' && <PeopleScreen />}
        {route === '/projects' && <ProjectsScreen />}
        {route === '/meetings' && <MeetingsScreen />}
      </main>
    </>
  );
}
