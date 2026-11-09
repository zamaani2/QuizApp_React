import { AppIcon } from '../components/common/AppIcon';
import type { FC, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './AuthContext';

interface RoleGuardProps {
  allowedRoles: string[];
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
}

export const RoleGuard: FC<RoleGuardProps> = ({
  allowedRoles,
  children,
  fallbackTitle = 'Access Restricted',
  fallbackMessage,
}) => {
  const { data, loading } = useAuth();

  if (loading) {
    return null;
  }

  const userRole = data?.user?.role || '';
  const isAuthorized = allowedRoles.includes(userRole);

  if (!isAuthorized) {
    const getHomePath = () => {
      switch (userRole) {
        case 'superadmin':
          return '/superadmin/dashboard';
        case 'teacher':
          return '/teacher/dashboard';
        case 'student':
          return '/student/dashboard';
        case 'admin':
        default:
          return '/admin/dashboard';
      }
    };

    return (
      <div className="core-container core-space--padding-y-5 core-text--center" role="alert" aria-live="assertive">
        <div className="core-card core-shadow--sm core-border--none core-space--margin-x-auto" style={{ maxWidth: '520px' }}>
          <div className="core-card__body core-space--padding-4 core-space--padding-md-5">
            <div className="core-space--margin-bottom-3">
              <AppIcon name="shieldCheck" className="core-text--warning" style={{ fontSize: '3rem' }} />
            </div>
            <h3 className="core-type--heading-4 core-type--weight-bold core-text--dark core-space--margin-bottom-2">{fallbackTitle}</h3>
            <p className="core-text--muted core-space--margin-bottom-4">
              {fallbackMessage ||
                `Your current role (${userRole || 'anonymous'}) does not have permission to view this section.`}
            </p>
            <div className="core-display-flex core-layout--wrap core-layout--justify-center core-layout--gap-2">
              <Link to={getHomePath()} className="core-button core-button--primary core-button--sm core-space--padding-x-3">
                <AppIcon name="house" className="core-space--margin-end-1" />
                Go to My Portal
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
