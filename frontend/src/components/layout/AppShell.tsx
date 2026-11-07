import { useState, type FC, type ReactNode } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { Footer } from './Footer';
import { ErrorBoundary } from '../common/ErrorBoundary';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  active?: boolean;
}

export interface AppShellProps {
  title?: string;
  breadcrumbs?: BreadcrumbItem[];
  children?: ReactNode;
  activePath?: string;
}

export const AppShell: FC<AppShellProps> = ({
  title = 'React Workspace',
  breadcrumbs = [{ label: 'React Workspace', active: true }],
  children,
  activePath = '/app/',
}) => {
  const { loading, error, refetch } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const authHref = `/auth-app/?next=${encodeURIComponent(currentPath)}`;

  if (loading) {
    return (
      <main className="core-gate" role="status">
        <div className="core-loading"><span className="core-spinner" aria-hidden="true" />Loading authenticated workspace...</div>
      </main>
    );
  }

  if (error) {
    if (error.status === 401) {
      return (
        <main className="core-gate">
          <section className="core-gate__panel">
            <p className="core-eyebrow">SESSION SECURITY</p>
            <h1>Session expired</h1>
            <p>Your session is no longer active. Sign in again to continue to the page you requested.</p>
            <a href={authHref} className="core-button">Log in to QuizApp</a>
          </section>
        </main>
      );
    }

    if (error.status === 403) {
      return (
        <main className="core-gate">
          <section className="core-gate__panel">
            <p className="core-eyebrow">ACCESS CONTROL</p>
            <h1>Access restricted</h1>
            <p>{error.message || 'A valid school association is required to access this application.'}</p>
            <div className="core-gate__actions">
              <button className="core-button" type="button" onClick={() => refetch()}>Retry</button>
              <a href="/app/" className="core-button core-button--quiet">Back to workspace</a>
            </div>
          </section>
        </main>
      );
    }

    return (
      <main className="core-gate">
        <section className="core-gate__panel" role="alert">
          <p className="core-eyebrow">SYSTEM STATUS</p>
          <h1>Application unavailable</h1>
          <div className="core-alert">{error.message}</div>
          <button className="core-button" type="button" onClick={() => refetch()}>Retry connection</button>
        </section>
      </main>
    );
  }

  return (
    <div className="core-app">
      <Header
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        isSidebarOpen={isSidebarOpen}
      />

      <div className="core-app__body">
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          activePath={activePath}
        />

        <main className="core-app__main" id="main-content" tabIndex={-1}>
          <header className="core-page-head">
            <div>
              <p className="core-eyebrow">QUIZAPP WORKSPACE</p>
              <h1>{title}</h1>
            </div>
            <nav aria-label="Breadcrumb">
              <ol className="core-breadcrumbs">
                  {breadcrumbs.map((bc, idx) => (
                    <li
                      key={idx}
                      aria-current={bc.active ? 'page' : undefined}
                    >
                      {bc.href && !bc.active ? (
                        <a href={bc.href}>
                          {bc.label}
                        </a>
                      ) : (
                        bc.label
                      )}
                    </li>
                  ))}
              </ol>
            </nav>
          </header>

          <div className="core-app__content core-content">
            <ErrorBoundary>{children}</ErrorBoundary>
          </div>

          <Footer />
        </main>
      </div>
    </div>
  );
};
