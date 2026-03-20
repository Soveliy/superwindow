import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { App } from '@/app/App';
import '@/shared/styles/index.css';
import 'react-calendar/dist/Calendar.css';
import { ThemeProvider } from '@/shared/theme/ThemeProvider';

registerSW({
  immediate: true,
});

const useHashRouter = import.meta.env.PROD && import.meta.env.BASE_URL !== '/';
const routerBasename =
  !useHashRouter && import.meta.env.BASE_URL !== '/' ? import.meta.env.BASE_URL.replace(/\/$/, '') : undefined;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      {useHashRouter ? (
        <HashRouter>
          <App />
        </HashRouter>
      ) : (
        <BrowserRouter basename={routerBasename}>
          <App />
        </BrowserRouter>
      )}
    </ThemeProvider>
  </React.StrictMode>,
);
