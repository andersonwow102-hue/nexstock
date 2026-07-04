import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App.jsx'
import { registrarErroOperacional, setupSentry } from './monitoring.js'

setupSentry();

window.addEventListener('error', (event) => {
  registrarErroOperacional(event.error || new Error(event.message), {
    categoria: 'frontend',
    acao: 'erro_global',
    mensagem: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason || 'Promise rejeitada'));
  registrarErroOperacional(reason, {
    categoria: 'frontend',
    acao: 'promise_rejeitada',
    mensagem: reason.message,
  });
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<div className="app-fallback-error">O Stock-ON encontrou um erro inesperado. Atualize a página e tente novamente.</div>}>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
