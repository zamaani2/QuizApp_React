import { useState, type FC } from 'react';
import { useAuth } from '../../auth/AuthContext';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activePath?: string;
}

interface NavItem {
  title: string;
  icon: string;
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
                    <i className={`bi ${item.icon}`} />
                  </span>
                  <span className="core-nav-toggle__text">{item.title}</span>
                  <i className="bi bi-chevron-right core-nav-toggle__indicator" aria-hidden="true" />
                </button>
                {isGroupOpen && (
                  <ul className="core-nav-sublist">
                    {item.subItems.map((sub) => (
                      <li key={`${sub.href}-${sub.title}`} className="core-nav-item">
                        <a
                          href={sub.href}
                          className={`core-nav-link ${
                            isLinkActive(sub.href) ? 'is-active' : ''
                          }`}
                        >
                          <i className="bi bi-circle" aria-hidden="true" />
                          {sub.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          }

          return (
            <li key={`${item.href || ''}-${item.title}`} className="core-nav-item">
              <a
                href={item.href || '#'}
                className={`core-nav-link ${isLinkActive(item.href || '') ? 'is-active' : ''}`}
              >
                <span className="core-nav__mark" aria-hidden="true">
                  <i className={`bi ${item.icon}`} />
                </span>
                <span>{item.title}</span>
                {item.badge && (
                  <span className="core-nav__badge">
                    {item.badge}
                  </span>
                )}
              </a>
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
          <a
            href="/app/"
          >
            <i className="bi bi-mortarboard-fill" aria-hidden="true" />{' '}
            <span>
              {role === 'superadmin' ? 'Superadmin Portal' : school?.name || 'School System'}
            </span>
          </a>
          <button
            type="button"
            className="core-sidebar__close"
            aria-label="Close sidebar"
            onClick={onClose}
          >
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <div className="core-sidebar__scroll">
          <nav aria-label="Sidebar navigation">
            <ul className="core-sidebar__menu">
              {/* Dashboard */}
              <li className="core-nav-item">
                <a
                  href="/app/"
                  className={`core-nav-link ${activePath === '/app/' ? 'is-active' : ''}`}
                >
                  <span className="core-nav__mark" aria-hidden="true">
                    <i className="bi bi-speedometer2" />
                  </span>
                  <span>React Workspace</span>
                </a>
              </li>

              {/* Role-Specific Navigation Sections */}
              {role === 'admin' && (
                <>
                  {renderNavGroup('ASSESSMENT', [
                    {
                      title: 'Quizzes',
                      icon: 'bi-patch-question',
                      subItems: [
                        { title: 'All Quizzes', href: '/app/teacher/quizzes' },
                        { title: 'Class Assignments', href: '/app/teacher/quizzes' },
                        { title: 'Grading', href: '/app/teacher/grading' },
                        { title: 'Results & Reports', href: '/app/teacher/results' },
                      ],
                    },
                  ])}
                  {renderNavGroup('PEOPLE', [
                    {
                      title: 'Students',
                      icon: 'bi-people',
                      subItems: [
                        { title: 'All Students', href: '/app/admin/students' },
                        { title: 'Class Enrollments', href: '/app/admin/enrollments' },
                      ],
                    },
                    {
                      title: 'Teachers',
                      icon: 'bi-person-badge',
                      subItems: [
                        { title: 'All Teachers', href: '/app/admin/teachers' },
                        { title: 'Subject Assignments', href: '/app/admin/assignments' },
                      ],
                    },
                  ])}
                  {renderNavGroup('ACADEMIC', [
                    {
                      title: 'Academic Years',
                      icon: 'bi-calendar3',
                      subItems: [
                        { title: 'Academic Years', href: '/app/admin/academic-years' },
                      ],
                    },
                    {
                      title: 'Terms',
                      icon: 'bi-calendar-range',
                      subItems: [
                        { title: 'Terms', href: '/app/admin/terms' },
                      ],
                    },
                    {
                      title: 'Classes',
                      icon: 'bi-building',
                      subItems: [
                        { title: 'Classes', href: '/app/admin/classes' },
                      ],
                    },
                    {
                      title: 'Subjects',
                      icon: 'bi-journal-bookmark',
                      subItems: [
                        { title: 'Subjects', href: '/app/admin/subjects' },
                      ],
                    },
                    {
                      title: 'School Structure',
                      icon: 'bi-diagram-3',
                      subItems: [
                        { title: 'Forms & Grade Levels', href: '/app/admin/forms' },
                        { title: 'Learning Areas', href: '/app/admin/learning-areas' },
                        { title: 'Departments', href: '/app/admin/departments' },
                      ],
                    },
                  ])}
                  {renderNavGroup('SETTINGS', [
                    { title: 'Users & Passwords', icon: 'bi-shield-lock', href: '/app/admin/users' },
                    {
                      title: 'School Settings',
                      icon: 'bi-gear',
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
                    { title: 'My Quizzes', icon: 'bi-patch-question', href: '/app/teacher/quizzes' },
                    { title: 'Grading Queue', icon: 'bi-pencil-square', href: '/app/teacher/grading' },
                    { title: 'Results & Analytics', icon: 'bi-bar-chart', href: '/app/teacher/results' },
                    { title: 'Create Quiz', icon: 'bi-plus-circle', href: '/app/teacher/quizzes/new' },
                    { title: 'Quiz Catalog & Class Assignments', icon: 'bi-journal-check', href: '/app/teacher/quizzes' },
                  ])}
                </>
              )}

              {role === 'student' && (
                <>
                  {renderNavGroup('QUIZZES', [
                    { title: 'Student Portal', icon: 'bi-speedometer2', href: '/app/student/dashboard' },
                    { title: 'Available Quizzes', icon: 'bi-patch-question', href: '/app/student/quizzes' },
                    { title: 'My Attempts', icon: 'bi-clock-history', href: '/app/student/attempts' },
                  ])}
                  {renderNavGroup('ACCOUNT', [
                    { title: 'My Profile', icon: 'bi-person-badge', href: '/app/student/profile' },
                  ])}
                </>
              )}

              {role === 'superadmin' && (
                <>
                  {renderNavGroup('SUPERADMIN CONSOLE', [
                    { title: 'System Overview', icon: 'bi-speedometer2', href: '/app/superadmin/dashboard' },
                    { title: 'School Registry', icon: 'bi-bank', href: '/app/superadmin/schools' },
                    { title: 'School Admins', icon: 'bi-people', href: '/app/superadmin/admins' },
                    { title: 'Users & Passwords', icon: 'bi-shield-lock', href: '/app/superadmin/users' },
                  ])}
                  {renderNavGroup('SCHOOL STRUCTURE', [
                    { title: 'Forms & Grade Levels', icon: 'bi-list-ol', href: '/app/admin/forms' },
                    { title: 'Learning Areas', icon: 'bi-journal-text', href: '/app/admin/learning-areas' },
                    { title: 'Departments', icon: 'bi-diagram-3', href: '/app/admin/departments' },
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
