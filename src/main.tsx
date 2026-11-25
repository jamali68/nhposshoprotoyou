import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initSmartPwaUpdater } from './utils/pwaUpdater';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

// Initialize Smart Background PWA Updater (silent pre-download + seamless apply on page switch/refresh/reopen)
initSmartPwaUpdater();
