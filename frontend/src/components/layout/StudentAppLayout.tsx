import { useState, type FC, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Home,
  HelpCircle,
  ClipboardList,
  Award,
  User,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Bell,
  LogOut,
  GraduationCap,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { ErrorBoundary } from '../common/ErrorBoundary';
import '../../features/student/student.css';

export interface StudentNavItem {
  id: string;
  label: string;
  to: string;
  icon: LucideIcon;
  isActive: (pathname: string) => boolean;
}

export const STUDENT_NAV_ITEMS: StudentNavItem[] = [
  {
    id: 'home',
    label: 'Home',
    to: '/student/dashboard',
    icon: Home,
    isActive: (p) => p === '/student/dashboard' || p === '/student' || p === '/student/',
  },
  {
    id: 'quizzes',
    label: 'Quizzes',
    to: '/student/quizzes',
    icon: HelpCircle,
    isActive: (p) => p.startsWith('/student/quizzes'),
  },
  {
    id: 'assignments',
    label: 'Assignments',
    to: '/student/assignments',
    icon: ClipboardList,
    isActive: (p) => p.startsWith('/student/assignments'),
  },
  {
    id: 'results',
    label: 'Results',
    to: '/student/attempts',
    icon: Award,
    isActive: (p) => p.startsWith('/student/attempts'),
  },
  {
    id: 'account',
    label: 'Account',
    to: '/student/profile',
    icon: User,
    isActive: (p) => p.startsWith('/student/profile'),
  },
];

export interface StudentAppLayoutProps {
  children?: ReactNode;
}

export const StudentAppLayout: FC<StudentAppLayoutProps> = ({ children }) => {
  const { data } = useAuth();
  const location = useLocation();

  // Desktop sidebar collapse state (persisted in localStorage if available)
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('stu_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('stu_sidebar_collapsed', String(next));
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
    'S';
  const roleDisplay = school?.name ? `${school.name}` : 'Student';
  const pathname = location.pathname;

  return (
    <div className="stu-app-shell" data-testid="student-app-layout">
      {/* Desktop Collapsible Left Sidebar (1024px and above) */}
      <aside
        className={`stu-sidebar ${isCollapsed ? 'stu-sidebar--collapsed' : 'stu-sidebar--expanded'}`}
        data-testid="student-desktop-sidebar"
        aria-label="Student Sidebar Navigation"
      >
        {/* Brand / Logo & Collapse Toggle */}
        <div className="stu-sidebar__head">
          {!isCollapsed && (
            <Link to="/student/dashboard" className="stu-sidebar__brand">
              <div className="stu-sidebar__brand-icon">
                <GraduationCap size={18} />
              </div>
              <span>QuizApp</span>
            </Link>
          )}

          <button
            type="button"
            className="stu-sidebar__toggle-btn"
            onClick={toggleCollapse}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        {/* Unified Navigation Links (Lucide Icons) */}
        <nav className="stu-sidebar__nav" aria-label="Desktop Student Navigation">
          {STUDENT_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = item.isActive(pathname);
            return (
              <Link
                key={item.id}
                to={item.to}
                className={`stu-sidebar__link ${active ? 'stu-sidebar__link--active' : ''}`}
                title={item.label}
                aria-label={item.label}
              >
                <span className="stu-sidebar__link-icon" aria-hidden="true">
                  <Icon size={19} />
                </span>
                {!isCollapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer with Student Avatar and Logout */}
        <div className="stu-sidebar__footer">
          <Link
            to="/student/profile"
            className="stu-sidebar__user"
            title={`View profile for ${user?.full_name || 'Student'}`}
          >
            <div className="stu-avatar-pill" style={{ width: '32px', height: '32px', fontSize: '0.85rem' }}>
              {initial}
            </div>
            {!isCollapsed && (
              <div className="stu-sidebar__user-info">
                <div className="stu-sidebar__user-name">{user?.full_name || user?.username}</div>
                <div className="stu-sidebar__user-role">{school?.name || 'Student'}</div>
              </div>
            )}
          </Link>

          <a
            href="/auth-app/?next=%2Fapp%2F"
            className={`stu-sidebar__link text-danger ${isCollapsed ? 'justify-content-center px-0' : ''}`}
            title="Sign out of student account"
            aria-label="Sign out"
          >
            <span className="stu-sidebar__link-icon" aria-hidden="true">
              <LogOut size={18} />
            </span>
            {!isCollapsed && <span>Sign Out</span>}
          </a>
        </div>
      </aside>

      {/* Compact Top Header */}
      <header
        className={`stu-header ${
          isCollapsed ? 'stu-header--with-sidebar-collapsed' : 'stu-header--with-sidebar-expanded'
        }`}
        role="banner"
      >
        <div className="stu-header__inner">
          <div className="stu-header__left">
            <Link to="/student/profile" className="text-decoration-none" title="View Student Profile">
              <div className="stu-avatar-pill" aria-label={`Logged in as ${user?.full_name || 'Student'}`}>
                {initial}
              </div>
            </Link>

            <div className="stu-role-badge" title={school?.name || 'Student Access'}>
              <span className="stu-role-badge__dot" aria-hidden="true" />
              <span>{roleDisplay}</span>
            </div>
          </div>

          {/* Header Action Icons */}
          <div className="stu-header__actions">
            <Link
              to="/student/quizzes"
              className="stu-icon-btn"
              title="Search Quizzes"
              aria-label="Search Quizzes"
            >
              <Search size={18} aria-hidden="true" />
            </Link>

            <Link
              to="/student/dashboard"
              className="stu-icon-btn"
              title="Notifications"
              aria-label="Notifications"
            >
              <Bell size={18} aria-hidden="true" />
              <span className="stu-icon-btn__badge">1</span>
            </Link>

            <a
              href="/auth-app/?next=%2Fapp%2F"
              className="stu-icon-btn d-none d-md-flex"
              title="Sign Out / Switch Session"
              aria-label="Sign Out"
            >
              <LogOut size={18} aria-hidden="true" />
            </a>
          </div>
        </div>
      </header>

      {/* Main Page Content */}
      <main
        className={`stu-main-content ${
          isCollapsed
            ? 'stu-main-content--with-sidebar-collapsed'
            : 'stu-main-content--with-sidebar-expanded'
        }`}
        id="student-main-content"
      >
        <div className="core-content">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </div>
      </main>

      {/* Mobile Fixed Bottom Navigation Bar (below 1024px) */}
      <nav className="stu-bottom-nav" aria-label="Mobile Bottom Navigation">
        <div className="stu-bottom-nav__inner">
          {STUDENT_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = item.isActive(pathname);
            return (
              <Link
                key={item.id}
                to={item.to}
                className={`stu-bottom-tab ${active ? 'stu-bottom-tab--active' : ''}`}
                aria-label={item.label}
              >
                <Icon size={20} aria-hidden="true" />
                <span>{item.label}</span>
                {active && <span className="stu-bottom-tab__indicator" aria-hidden="true" />}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default StudentAppLayout;
