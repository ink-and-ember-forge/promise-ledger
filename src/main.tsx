import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { logBoot } from './ui/diagnostics';
import './ui/styles.css';

createRoot(document.getElementById('root')!).render(<App />);
logBoot();
