import { type FC, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';

interface AppShellProps {
  children?: ReactNode;
}

export const AppShell: FC<AppShellProps> = ({ children }) => {
  const { data, loading, error } = useAuth();

  if (loading) {
    return (
      <div className="container py-5 text-center" role="status">
        <div className="spinner-border text-primary" aria-hidden="true">
          <span className="visually-hidden">Loading application...</span>
        </div>
        <p className="mt-3 text-muted">Loading authenticated workspace...</p>
      </div>
    );
  }

  if (error) {
    if (error.status === 401) {
      return (
        <div className="container py-5">
          <div className="alert alert-warning" role="alert">
            <h4 className="alert-heading">Session Expired</h4>
            <p>Your session is not active or has expired. Please log in to continue.</p>
            <hr />
            <a href="/login/?next=/app/" className="btn btn-primary">
              Log In
            </a>
          </div>
        </div>
      );
    }

    if (error.status === 403) {
      return (
        <div className="container py-5">
          <div className="alert alert-danger" role="alert">
            <h4 className="alert-heading">Access Restricted</h4>
            <p>{error.message || 'A valid school association is required to access this application.'}</p>
            <hr />
            <a href="/app/" className="btn btn-secondary">
              Back to Dashboard
            </a>
          </div>
        </div>
      );
    }

    return (
      <div className="container py-5">
        <div className="alert alert-danger" role="alert">
          <h4 className="alert-heading">Application Error</h4>
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
      <header className="navbar navbar-expand-lg navbar-dark bg-dark px-3 shadow-sm">
        <div className="container-fluid">
          <span className="navbar-brand fw-bold mb-0">
            {school?.name ? `${school.name} (QuizApp)` : 'QuizApp'}
          </span>

          <div className="d-flex align-items-center gap-3">
            <span className="badge bg-primary text-uppercase">{roleName}</span>
            <span className="text-light small">{user?.full_name || user?.username}</span>
            <a href="/app/" className="btn btn-outline-light btn-sm">
              Django Portal
            </a>
            <a href="/logout/" className="btn btn-outline-danger btn-sm">
              Log Out
            </a>
          </div>
        </div>
      </header>

      <main className="container py-4" id="main-content">
        {children || (
          <div className="card shadow-sm border-0">
            <div className="card-body p-4">
              <h2 className="card-title h4 mb-3">React Foundation Ready</h2>
              <p className="card-text text-muted">
                Welcome, <strong>{user?.full_name || user?.username}</strong>. The React + TypeScript +
                Vite foundation is active under the <code>/app/</code> route namespace.
              </p>
              <ul className="list-group list-group-flush mb-3">
                <li className="list-group-item d-flex justify-content-between align-items-center">
                  <span>Authentication</span>
                  <span className="badge bg-success">Django Session Active</span>
                </li>
                <li className="list-group-item d-flex justify-content-between align-items-center">
                  <span>Role Scoping</span>
                  <span className="badge bg-info text-dark">{user?.role}</span>
                </li>
                <li className="list-group-item d-flex justify-content-between align-items-center">
                  <span>Tenant (School)</span>
                  <span className="badge bg-secondary">{school?.name || 'Global / Superadmin'}</span>
                </li>
              </ul>
              <div className="text-muted small">
                Strangler migration status: Foundation phase active. Existing Django pages remain primary.
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
