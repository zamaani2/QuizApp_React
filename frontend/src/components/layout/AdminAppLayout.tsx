import { useState, type FC, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Building,
  BookOpen,
  Calendar,
  CalendarRange,
  Layers,
  ShieldCheck,
  Settings,
  UserPlus,
  ClipboardCheck,
  Landmark,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  GraduationCap,
  MoreHorizontal,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { ErrorBoundary } from '../common/ErrorBoundary';
import './portal-shell.css';

export interface AdminNavItem {
  id: string;
  label: string;
  to: string;
  icon: LucideIcon;
  section: 'Directory' | 'Academics' | 'Settings' | 'Console' | 'Structure';
  isPrimary: boolean;
  isActive: (pathname: string) => boolean;
}

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    to: '/admin/dashboard',
    icon: LayoutDashboard,
    section: 'Directory',
    isPrimary: true,
    isActive: (p) => p === '/admin/dashboard' || p === '/admin' || p === '/admin/',
  },
  {
    id: 'students',
    label: 'All Students',
    to: '/admin/students',
    icon: Users,
    section: 'Directory',
    isPrimary: true,
    isActive: (p) => p.startsWith('/admin/students'),
  },
  {
    id: 'teachers',
    label: 'All Teachers',
    to: '/admin/teachers',
    icon: UserCheck,
    section: 'Directory',
    isPrimary: true,
    isActive: (p) => p.startsWith('/admin/teachers'),
  },
  {
    id: 'classes',
    label: 'Classes',
    to: '/admin/classes',
    icon: Building,
    section: 'Academics',
    isPrimary: true,
    isActive: (p) => p.startsWith('/admin/classes'),
  },
  {
    id: 'enrollments',
    label: 'Class Enrollments',
    to: '/admin/enrollments',
    icon: UserPlus,
    section: 'Directory',
    isPrimary: false,
    isActive: (p) => p.startsWith('/admin/enrollments'),
  },
  {
    id: 'assignments',
    label: 'Subject Assignments',
    to: '/admin/assignments',
    icon: ClipboardCheck,
    section: 'Directory',
    isPrimary: false,
    isActive: (p) => p.startsWith('/admin/assignments'),
  },
  {
    id: 'subjects',
    label: 'Subjects',
    to: '/admin/subjects',
    icon: BookOpen,
    section: 'Academics',
    isPrimary: false,
    isActive: (p) => p.startsWith('/admin/subjects'),
  },
  {
    id: 'academic-years',
    label: 'Academic Years',
    to: '/admin/academic-years',
    icon: Calendar,
    section: 'Academics',
    isPrimary: false,
    isActive: (p) => p.startsWith('/admin/academic-years'),
  },
  {
    id: 'terms',
    label: 'Terms',
    to: '/admin/terms',
    icon: CalendarRange,
    section: 'Academics',
    isPrimary: false,
    isActive: (p) => p.startsWith('/admin/terms'),
  },
  {
    id: 'forms',
    label: 'School Structure',
    to: '/admin/forms',
    icon: Layers,
    section: 'Academics',
    isPrimary: false,
    isActive: (p) =>
      p.startsWith('/admin/forms') ||
      p.startsWith('/admin/learning-areas') ||
      p.startsWith('/admin/departments'),
  },
  {
    id: 'users',
    label: 'Users & Passwords',
    to: '/admin/users',
    icon: ShieldCheck,
    section: 'Settings',
    isPrimary: false,
    isActive: (p) => p.startsWith('/admin/users'),
  },
  {
    id: 'school',
    label: 'School Settings',
    to: '/admin/school',
    icon: Settings,
    section: 'Settings',
    isPrimary: false,
    isActive: (p) => p.startsWith('/admin/school'),
  },
];

export const SUPERADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    id: 'overview',
    label: 'System Overview',
    to: '/superadmin/dashboard',
    icon: LayoutDashboard,
    section: 'Console',
    isPrimary: true,
    isActive: (p) => p === '/superadmin/dashboard' || p === '/superadmin' || p === '/superadmin/',
  },
  {
    id: 'schools',
    label: 'School Registry',
    to: '/superadmin/schools',
    icon: Landmark,
    section: 'Console',
    isPrimary: true,
    isActive: (p) => p.startsWith('/superadmin/schools'),
  },
  {
    id: 'admins',
    label: 'School Admins',
    to: '/superadmin/admins',
    icon: UserCheck,
    section: 'Console',
    isPrimary: true,
    isActive: (p) => p.startsWith('/superadmin/admins'),
  },
  {
    id: 'users',
    label: 'User Accounts',
    to: '/superadmin/users',
    icon: ShieldCheck,
    section: 'Console',
    isPrimary: true,
    isActive: (p) => p.startsWith('/superadmin/users'),
  },
  {
    id: 'forms',
    label: 'Forms & Grades',
    to: '/admin/forms',
    icon: Layers,
    section: 'Structure',
    isPrimary: false,
    isActive: (p) => p.startsWith('/admin/forms'),
  },
  {
    id: 'learning-areas',
    label: 'Learning Areas',
    to: '/admin/learning-areas',
    icon: BookOpen,
    section: 'Structure',
    isPrimary: false,
    isActive: (p) => p.startsWith('/admin/learning-areas'),
  },
  {
    id: 'departments',
    label: 'Departments',
    to: '/admin/departments',
    icon: Building,
    section: 'Structure',
    isPrimary: false,
    isActive: (p) => p.startsWith('/admin/departments'),
  },
];

export interface AdminAppLayoutProps {
  children?: ReactNode;
}

export const AdminAppLayout: FC<AdminAppLayoutProps> = ({ children }) => {
  const { data } = useAuth();
  const location = useLocation();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  // Desktop sidebar collapse state
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('admin_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('admin_sidebar_collapsed', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const user = data?.user;
  const school = data?.school;
  const isSuperadmin = user?.role === 'superadmin' || user?.is_superadmin;
  const navItems = isSuperadmin ? SUPERADMIN_NAV_ITEMS : ADMIN_NAV_ITEMS;

  const initial =
    user?.full_name?.charAt(0) ||
    user?.first_name?.charAt(0) ||
    user?.username?.charAt(0) ||
    (isSuperadmin ? 'S' : 'A');

  // Preserve 'School Management' label for Admin role as tested in App.test.tsx
  const roleDisplay = isSuperadmin ? 'Superadmin Console' : 'School Management';

  const pathname = location.pathname;
  const primaryItems = navItems.filter((item) => item.isPrimary);
  const secondaryItems = navItems.filter((item) => !item.isPrimary);
  const isMoreActive = secondaryItems.some((item) => item.isActive(pathname));

  // Groups for Desktop Sidebar (2-3 labeled groups)
  const sections = isSuperadmin
    ? [
        { name: 'SUPERADMIN CONSOLE', items: navItems.filter((i) => i.section === 'Console') },
        { name: 'SCHOOL STRUCTURE', items: navItems.filter((i) => i.section === 'Structure') },
      ]
    : [
        { name: 'PEOPLE & DIRECTORY', items: navItems.filter((i) => i.section === 'Directory') },
        { name: 'ACADEMIC STRUCTURE', items: navItems.filter((i) => i.section === 'Academics') },
        { name: 'SETTINGS & ACCESS', items: navItems.filter((i) => i.section === 'Settings') },
      ];

  return (
    <div
      className={`portal-shell ${isCollapsed ? 'portal-shell--collapsed' : 'portal-shell--expanded'}`}
      data-testid="admin-app-layout"
    >
      {/* Desktop Collapsible Left Sidebar (>= 1024px) */}
      <aside
        className={`portal-sidebar ${isCollapsed ? 'portal-sidebar--collapsed' : 'portal-sidebar--expanded'}`}
        data-testid="admin-desktop-sidebar"
        aria-label="Sidebar navigation"
      >
        <div className="portal-sidebar__head">
          {!isCollapsed && (
            <Link
              to={isSuperadmin ? '/superadmin/dashboard' : '/admin/dashboard'}
              className="portal-sidebar__brand"
            >
              <div className="portal-sidebar__brand-icon">
                <GraduationCap size={18} />
              </div>
              <span>{isSuperadmin ? 'Superadmin' : school?.name || 'QuizApp Admin'}</span>
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
          {sections.map((group) => (
            <div key={group.name} className="portal-sidebar__nav-group">
              <p className="portal-sidebar__nav-label">{group.name}</p>
              {group.items.map((item) => {
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
          ))}
        </nav>

        <div className="portal-sidebar__footer">
          <a
            href="/logout/"
            className="portal-sidebar__link"
            title="Sign Out"
            aria-label="Sign Out"
          >
            <span className="portal-sidebar__link-icon" aria-hidden="true">
              <LogOut size={18} />
            </span>
            <span className="portal-sidebar__link-text">Sign Out</span>
          </a>
        </div>
      </aside>

      {/* Top Header */}
      <header className="portal-header" role="banner">
        <div className="portal-header__inner">
          <div className="portal-header__left">
            <Link
              to={isSuperadmin ? '/superadmin/dashboard' : '/admin/dashboard'}
              className="portal-header__brand-mobile"
            >
              <GraduationCap size={20} className="text-primary" />
              <span>QuizApp</span>
            </Link>
            <span className="portal-role-badge">
              <span className="portal-role-badge__dot" aria-hidden="true" />
              <span>{roleDisplay}</span>
            </span>
          </div>

          <div className="portal-header__right">
            <div className="portal-header__user">
              <div className="portal-avatar-pill" title={user?.full_name || user?.username || 'User'}>
                {initial}
              </div>
              <div className="portal-user-meta">
                <span className="portal-user-meta__name">
                  {user?.full_name || user?.username || 'User'}
                </span>
                <span className="portal-user-meta__role">
                  {isSuperadmin ? 'Superadmin' : 'Administrator'}
                </span>
              </div>
            </div>

            <a
              href="/logout/"
              className="portal-header__btn"
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut size={16} />
            </a>
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
        data-testid="admin-mobile-bottom-nav"
        aria-label="Admin Mobile Navigation"
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
              <span>{item.label.replace('All ', '').replace('System ', '')}</span>
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
              <h3 className="portal-more-sheet__title">More Management Options</h3>
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
              <p className="portal-more-sheet__group-label">Features & Management</p>
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
              <a
                href="/logout/"
                className="portal-more-sheet__item text-danger"
                onClick={() => setIsMoreOpen(false)}
              >
                <LogOut size={18} />
                <span>Sign Out</span>
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
