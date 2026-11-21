import '@fontsource/anton/400.css';
import '@fontsource-variable/inter';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import { AppProvider } from './store.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>
);
