import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuthCoreApp } from './AuthCoreApp';

describe('Authentication and System Core', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.head.innerHTML = '<meta name="csrf-token" content="test-csrf-token">';
    document.cookie = 'csrftoken=test-csrf-token; path=/';
    window.history.replaceState({}, '', '/auth-app/');
  });

  it('shows a Django-backed sign-in form for an anonymous session', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ code: 'UNAUTHORIZED', message: 'Authentication required' }),
    });

    render(<AuthCoreApp />);

    expect(await screen.findByRole('heading', { name: 'Sign in to QuizApp' })).toBeInTheDocument();
    expect(screen.getByLabelText('Username or email')).toHaveAttribute('name', 'username');
    expect(screen.getByLabelText('Password')).toHaveAttribute('name', 'password');
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/password-reset/');
    expect(document.querySelector('form')).toHaveAttribute('action', '/login/?next=%2Fapp%2F');
    expect(document.querySelector('form')).toHaveAttribute('method', 'post');
    expect(document.querySelector('input[name="csrfmiddlewaretoken"]')).toHaveValue('test-csrf-token');
  });

  it('shows session identity and workspace controls for an authenticated user', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        user: { id: 4, username: 'admin', email: 'admin@school.test', full_name: 'School Admin', role: 'admin' },
        school: { name: 'North School' },
      }),
    });

    render(<AuthCoreApp />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Your session is ready.' })).toBeInTheDocument());
    expect(screen.getByText('School Admin')).toBeInTheDocument();
    expect(screen.getByText('North School')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open your workspace/i })).toHaveAttribute('href', '/app/');
    expect(document.querySelector('form[action="/logout/"] input[name="csrfmiddlewaretoken"]')).toHaveValue('test-csrf-token');
  });

  it('keeps credential failures in the React sign-in view', async () => {
    const unauthorized = {
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password. Please try again.',
      }),
    };
    const fetchMock = vi.fn().mockResolvedValueOnce(unauthorized).mockResolvedValueOnce(unauthorized);
    global.fetch = fetchMock;

    render(<AuthCoreApp />);

    await screen.findByRole('heading', { name: 'Sign in to QuizApp' });
    fireEvent.change(screen.getByLabelText('Username or email'), { target: { value: 'unknown' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'incorrect' } });
    fireEvent.click(screen.getByRole('button', { name: /continue to workspace/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid username or password. Please try again.'
    );
    const [, options] = fetchMock.mock.calls[1];
    expect(fetchMock.mock.calls[1][0]).toBe('/login/?next=%2Fapp%2F');
    expect(options?.method).toBe('POST');
    expect(new Headers(options?.headers).get('Accept')).toBe('application/json');
    expect(new Headers(options?.headers).get('X-CSRFToken')).toBe('test-csrf-token');
  });

  it('shows the separate superadmin sign-in portal', async () => {
    window.history.replaceState({}, '', '/auth-app/?portal=superadmin');
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ code: 'UNAUTHORIZED', message: 'Authentication required' }),
    });

    render(<AuthCoreApp />);

    expect(await screen.findByRole('heading', { name: 'Superadmin sign in' })).toBeInTheDocument();
    expect(document.querySelector('form')).toHaveAttribute(
      'action',
      '/superadmin/login/?next=%2Fapp%2Fsuperadmin%2Fdashboard'
    );
    expect(screen.getByRole('link', { name: 'Use school sign-in' })).toHaveAttribute(
      'href',
      '/auth-app/'
    );
    expect(screen.queryByRole('link', { name: /classic sign in/i })).not.toBeInTheDocument();
  });

  it('submits superadmin credentials only to the superadmin Django handler', async () => {
    const unauthorized = {
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ code: 'UNAUTHORIZED', message: 'Authentication required' }),
    };
    const forbidden = {
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({
        code: 'SUPERADMIN_LOGIN_REQUIRED',
        message: 'Access denied. This login is for superadministrators only.',
      }),
    };
    const fetchMock = vi.fn().mockResolvedValueOnce(unauthorized).mockResolvedValueOnce(forbidden);
    global.fetch = fetchMock;
    window.history.replaceState({}, '', '/auth-app/?portal=superadmin');

    render(<AuthCoreApp />);
    await screen.findByRole('heading', { name: 'Superadmin sign in' });
    fireEvent.change(screen.getByLabelText('Username or email'), { target: { value: 'school-admin' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: /continue to workspace/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Access denied. This login is for superadministrators only.'
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      '/superadmin/login/?next=%2Fapp%2Fsuperadmin%2Fdashboard'
    );
  });
});
