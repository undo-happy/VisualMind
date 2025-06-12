import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { onCLS, onFID, onLCP } from 'web-vitals';

function sendToServer(metric) {
  fetch('/api/rum', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metric),
  }).catch(() => {});
}

onCLS(sendToServer);
onFID(sendToServer);
onLCP(sendToServer);

createRoot(document.getElementById('root')).render(<App />);
