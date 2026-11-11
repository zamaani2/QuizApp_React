import { useState, type FC, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  HelpCircle,
  CheckSquare,
  Award,
  PlusCircle,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  GraduationCap,
  MoreHorizontal,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { SignOutForm } from '../SignOutForm';
import { ErrorBoundary } from '../common/ErrorBoundary';
import './portal-shell.css';

export interface TeacherNavItem {
  id: string;
  label: string;
  to: string;
  icon: LucideIcon;
  section: 'Workspace' | 'Assessments';
  isPrimary: boolean;
  isActive: (pathname: string) => boolean;
}

export const TEACHER_NAV_ITEMS: TeacherNavItem[] = [
  {
    id: 'dashboard',
    label: 'Teaching Workspace',
    to: '/teacher/dashboard',
    icon: LayoutDashboard,
    section: 'Workspace',
    isPrimary: true,
    isActive: (p) => p === '/teacher/dashboard' || p === '/teacher' || p === '/teacher/',
  },
  {
    id: 'quizzes',
    label: 'Quiz Catalog',
    to: '/teacher/quizzes',
    icon: HelpCircle,
    section: 'Assessments',
    isPrimary: true,
    isActive: (p) => p === '/teacher/quizzes' || (p.startsWith('/teacher/quizzes/') && !p.endsWith('/new')),
  },
  {
    id: 'grading',
    label: 'Grading Queue',
    to: '/teacher/grading',
    icon: CheckSquare,
    section: 'Assessments',
    isPrimary: true,
    isActive: (p) => p.startsWith('/teacher/grading'),
  },
  {
    id: 'results',
    label: 'Quiz Results',
    to: '/teacher/results',
    icon: Award,
    section: 'Assessments',
    isPrimary: true,
    isActive: (p) => p.startsWith('/teacher/results'),
  },
  {
    id: 'create-quiz',
    label: 'Create Quiz',
    to: '/teacher/quizzes/new',
    icon: PlusCircle,
    section: 'Workspace',
    isPrimary: false,
    isActive: (p) => p === '/teacher/quizzes/new',
  },
];

export interface TeacherAppLayoutProps {
  children?: ReactNode;
}

export const TeacherAppLayout: FC<TeacherAppLayoutProps> = ({ children }) => {
  const { data } = useAuth();
  const location = useLocation();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  // Desktop sidebar collapse state
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('teacher_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('teacher_sidebar_collapsed', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const user = data?.user;
  const school = data?.school;
  const initial =
    user?.full_name?.charAt(0) ||
    user?.first_name?.charAt(0) ||
    user?.username?.charAt(0) ||
    'T';
  const roleDisplay = school?.name ? `${school.name} · Teacher` : 'Teacher';
  const pathname = location.pathname;

  const primaryItems = TEACHER_NAV_ITEMS.filter((item) => item.isPrimary);
  const secondaryItems = TEACHER_NAV_ITEMS.filter((item) => !item.isPrimary);
  const isMoreActive = secondaryItems.some((item) => item.isActive(pathname));

  const workspaceGroup = TEACHER_NAV_ITEMS.filter((item) => item.section === 'Workspace');
  const assessmentsGroup = TEACHER_NAV_ITEMS.filter((item) => item.section === 'Assessments');

  return (
    <div
      className={`portal-shell ${isCollapsed ? 'portal-shell--collapsed' : 'portal-shell--expanded'}`}
      data-testid="teacher-app-layout"
    >
      {/* Desktop Collapsible Left Sidebar (>= 1024px) */}
      <aside
        className={`portal-sidebar ${isCollapsed ? 'portal-sidebar--collapsed' : 'portal-sidebar--expanded'}`}
        data-testid="teacher-desktop-sidebar"
        aria-label="Teacher Sidebar Navigation"
      >
        <div className="portal-sidebar__head">
          {!isCollapsed && (
            <Link to="/teacher/dashboard" className="portal-sidebar__brand">
              <div className="portal-sidebar__brand-icon">
                <GraduationCap size={18} />
              </div>
              <span>QuizApp Teacher</span>
            </Link>
          )}

          <button
            type="button"
            className="portal-sidebar__toggle-btn"
            onClick={toggleCollapse}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        <nav className="portal-sidebar__nav" aria-label="Sidebar navigation">
          {/* Group 1: Workspace */}
          <div className="portal-sidebar__nav-group">
            <p className="portal-sidebar__nav-label">Workspace</p>
            {workspaceGroup.map((item) => {
              const Icon = item.icon;
              const active = item.isActive(pathname);
              return (
                <Link
                  key={item.id}
                  to={item.to}
                  className={`portal-sidebar__link ${active ? 'portal-sidebar__link--active' : ''}`}
                  title={item.label}
                  aria-label={item.label}
                >
                  <span className="portal-sidebar__link-icon" aria-hidden="true">
                    <Icon size={18} />
                  </span>
                  <span className="portal-sidebar__link-text">{item.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Group 2: Assessments */}
          <div className="portal-sidebar__nav-group">
            <p className="portal-sidebar__nav-label">Assessments & Grading</p>
            {assessmentsGroup.map((item) => {
              const Icon = item.icon;
              const active = item.isActive(pathname);
              return (
                <Link
                  key={item.id}
                  to={item.to}
                  className={`portal-sidebar__link ${active ? 'portal-sidebar__link--active' : ''}`}
                  title={item.label}
                  aria-label={item.label}
                >
                  <span className="portal-sidebar__link-icon" aria-hidden="true">
                    <Icon size={18} />
                  </span>
                  <span className="portal-sidebar__link-text">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="portal-sidebar__footer">
          <SignOutForm
            className="portal-sidebar__link"
            title="Sign Out"
            ariaLabel="Sign Out"
          >
            <span className="portal-sidebar__link-icon" aria-hidden="true">
              <LogOut size={18} />
            </span>
            <span className="portal-sidebar__link-text">Sign Out</span>
          </SignOutForm>
        </div>
      </aside>

      {/* Top Header */}
      <header className="portal-header" role="banner">
        <div className="portal-header__inner">
          <div className="portal-header__left">
            <Link to="/teacher/dashboard" className="portal-header__brand-mobile">
              <GraduationCap size={20} className="core-text--primary" />
              <span>QuizApp</span>
            </Link>
            <span className="portal-role-badge">
              <span className="portal-role-badge__dot" aria-hidden="true" />
              {roleDisplay}
            </span>
          </div>

          <div className="portal-header__right">
            <div className="portal-header__user">
              <div className="portal-avatar-pill" title={user?.full_name || user?.username || 'Teacher'}>
                {initial}
              </div>
              <div className="portal-user-meta">
                <span className="portal-user-meta__name">
                  {user?.full_name || user?.username || 'Teacher'}
                </span>
                <span className="portal-user-meta__role">Teaching Staff</span>
              </div>
            </div>

            <SignOutForm
              className="portal-header__btn"
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut size={16} />
            </SignOutForm>
          </div>
        </div>
      </header>

      {/* Main Content View */}
      <main className="portal-main" id="main-content">
        <div className="portal-main__inner core-content">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </div>
      </main>

      {/* Mobile Fixed Bottom Navigation (< 1024px) */}
      <nav
        className="portal-bottom-nav"
        data-testid="teacher-mobile-bottom-nav"
        aria-label="Teacher Mobile Navigation"
      >
        {primaryItems.map((item) => {
          const Icon = item.icon;
          const active = item.isActive(pathname);
          return (
            <Link
              key={item.id}
              to={item.to}
              className={`portal-bottom-nav__item ${active ? 'portal-bottom-nav__item--active' : ''}`}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={20} aria-hidden="true" />
              <span>{item.label === 'Teaching Workspace' ? 'Home' : item.label.replace('Quiz ', '')}</span>
            </Link>
          );
        })}

        {/* More Button */}
        <button
          type="button"
          className={`portal-bottom-nav__item ${isMoreActive ? 'portal-bottom-nav__item--active' : ''}`}
          onClick={() => setIsMoreOpen(true)}
          aria-label="More navigation options"
          aria-expanded={isMoreOpen}
        >
          <MoreHorizontal size={20} aria-hidden="true" />
          <span>More</span>
        </button>
      </nav>

      {/* Mobile "More" Drawer Sheet */}
      {isMoreOpen && (
        <>
          <div
            className="portal-more-backdrop"
            onClick={() => setIsMoreOpen(false)}
            aria-hidden="true"
          />
          <div
            className="portal-more-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="More Options"
          >
            <div className="portal-more-sheet__header">
              <h3 className="portal-more-sheet__title">More Teacher Options</h3>
              <button
                type="button"
                className="portal-more-sheet__close"
                onClick={() => setIsMoreOpen(false)}
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </div>
            <div className="portal-more-sheet__body">
              <p className="portal-more-sheet__group-label">Quick Actions</p>
              {secondaryItems.map((item) => {
                const Icon = item.icon;
                const active = item.isActive(pathname);
                return (
                  <Link
                    key={item.id}
                    to={item.to}
                    className={`portal-more-sheet__item ${active ? 'portal-more-sheet__item--active' : ''}`}
                    onClick={() => setIsMoreOpen(false)}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}

              <p className="portal-more-sheet__group-label">Session</p>
              <SignOutForm
                className="portal-more-sheet__item core-text--danger"
                ariaLabel="Sign Out"
                onClick={() => setIsMoreOpen(false)}
              >
                <LogOut size={18} />
                <span>Sign Out</span>
              </SignOutForm>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
