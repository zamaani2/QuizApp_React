import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  createSuperadminAdmin,
  fetchSuperadminAdmin,
  fetchSuperadminSchools,
  updateSuperadminAdmin,
} from '../../api/admin';
import type { SuperadminAdmin, SuperadminSchool } from '../../types';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';

interface AdminFormValues {
  username: string;
  email: string;
  fullName: string;
  schoolId: string;
  isActive: boolean;
  password: string;
}

const emptyValues: AdminFormValues = {
  username: '',
  email: '',
  fullName: '',
  schoolId: '',
  isActive: true,
  password: '',
};

function toFormValues(admin: SuperadminAdmin): AdminFormValues {
  return {
    username: admin.username,
    email: admin.email,
    fullName: admin.full_name,
    schoolId: admin.school ? String(admin.school.id) : '',
    isActive: admin.is_active,
    password: '',
  };
}

export const AdminForm: React.FC = () => {
  const { adminId: adminIdParam } = useParams<{ adminId: string }>();
  const adminId = adminIdParam ? Number(adminIdParam) : null;
  const isEditing = adminId !== null;
  const navigate = useNavigate();
  const [values, setValues] = useState<AdminFormValues>(emptyValues);
  const [schools, setSchools] = useState<SuperadminSchool[]>([]);
  const [admin, setAdmin] = useState<SuperadminAdmin | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadForm = async () => {
      setLoading(true);
      setError(null);
      try {
        const [schoolResponse, adminResponse] = await Promise.all([
          fetchSuperadminSchools(),
          adminId === null ? Promise.resolve(null) : fetchSuperadminAdmin(adminId),
        ]);
        if (!active) return;
        const currentAdmin = adminResponse?.admin ?? null;
        setSchools(schoolResponse.results);
        setAdmin(currentAdmin);
        setValues(currentAdmin ? toFormValues(currentAdmin) : emptyValues);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load administrator details.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadForm();
    return () => {
      active = false;
    };
  }, [adminId]);

  const updateValue = <K extends keyof AdminFormValues>(key: K, value: AdminFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const body = new FormData();
    body.set('username', values.username.trim());
    body.set('email', values.email.trim());
    body.set('full_name', values.fullName.trim());
    body.set('school', values.schoolId);
    if (isEditing) {
      body.set('is_active', String(values.isActive));
      if (values.password) body.set('password', values.password);
    }

    try {
      if (adminId === null) {
        const response = await createSuperadminAdmin(body);
        navigate(`/superadmin/admins/${response.admin_id}`);
      } else {
        const response = await updateSuperadminAdmin(adminId, body);
        navigate(`/superadmin/admins/${response.admin_id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save administrator.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="container-fluid py-5 text-center" role="status">Loading administrator form...</div>;
  }

  if (isEditing && !admin && !error) {
    return <div className="container-fluid py-4"><Alert variant="danger">Administrator not found.</Alert></div>;
  }

  return (
    <div className="container-fluid py-4" data-testid="superadmin-admin-form">
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
        <div>
          <h2 className="h3 fw-bold text-dark mb-1">
            {isEditing ? 'Edit Administrator' : 'Add Administrator'}
          </h2>
          <p className="text-muted mb-0">
            {isEditing
              ? 'Update account access, contact details, and school assignment.'
              : 'Create a school administrator account and send a secure password setup link.'}
          </p>
        </div>
        <Link to={adminId ? `/superadmin/admins/${adminId}` : '/superadmin/admins'} className="btn btn-outline-secondary">
          Cancel
        </Link>
      </div>

      {error && (
        <Alert variant="danger" dismissible onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      <form className="card shadow-sm border-0" onSubmit={(event) => void handleSubmit(event)}>
        <div className="card-body p-4">
          <div className="row g-3">
            <div className="col-12 col-md-6">
              <label htmlFor="admin-username" className="form-label">Username</label>
              <input
                id="admin-username"
                className="form-control"
                value={values.username}
                onChange={(event) => updateValue('username', event.target.value)}
                required
                disabled={isEditing}
                autoComplete="username"
              />
              {isEditing && <div className="form-text">The username cannot be changed.</div>}
            </div>
            <div className="col-12 col-md-6">
              <label htmlFor="admin-full-name" className="form-label">Full name</label>
              <input
                id="admin-full-name"
                className="form-control"
                value={values.fullName}
                onChange={(event) => updateValue('fullName', event.target.value)}
                required
                autoComplete="name"
              />
            </div>
            <div className="col-12 col-md-6">
              <label htmlFor="admin-email" className="form-label">Email</label>
              <input
                id="admin-email"
                type="email"
                className="form-control"
                value={values.email}
                onChange={(event) => updateValue('email', event.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="col-12 col-md-6">
              <label htmlFor="admin-school" className="form-label">School</label>
              <select
                id="admin-school"
                className="form-select"
                value={values.schoolId}
                onChange={(event) => updateValue('schoolId', event.target.value)}
                required
              >
                <option value="">Select a school</option>
                {admin?.school && !admin.school.is_active && (
                  <option value={admin.school.id} key={`current-${admin.school.id}`}>
                    {admin.school.name} (Inactive)
                  </option>
                )}
                {schools.filter((school) => school.is_active).map((school) => (
                  <option value={school.id} key={school.id}>
                    {school.name}{school.is_active ? '' : ' (Inactive)'}
                  </option>
                ))}
              </select>
            </div>
            {isEditing && (
              <>
                <div className="col-12">
                  <div className="form-check">
                    <input
                      id="admin-is-active"
                      type="checkbox"
                      className="form-check-input"
                      checked={values.isActive}
                      onChange={(event) => updateValue('isActive', event.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="admin-is-active">
                      Account is active
                    </label>
                  </div>
                </div>
                <div className="col-12">
                  <label htmlFor="admin-password" className="form-label">New password (optional)</label>
                  <input
                    id="admin-password"
                    type="password"
                    className="form-control"
                    value={values.password}
                    onChange={(event) => updateValue('password', event.target.value)}
                    autoComplete="new-password"
                  />
                  <div className="form-text">Leave blank to keep the current password.</div>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="card-footer bg-white d-flex justify-content-end gap-2 p-3">
          <Link to={adminId ? `/superadmin/admins/${adminId}` : '/superadmin/admins'} className="btn btn-outline-secondary">
            Cancel
          </Link>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Administrator'}
          </Button>
        </div>
      </form>
    </div>
  );
};
