import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './components/layout/core-shell.css';

const rootElement = document.getElementById('root');
if (window.location.pathname === '/') {
  window.location.replace('/app/');
} else if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
