import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import '@/styles/globals.css';
import { App } from '@/App';
import { useVolumeStore } from '@/store/volumeStore';

if (import.meta.env.DEV) {
  (window as unknown as { __prismaStore?: unknown }).__prismaStore = useVolumeStore;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
