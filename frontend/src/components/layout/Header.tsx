import { useState, useRef, useEffect, type FC } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { ThemeSelector } from './ThemeSelector';
import { SessionTimer } from './SessionTimer';

interface HeaderProps {
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
}

export const Header: FC<HeaderProps> = ({ onToggleSidebar, isSidebarOpen }) => {
  const { data } = useAuth();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const user = data?.user;
  const role = user?.role;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const getRoleDisplayName = (r?: string) => {
    switch (r) {
      case 'admin':
        return 'School Management';
      case 'teacher':
        return 'Teaching Workspace';
      case 'student':
        return 'Learning Portal';
      case 'superadmin':
        return 'Superadmin Console';
      default:
        return 'School System';
    }
  };

  return (
    <header className="core-header" aria-label="Main navigation">
      <div className="core-header__start">
          <button
            className="core-header__menu-button core-header__action"
            type="button"
            aria-label="Toggle sidebar"
            aria-expanded={isSidebarOpen}
            onClick={onToggleSidebar}
          >
            <i className="bi bi-list" aria-hidden="true" />
          </button>

          <a href="/app/" className="core-header__link">
            <i className="bi bi-house-door" aria-hidden="true" />
            <span>Home</span>
          </a>

          <span className="core-header__role">
            {getRoleDisplayName(role)}
          </span>

      </div>
      <div className="core-header__actions">
          <ThemeSelector />

          <button
            className="core-header__action"
            type="button"
            aria-label="Toggle fullscreen"
            title="Toggle fullscreen"
            onClick={toggleFullscreen}
          >
            <i className="bi bi-arrows-fullscreen" aria-hidden="true" />
          </button>

          <SessionTimer />

          <div className="core-header__user" ref={userMenuRef}>
            <button
              className="core-header__user-button"
              type="button"
              aria-expanded={isUserMenuOpen}
              aria-label="User menu"
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            >
              <span className="core-header__avatar">
                {user?.first_name ? user.first_name[0].toUpperCase() : 'U'}
              </span>
              <span className="core-header__user-name">
                {user?.full_name || user?.username}
              </span>
            </button>

            {isUserMenuOpen && (
              <div className="core-user-menu">
                <div className="core-user-menu__identity">
                  <span className="core-header__avatar">
                    {user?.first_name ? user.first_name[0].toUpperCase() : 'U'}
                  </span>
                  <strong>{user?.full_name || user?.username}</strong>
                  <span>{user?.role}</span>
                </div>
                {role === 'student' && (
                  <>
                      <a href="/app/student/profile">
                        <i className="bi bi-person-badge" aria-hidden="true" />{' '}
                        My Profile
                      </a>
                  </>
                )}
                <a
                    href={role === 'superadmin' ? '/superadmin/logout/' : '/logout/'}
                  >
                    <i className="bi bi-box-arrow-right" aria-hidden="true" />{' '}
                    Sign out
                </a>
              </div>
            )}
          </div>
      </div>
    </header>
  );
};
