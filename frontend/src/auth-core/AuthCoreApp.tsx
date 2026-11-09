import { useEffect, useState, type FormEvent } from 'react';
import { apiClient } from '../api/client';
import { getCsrfToken } from '../api/csrf';
import { getCurrentUser } from '../api/me';
import { ApiError, type CurrentUserResponse } from '../types';

type SessionState = 'loading' | 'anonymous' | 'authenticated' | 'unavailable';
interface LoginResponse {
  success: true;
  redirect_url: string;
}
interface PasswordResetResponse {
  success: true;
  message?: string;
  redirect_url?: string;
}

export function AuthCoreApp() {
  const [sessionState, setSessionState] = useState<SessionState>('loading');
  const [identity, setIdentity] = useState<CurrentUserResponse | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetSubmitting, setResetSubmitting] = useState(false);

  const loadSession = async () => {
    setSessionState('loading');
    try {
      const currentUser = await getCurrentUser();
      setIdentity(currentUser);
      setSessionState('authenticated');
    } catch (error) {
      setIdentity(null);
      setSessionState(error instanceof ApiError && error.status === 401 ? 'anonymous' : 'unavailable');
    }
  };

  useEffect(() => {
    void loadSession();
  }, []);

  const csrfToken = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || getCsrfToken() || '';
  const searchParams = new URLSearchParams(window.location.search);
  const isSuperadminPortal = searchParams.get('portal') === 'superadmin';
  const resetFlow = searchParams.get('flow');
  const resetUid = searchParams.get('uid') || '';
  const resetToken = searchParams.get('token') || '';
  const isResetRequest = resetFlow === 'password-reset';
  const isResetConfirm = resetFlow === 'password-reset-confirm';
  const isResetStatus = resetFlow === 'password-reset-sent' || resetFlow === 'password-reset-complete';
  const isResetFlow = isResetRequest || isResetConfirm || isResetStatus;
  const requestedNext =
    searchParams.get('next') || (isSuperadminPortal ? '/app/superadmin/dashboard' : '/app/');
  const loginAction = isSuperadminPortal
    ? `/superadmin/login/?next=${encodeURIComponent(requestedNext)}`
    : `/login/?next=${encodeURIComponent(requestedNext)}`;
  const workspaceHref = identity?.user.role === 'superadmin'
    ? '/app/superadmin/dashboard'
    : '/app/';
  const logoutAction = identity?.user.role === 'superadmin'
    ? '/superadmin/logout/'
    : '/logout/';

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError(null);
    setSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const body = new URLSearchParams();
    for (const field of ['username', 'password', 'remember']) {
      const value = formData.get(field);
      if (typeof value === 'string') body.set(field, value);
    }

    try {
      const response = await apiClient<LoginResponse>(loginAction, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body,
      });
      const destination = new URL(response.redirect_url, window.location.origin);
      if (destination.origin !== window.location.origin) {
        throw new Error('The server returned an invalid sign-in destination.');
      }
      window.location.assign(`${destination.pathname}${destination.search}${destination.hash}`);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Sign-in failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitPasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setResetError(null);
    setResetMessage(null);
    setResetSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const body = new URLSearchParams();
    const fields = isResetConfirm
      ? ['new_password1', 'new_password2']
      : ['email'];
    for (const field of fields) {
      const value = formData.get(field);
      if (typeof value === 'string') body.set(field, value);
    }

    const action = isResetConfirm
      ? `/password-reset/${encodeURIComponent(resetUid)}/${encodeURIComponent(resetToken)}/`
      : '/password-reset/';
    try {
      const response = await apiClient<PasswordResetResponse>(action, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body,
      });
      if (response.redirect_url) {
        window.location.assign(response.redirect_url);
      } else {
        setResetMessage(response.message || 'Password reset request received.');
      }
    } catch (error) {
      setResetError(error instanceof Error ? error.message : 'Password reset failed. Please try again.');
    } finally {
      setResetSubmitting(false);
    }
  };

  return (
    <main className="auth-core">
      <section className="auth-core__rail" aria-label="QuizApp system information">
        <a className="auth-core__brand" href="/" aria-label="QuizApp home">
          <span className="auth-core__brand-mark">Q</span>
          <span>QuizApp</span>
        </a>
        <div className="auth-core__rail-copy">
          <p className="auth-core__eyebrow">LEARNING PLATFORM</p>
          <h1>One secure place for every school workspace.</h1>
          <p className="auth-core__rail-description">
            Sign in with your school account to continue to your classes, assessments, and results.
          </p>
        </div>
        <div className="auth-core__rail-footer">
          <span className="auth-core__status-dot" />
          <span>School access portal</span>
          <span className="auth-core__rail-divider" />
          <span>Session protected</span>
        </div>
        <span className="auth-core__rail-index" aria-hidden="true">01 / ACCESS</span>
      </section>

      <section className="auth-core__main">
        <header className="auth-core__topbar">
          <span>{isSuperadminPortal ? 'SUPERADMIN ACCESS' : 'AUTHENTICATION & SYSTEM CORE'}</span>
        </header>

        {sessionState === 'loading' && (
          <div className="auth-core__content" role="status">Checking your session...</div>
        )}

        {sessionState === 'anonymous' && isResetRequest && (
          <div className="auth-core__content">
            <p className="auth-core__eyebrow">ACCOUNT RECOVERY</p>
            <h2>Reset your password</h2>
            <p className="auth-core__intro">
              Enter the email address linked to your account. If it exists, we will send a secure reset link.
            </p>
            <form className="auth-core__form" onSubmit={submitPasswordReset}>
              {resetError && <p className="auth-core__error" role="alert">{resetError}</p>}
              {resetMessage && <p className="auth-core__intro" role="status">{resetMessage}</p>}
              <label htmlFor="reset-email">Email address</label>
              <input id="reset-email" name="email" type="email" autoComplete="email" required />
              <button className="auth-core__submit" type="submit" disabled={resetSubmitting}>
                {resetSubmitting ? 'Sending...' : 'Send reset link'} <span aria-hidden="true">&#8594;</span>
              </button>
            </form>
            <p className="auth-core__support"><a href="/auth-app/">Back to sign in</a></p>
          </div>
        )}

        {sessionState === 'anonymous' && isResetConfirm && (
          <div className="auth-core__content">
            <p className="auth-core__eyebrow">ACCOUNT RECOVERY</p>
            <h2>Choose a new password</h2>
            <p className="auth-core__intro">Set a new password for your QuizApp account.</p>
            <form className="auth-core__form" onSubmit={submitPasswordReset}>
              {resetError && <p className="auth-core__error" role="alert">{resetError}</p>}
              <label htmlFor="new-password">New password</label>
              <input id="new-password" name="new_password1" type="password" autoComplete="new-password" required />
              <label htmlFor="confirm-password">Confirm new password</label>
              <input id="confirm-password" name="new_password2" type="password" autoComplete="new-password" required />
              <button className="auth-core__submit" type="submit" disabled={resetSubmitting}>
                {resetSubmitting ? 'Updating...' : 'Update password'} <span aria-hidden="true">&#8594;</span>
              </button>
            </form>
            <p className="auth-core__support"><a href="/auth-app/">Back to sign in</a></p>
          </div>
        )}

        {sessionState === 'anonymous' && isResetStatus && (
          <div className="auth-core__content">
            <p className="auth-core__eyebrow">ACCOUNT RECOVERY</p>
            <h2>
              {resetFlow === 'password-reset-sent' ? 'Check your email' : 'Password updated'}
            </h2>
            <p className="auth-core__intro" role="status">
              {resetFlow === 'password-reset-sent'
                ? 'If an account with that email exists, a password reset link has been sent.'
                : 'Your password has been updated. You can now sign in.'}
            </p>
            <a className="auth-core__submit auth-core__workspace-link" href="/auth-app/">
              Return to sign in <span aria-hidden="true">&#8594;</span>
            </a>
          </div>
        )}

        {sessionState === 'anonymous' && !isResetFlow && (
          <div className="auth-core__content">
            <p className="auth-core__eyebrow">{isSuperadminPortal ? 'SYSTEM ADMINISTRATION' : 'WELCOME BACK'}</p>
            <h2>{isSuperadminPortal ? 'Superadmin sign in' : 'Sign in to QuizApp'}</h2>
            <p className="auth-core__intro">
              {isSuperadminPortal
                ? 'Use your authorized superadministrator account to manage QuizApp schools.'
                : 'Use the username or email address linked to your school account.'}
            </p>
            <form className="auth-core__form" method="post" action={loginAction} onSubmit={submitLogin}>
              <input type="hidden" name="csrfmiddlewaretoken" value={csrfToken} />
              {loginError && <p className="auth-core__error" role="alert">{loginError}</p>}
              <label htmlFor="auth-identifier">Username or email</label>
              <input
                id="auth-identifier"
                name="username"
                type="text"
                autoComplete="username"
                placeholder="name@school.edu"
                required
              />
              <div className="auth-core__password-label">
                <label htmlFor="auth-password">Password</label>
                <a href="/auth-app/?flow=password-reset">Forgot password?</a>
              </div>
              <input
                id="auth-password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                required
              />
              <label className="auth-core__remember">
                <input type="checkbox" name="remember" />
                <span>Keep me signed in for 30 days</span>
              </label>
              <button className="auth-core__submit" type="submit" disabled={submitting}>
                {submitting ? 'Signing in...' : 'Continue to workspace'} <span aria-hidden="true">&#8594;</span>
              </button>
            </form>
            <p className="auth-core__support">
              {isSuperadminPortal ? (
                <>School user? <a href="/auth-app/">Use school sign-in</a></>
              ) : (
                <>Superadmin? <a href="/auth-app/?portal=superadmin">Use the superadmin sign-in</a></>
              )}
            </p>
          </div>
        )}

        {sessionState === 'authenticated' && identity && (
          <div className="auth-core__content auth-core__content--system">
            <p className="auth-core__eyebrow">SYSTEM CORE</p>
            <h2>Your session is ready.</h2>
            <p className="auth-core__intro">You are signed in to the QuizApp school platform.</p>
            <div className="auth-core__identity">
              <span className="auth-core__identity-label">SIGNED IN AS</span>
              <strong>{identity.user.full_name || identity.user.username}</strong>
              <span>{identity.user.email || identity.user.username}</span>
              <span className="auth-core__role">{identity.user.role}</span>
            </div>
            <dl className="auth-core__details">
              <div><dt>School</dt><dd>{identity.school?.name ?? 'Superadmin access'}</dd></div>
              <div><dt>Session</dt><dd>Active · Django secure session</dd></div>
              <div><dt>Interface</dt><dd>React workspace available</dd></div>
            </dl>
            <a className="auth-core__submit auth-core__workspace-link" href={workspaceHref}>
              Open your workspace <span aria-hidden="true">&#8594;</span>
            </a>
            <form method="post" action={logoutAction} className="auth-core__logout">
              <input type="hidden" name="csrfmiddlewaretoken" value={csrfToken} />
              <button type="submit">Sign out of this session</button>
            </form>
          </div>
        )}

        {sessionState === 'unavailable' && (
          <div className="auth-core__content" role="alert">
            <p className="auth-core__eyebrow">CONNECTION ISSUE</p>
            <h2>System status unavailable.</h2>
            <p className="auth-core__intro">We could not verify your session. Check your connection and try again.</p>
            <button className="auth-core__submit" type="button" onClick={() => void loadSession()}>
              Retry session check <span aria-hidden="true">&#8594;</span>
            </button>
          </div>
        )}

        <footer className="auth-core__footer">
          <span>QuizApp</span>
          <span>Authentication handled by your school server</span>
        </footer>
      </section>
    </main>
  );
}
