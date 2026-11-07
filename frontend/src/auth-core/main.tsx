import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { AuthCoreApp } from './AuthCoreApp';
import './auth-core.css';

const rootElement = document.getElementById('auth-core-root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <StrictMode>
      <AuthCoreApp />
    </StrictMode>
  );
}