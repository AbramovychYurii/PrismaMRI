import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import '@/styles/fonts';
import '@/styles/globals.css';
import { App } from '@/App';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { appViewer } from '@/store';
import { ViewerProvider } from '@/viewer';

if (import.meta.env.DEV) {
  (window as unknown as { __prismaStore?: unknown }).__prismaStore = appViewer.store;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <ViewerProvider viewer={appViewer}>
          <App />
        </ViewerProvider>
      </HashRouter>
    </ErrorBoundary>
  </StrictMode>,
);
