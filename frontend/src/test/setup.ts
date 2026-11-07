import '@testing-library/jest-dom';

// Default to /app/ base path for React Router JSDOM tests
if (typeof window !== 'undefined' && window.location.pathname === '/') {
  window.history.pushState({}, '', '/app/');
}
