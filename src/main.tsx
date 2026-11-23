import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/app.css';
import App from './App';

const StyleLab = lazy(() => import('./lab/StyleLab'));
const isLabMode =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('lab');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isLabMode ? (
      <Suspense fallback={null}>
        <StyleLab />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>
);
