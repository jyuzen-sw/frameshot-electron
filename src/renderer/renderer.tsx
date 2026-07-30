import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ExportRenderer } from './ExportRenderer';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Renderer root was not found.');

const isExportRenderer = window.location.hash === '#export';
document.documentElement.dataset.renderer =
  isExportRenderer ? 'export' : 'app';

createRoot(root).render(
  isExportRenderer ? (
    <ExportRenderer />
  ) : (
    <StrictMode>
      <App />
    </StrictMode>
  ),
);
