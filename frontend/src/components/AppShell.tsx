import { type FC, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';

interface AppShellProps {
  children?: ReactNode;
}

export const AppShell: FC<AppShellProps> = ({ children }) => {
  const { data, loading, error } = useAuth();

  if (loading) {
    return (
      <div className="core-container core-space--padding-y-5 core-text--center" role="status">
        <div className="core-spinner core-text--primary" aria-hidden="true">
          <span className="core-visually-hidden">Loading application...</span>
        </div>
        <p className="core-space--margin-top-3 core-text--muted">Loading authenticated workspace...</p>
      </div>
    );
  }

  if (error) {
    if (error.status === 401) {
      return (
        <div className="core-container core-space--padding-y-5">
          <div className="core-alert core-alert--warning" role="alert">
            <h4 className="core-alert__heading">Session Expired</h4>
            <p>Your session is not active or has expired. Please log in to continue.</p>
            <hr />
            <a href="/login/?next=/app/" className="core-button core-button--primary">
              Log In
            </a>
          </div>
        </div>
      );
    }

    if (error.status === 403) {
      return (
        <div className="core-container core-space--padding-y-5">
          <div className="core-alert core-alert--danger" role="alert">
            <h4 className="core-alert__heading">Access Restricted</h4>
            <p>{error.message || 'A valid school association is required to access this application.'}</p>
            <hr />
            <a href="/app/" className="core-button core-button--secondary">
              Back to Dashboard
            </a>
          </div>
        </div>
      );
    }

    return (
      <div className="core-container core-space--padding-y-5">
        <div className="core-alert core-alert--danger" role="alert">
          <h4 className="core-alert__heading">Application Error</h4>
          <p>{error.message}</p>
        </div>
      </div>
    );
  }

  const user = data?.user;
  const school = data?.school;
  const roleName = user?.role ? user.role.toUpperCase() : 'UNKNOWN';

  return (
    <div className="react-app-root">
      <header className="core-navbar core-navbar--expand-lg core-navbar--dark core-surface--dark core-space--padding-x-3 core-shadow--sm">
        <div className="core-container">
          <span className="core-navbar__brand core-type--weight-bold core-space--margin-bottom-0">
            {school?.name ? `${school.name} (QuizApp)` : 'QuizApp'}
          </span>

          <div className="core-display-flex core-layout--align-center core-layout--gap-3">
            <span className="core-badge core-surface--primary core-text--uppercase">{roleName}</span>
            <span className="core-text--light core-type--small">{user?.full_name || user?.username}</span>
            <a href="/app/" className="core-button core-button--outline-light core-button--sm">
              Django Portal
            </a>
            <a href="/logout/" className="core-button core-button--outline-danger core-button--sm">
              Log Out
            </a>
          </div>
        </div>
      </header>

      <main className="core-container core-space--padding-y-4" id="main-content">
        {children || (
          <div className="core-card core-shadow--sm core-border--none">
            <div className="core-card__body core-space--padding-4">
              <h2 className="core-card__title core-type--heading-4 core-space--margin-bottom-3">React Foundation Ready</h2>
              <p className="core-card__text core-text--muted">
                Welcome, <strong>{user?.full_name || user?.username}</strong>. The React + TypeScript +
                Vite foundation is active under the <code>/app/</code> route namespace.
              </p>
              <ul className="core-list core-list--flush core-space--margin-bottom-3">
                <li className="core-list__item core-display-flex core-layout--justify-between core-layout--align-center">
                  <span>Authentication</span>
                  <span className="core-badge core-surface--success">Django Session Active</span>
                </li>
                <li className="core-list__item core-display-flex core-layout--justify-between core-layout--align-center">
                  <span>Role Scoping</span>
                  <span className="core-badge core-surface--info core-text--dark">{user?.role}</span>
                </li>
                <li className="core-list__item core-display-flex core-layout--justify-between core-layout--align-center">
                  <span>Tenant (School)</span>
                  <span className="core-badge core-surface--secondary">{school?.name || 'Global / Superadmin'}</span>
                </li>
              </ul>
              <div className="core-text--muted core-type--small">
                Strangler migration status: Foundation phase active. Existing Django pages remain primary.
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
