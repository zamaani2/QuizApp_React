import { AppIcon } from '../common/AppIcon';
import { useState, type FC } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import type { AppIconName } from '../common/AppIcon';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activePath?: string;
}

interface NavItem {
  title: string;
  icon: AppIconName;
  href?: string;
  badge?: string;
  subItems?: { title: string; href: string }[];
}

export const Sidebar: FC<SidebarProps> = ({ isOpen, onClose, activePath = '/app/' }) => {
  const { data } = useAuth();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    Assessment: true,
    People: true,
    Quizzes: true,
    Students: true,
    Teachers: true,
  });

  const user = data?.user;
  const school = data?.school;
  const role = user?.role || 'admin';

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const isLinkActive = (href: string) => {
    return activePath === href || (href !== '/app/' && activePath.startsWith(href));
  };

  const routeForLink = (href: string) => href.startsWith('/app/') ? href.slice('/app'.length) || '/' : href;

  const renderNavGroup = (header: string, items: NavItem[]) => (
    <div key={header} className="core-nav-group">
      <p className="core-nav-label">
        {header}
      </p>
      <ul className="core-nav-list">
        {items.map((item) => {
          if (item.subItems) {
            const isActiveGroup = item.subItems.some((sub) => isLinkActive(sub.href));
            const isGroupOpen = openSections[item.title] ?? isActiveGroup;
            return (
              <li key={item.title} className="core-nav-item">
                <button
                  type="button"
                  className="core-nav-toggle"
                  aria-expanded={isGroupOpen}
                  data-active={isActiveGroup || undefined}
                  onClick={() => toggleSection(item.title)}
                >
                  <span className="core-nav__mark" aria-hidden="true">
                    <AppIcon name={item.icon} />
                  </span>
                  <span className="core-nav-toggle__text">{item.title}</span>
                  <AppIcon name="chevronRight" className="core-nav-toggle__indicator" aria-hidden="true" />
                </button>
                {isGroupOpen && (
                  <ul className="core-nav-sublist">
                    {item.subItems.map((sub) => (
                      <li key={`${sub.href}-${sub.title}`} className="core-nav-item">
                        <Link
                          to={routeForLink(sub.href)}
                          className={`core-nav-link ${
                            isLinkActive(sub.href) ? 'is-active' : ''
                          }`}
                        >
                          <AppIcon name="circle" aria-hidden="true" />
                          {sub.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          }

          return (
            <li key={`${item.href || ''}-${item.title}`} className="core-nav-item">
              <Link
                to={routeForLink(item.href || '/')}
                className={`core-nav-link ${isLinkActive(item.href || '') ? 'is-active' : ''}`}
              >
                <span className="core-nav__mark" aria-hidden="true">
                  <AppIcon name={item.icon} />
                </span>
                <span>{item.title}</span>
                {item.badge && (
                  <span className="core-nav__badge">
                    {item.badge}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <>
      <aside
        id="app-sidebar"
        className={`core-sidebar ${isOpen ? 'is-open' : ''}`}
        aria-label="Main sidebar"
      >
        <div className="core-sidebar__brand">
          <Link to="/">
            <AppIcon name="graduationCap" aria-hidden="true" />{' '}
            <span>
              {role === 'superadmin' ? 'Superadmin Portal' : school?.name || 'School System'}
            </span>
          </Link>
          <button
            type="button"
            className="core-sidebar__close"
            aria-label="Close sidebar"
            onClick={onClose}
          >
            <AppIcon name="x" />
          </button>
        </div>

        <div className="core-sidebar__scroll">
          <nav aria-label="Sidebar navigation">
            <ul className="core-sidebar__menu">
              {/* Dashboard */}
              <li className="core-nav-item">
                <Link
                  to="/"
                  className={`core-nav-link ${activePath === '/app/' ? 'is-active' : ''}`}
                >
                  <span className="core-nav__mark" aria-hidden="true">
                    <AppIcon name="gauge" />
                  </span>
                  <span>Dashboard</span>
                </Link>
              </li>

              {/* Role-Specific Navigation Sections */}
              {role === 'admin' && (
                <>
                  {renderNavGroup('ASSESSMENT', [
                    {
                      title: 'Quizzes',
                      icon: 'badgeHelp',
                      subItems: [
                        { title: 'All Quizzes', href: '/app/teacher/quizzes' },
                        { title: 'Class Assignments', href: '/app/teacher/assignments' },
                        { title: 'Grading', href: '/app/teacher/grading' },
                        { title: 'Results & Reports', href: '/app/teacher/results' },
                      ],
                    },
                  ])}
                  {renderNavGroup('PEOPLE', [
                    {
                      title: 'Students',
                      icon: 'users',
                      subItems: [
                        { title: 'All Students', href: '/app/admin/students' },
                        { title: 'Class Enrollments', href: '/app/admin/enrollments' },
                      ],
                    },
                    {
                      title: 'Teachers',
                      icon: 'contact',
                      subItems: [
                        { title: 'All Teachers', href: '/app/admin/teachers' },
                        { title: 'Subject Assignments', href: '/app/admin/assignments' },
                      ],
                    },
                  ])}
                  {renderNavGroup('ACADEMIC', [
                    {
                      title: 'Academic Years',
                      icon: 'calendarDays',
                      subItems: [
                        { title: 'Academic Years', href: '/app/admin/academic-years' },
                      ],
                    },
                    {
                      title: 'Terms',
                      icon: 'calendarDays',
                      subItems: [
                        { title: 'Terms', href: '/app/admin/terms' },
                      ],
                    },
                    {
                      title: 'Classes',
                      icon: 'building',
                      subItems: [
                        { title: 'Classes', href: '/app/admin/classes' },
                      ],
                    },
                    {
                      title: 'Subjects',
                      icon: 'bookMarked',
                      subItems: [
                        { title: 'Subjects', href: '/app/admin/subjects' },
                      ],
                    },
                    {
                      title: 'School Structure',
                      icon: 'network',
                      subItems: [
                        { title: 'Forms & Grade Levels', href: '/app/admin/forms' },
                        { title: 'Learning Areas', href: '/app/admin/learning-areas' },
                        { title: 'Departments', href: '/app/admin/departments' },
                      ],
                    },
                  ])}
                  {renderNavGroup('SETTINGS', [
                    { title: 'Users & Passwords', icon: 'shield', href: '/app/admin/users' },
                    {
                      title: 'School Settings',
                      icon: 'settings',
                      subItems: [
                        { title: 'School Settings', href: '/app/admin/school' },
                      ],
                    },
                  ])}
                </>
              )}

              {role === 'teacher' && (
                <>
                  {renderNavGroup('ASSESSMENT', [
                    { title: 'My Quizzes', icon: 'badgeHelp', href: '/app/teacher/quizzes' },
                    { title: 'Grading Queue', icon: 'squarePen', href: '/app/teacher/grading' },
                    { title: 'Results & Analytics', icon: 'chartColumn', href: '/app/teacher/results' },
                    { title: 'Create Quiz', icon: 'circlePlus', href: '/app/teacher/quizzes/new' },
                    { title: 'Assignments', icon: 'clipboardCheck', href: '/app/teacher/assignments' },
                  ])}
                </>
              )}

              {role === 'student' && (
                <>
                  {renderNavGroup('QUIZZES', [
                    { title: 'Student Portal', icon: 'gauge', href: '/app/student/dashboard' },
                    { title: 'Available Quizzes', icon: 'badgeHelp', href: '/app/student/quizzes' },
                    { title: 'My Attempts', icon: 'history', href: '/app/student/attempts' },
                    { title: 'Student Progress', icon: 'chartUp', href: '/app/student/progress' },
                  ])}
                  {renderNavGroup('ACCOUNT', [
                    { title: 'My Profile', icon: 'contact', href: '/app/student/profile' },
                  ])}
                </>
              )}

              {role === 'superadmin' && (
                <>
                  {renderNavGroup('SUPERADMIN CONSOLE', [
                    { title: 'System Overview', icon: 'gauge', href: '/app/superadmin/dashboard' },
                    { title: 'School Registry', icon: 'landmark', href: '/app/superadmin/schools' },
                    { title: 'School Admins', icon: 'users', href: '/app/superadmin/admins' },
                    { title: 'Users & Passwords', icon: 'shield', href: '/app/superadmin/users' },
                  ])}
                  {renderNavGroup('SCHOOL STRUCTURE', [
                    { title: 'Forms & Grade Levels', icon: 'listOrdered', href: '/app/admin/forms' },
                    { title: 'Learning Areas', icon: 'bookText', href: '/app/admin/learning-areas' },
                    { title: 'Departments', icon: 'network', href: '/app/admin/departments' },
                  ])}
                </>
              )}
            </ul>
          </nav>
        </div>
      </aside>

      {/* Backdrop for mobile */}
      {isOpen && (
        <div
          className="core-sidebar__backdrop"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
    </>
  );
};
