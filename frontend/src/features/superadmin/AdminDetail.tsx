import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { deleteSuperadminAdmin, fetchSuperadminAdmin } from '../../api/admin';
import type { SuperadminAdmin } from '../../types';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';

export const AdminDetail: React.FC = () => {
  const { adminId: adminIdParam } = useParams<{ adminId: string }>();
  const adminId = Number(adminIdParam);
  const navigate = useNavigate();
  const [admin, setAdmin] = useState<SuperadminAdmin | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    const loadAdmin = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetchSuperadminAdmin(adminId);
        if (active) setAdmin(response.admin);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load administrator details.');
      } finally {
        if (active) setLoading(false);
      }
    };
    if (Number.isInteger(adminId) && adminId > 0) void loadAdmin();
    else {
      setError('Invalid administrator ID.');
      setLoading(false);
    }
    return () => {
      active = false;
    };
  }, [adminId]);

  const handleDelete = async () => {
    if (!admin || !window.confirm(`Delete administrator "${admin.full_name}"? This cannot be undone.`)) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await deleteSuperadminAdmin(admin.id);
      navigate('/superadmin/admins');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete administrator.');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="core-container core-space--padding-y-5 core-text--center" role="status">Loading administrator details...</div>;
  }

  return (
    <div className="core-container core-space--padding-y-4" data-testid="superadmin-admin-detail">
      <div className="core-display-flex core-layout--wrap core-layout--justify-between core-layout--align-start core-layout--gap-3 core-space--margin-bottom-4">
        <div>
          <h2 className="core-type--heading-3 core-type--weight-bold core-text--dark core-space--margin-bottom-1">Administrator Details</h2>
          <p className="core-text--muted core-space--margin-bottom-0">Account profile and assigned school information</p>
        </div>
        <div className="core-display-flex core-layout--wrap core-layout--gap-2">
          <Link to="/superadmin/admins" className="core-button core-button--outline-secondary">Back to Administrators</Link>
          {admin && (
            <Link to={`/superadmin/admins/${admin.id}/edit`} className="core-button core-button--primary">
              Edit Administrator
            </Link>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="danger" dismissible onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {admin && (
        <div className="core-grid core-grid--gap-4">
          <div className="core-grid__span-12 core-grid__span-lg-8">
            <section className="core-card core-shadow--sm core-border--none core-size--height-full">
              <div className="core-card__header core-surface--white core-display-flex core-layout--justify-between core-layout--align-center core-space--padding-y-3">
                <h3 className="core-type--heading-5 core-space--margin-bottom-0">{admin.full_name}</h3>
                <span className={`core-badge ${admin.is_active ? 'core-surface--success' : 'core-surface--secondary'}`}>
                  {admin.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="core-card__body">
                <dl className="core-grid core-space--margin-bottom-0">
                  <dt className="core-grid__span-sm-4 core-text--muted">Username</dt>
                  <dd className="core-grid__span-sm-8">{admin.username}</dd>
                  <dt className="core-grid__span-sm-4 core-text--muted">Email</dt>
                  <dd className="core-grid__span-sm-8">{admin.email || '—'}</dd>
                  <dt className="core-grid__span-sm-4 core-text--muted">Date Joined</dt>
                  <dd className="core-grid__span-sm-8">{admin.date_joined ? new Date(admin.date_joined).toLocaleString() : '—'}</dd>
                  <dt className="core-grid__span-sm-4 core-text--muted">Last Login</dt>
                  <dd className="core-grid__span-sm-8">{admin.last_login ? new Date(admin.last_login).toLocaleString() : 'Never'}</dd>
                  <dt className="core-grid__span-sm-4 core-text--muted">Last Login IP</dt>
                  <dd className="core-grid__span-sm-8">{admin.last_login_ip || '—'}</dd>
                </dl>
              </div>
            </section>
          </div>
          <div className="core-grid__span-12 core-grid__span-lg-4">
            <section className="core-card core-shadow--sm core-border--none core-size--height-full">
              <div className="core-card__header core-surface--white core-space--padding-y-3">
                <h3 className="core-type--heading-5 core-space--margin-bottom-0">Assigned School</h3>
              </div>
              <div className="core-card__body">
                {admin.school ? (
                  <>
                    <div className="core-type--weight-bold core-type--size-5">{admin.school.name}</div>
                    <div className="core-text--muted core-type--small core-space--margin-bottom-3">{admin.school.school_code || 'No school code'}</div>
                    {!admin.school.is_active && (
                      <div className="core-alert core-alert--warning core-space--padding-y-2">This school is inactive.</div>
                    )}
                    <dl className="core-grid core-space--margin-bottom-0">
                      <dt className="core-grid__span-sm-5 core-text--muted">Address</dt>
                      <dd className="core-grid__span-sm-7">{admin.school.address || '—'}</dd>
                      <dt className="core-grid__span-sm-5 core-text--muted">Phone</dt>
                      <dd className="core-grid__span-sm-7">{admin.school.phone_number || '—'}</dd>
                    </dl>
                  </>
                ) : (
                  <p className="core-text--muted core-space--margin-bottom-0">No school is currently assigned.</p>
                )}
              </div>
            </section>
          </div>
          <div className="core-grid__span-12">
            <div className="core-card core-border--danger-subtle core-shadow--sm">
              <div className="core-card__body core-display-flex core-layout--wrap core-layout--justify-between core-layout--align-center core-layout--gap-3">
                <div>
                  <h3 className="core-type--heading-6 core-text--danger core-space--margin-bottom-1">Delete administrator</h3>
                  <p className="core-type--small core-text--muted core-space--margin-bottom-0">This permanently removes the account.</p>
                </div>
                <Button type="button" variant="danger" disabled={deleting} onClick={() => void handleDelete()}>
                  {deleting ? 'Deleting...' : 'Delete Administrator'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
