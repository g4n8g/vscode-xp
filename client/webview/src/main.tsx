import '../node_modules/modern-normalize/modern-normalize.css';
import '@vscode/codicons/dist/codicon.css';

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app.tsx';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
