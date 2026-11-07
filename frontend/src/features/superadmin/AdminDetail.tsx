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
    return <div className="container-fluid py-5 text-center" role="status">Loading administrator details...</div>;
  }

  return (
    <div className="container-fluid py-4" data-testid="superadmin-admin-detail">
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
        <div>
          <h2 className="h3 fw-bold text-dark mb-1">Administrator Details</h2>
          <p className="text-muted mb-0">Account profile and assigned school information</p>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <Link to="/superadmin/admins" className="btn btn-outline-secondary">Back to Administrators</Link>
          {admin && (
            <Link to={`/superadmin/admins/${admin.id}/edit`} className="btn btn-primary">
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
        <div className="row g-4">
          <div className="col-12 col-lg-8">
            <section className="card shadow-sm border-0 h-100">
              <div className="card-header bg-white d-flex justify-content-between align-items-center py-3">
                <h3 className="h5 mb-0">{admin.full_name}</h3>
                <span className={`badge ${admin.is_active ? 'bg-success' : 'bg-secondary'}`}>
                  {admin.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="card-body">
                <dl className="row mb-0">
                  <dt className="col-sm-4 text-muted">Username</dt>
                  <dd className="col-sm-8">{admin.username}</dd>
                  <dt className="col-sm-4 text-muted">Email</dt>
                  <dd className="col-sm-8">{admin.email || '—'}</dd>
                  <dt className="col-sm-4 text-muted">Date Joined</dt>
                  <dd className="col-sm-8">{admin.date_joined ? new Date(admin.date_joined).toLocaleString() : '—'}</dd>
                  <dt className="col-sm-4 text-muted">Last Login</dt>
                  <dd className="col-sm-8">{admin.last_login ? new Date(admin.last_login).toLocaleString() : 'Never'}</dd>
                  <dt className="col-sm-4 text-muted">Last Login IP</dt>
                  <dd className="col-sm-8">{admin.last_login_ip || '—'}</dd>
                </dl>
              </div>
            </section>
          </div>
          <div className="col-12 col-lg-4">
            <section className="card shadow-sm border-0 h-100">
              <div className="card-header bg-white py-3">
                <h3 className="h5 mb-0">Assigned School</h3>
              </div>
              <div className="card-body">
                {admin.school ? (
                  <>
                    <div className="fw-bold fs-5">{admin.school.name}</div>
                    <div className="text-muted small mb-3">{admin.school.school_code || 'No school code'}</div>
                    {!admin.school.is_active && (
                      <div className="alert alert-warning py-2">This school is inactive.</div>
                    )}
                    <dl className="row mb-0">
                      <dt className="col-sm-5 text-muted">Address</dt>
                      <dd className="col-sm-7">{admin.school.address || '—'}</dd>
                      <dt className="col-sm-5 text-muted">Phone</dt>
                      <dd className="col-sm-7">{admin.school.phone_number || '—'}</dd>
                    </dl>
                  </>
                ) : (
                  <p className="text-muted mb-0">No school is currently assigned.</p>
                )}
              </div>
            </section>
          </div>
          <div className="col-12">
            <div className="card border-danger-subtle shadow-sm">
              <div className="card-body d-flex flex-wrap justify-content-between align-items-center gap-3">
                <div>
                  <h3 className="h6 text-danger mb-1">Delete administrator</h3>
                  <p className="small text-muted mb-0">This permanently removes the account.</p>
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
