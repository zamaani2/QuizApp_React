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
      <div className="container py-5 text-center" role="alert" aria-live="assertive">
        <div className="card shadow-sm border-0 mx-auto" style={{ maxWidth: '520px' }}>
          <div className="card-body p-4 p-md-5">
            <div className="mb-3">
              <i className="bi bi-shield-lock-fill text-warning" style={{ fontSize: '3rem' }} />
            </div>
            <h3 className="h4 fw-bold text-dark mb-2">{fallbackTitle}</h3>
            <p className="text-muted mb-4">
              {fallbackMessage ||
                `Your current role (${userRole || 'anonymous'}) does not have permission to view this section.`}
            </p>
            <div className="d-flex flex-wrap justify-content-center gap-2">
              <Link to={getHomePath()} className="btn btn-primary btn-sm px-3">
                <i className="bi bi-house-door me-1" />
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
