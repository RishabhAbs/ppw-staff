import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Storage Sanitizer: Run before anything else
try {
  const userStr = localStorage.getItem('user');
  if (userStr === 'undefined' || userStr === 'null') {
    localStorage.removeItem('user');
  } else if (userStr) {
    // Validate JSON
    JSON.parse(userStr);
  }
} catch (e) {
  console.warn('Corrupted local storage detected. Clearing.', e);
  localStorage.clear();
}

import { ToastProvider } from './context/ToastContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
)
