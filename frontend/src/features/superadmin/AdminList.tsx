import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  deleteSuperadminAdmin,
  fetchSuperadminAdmins,
  fetchSuperadminSchools,
} from '../../api/admin';
import type { SuperadminAdmin, SuperadminSchool } from '../../types';
import { DataTable, type Column } from '../../components/table/DataTable';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';

export const AdminList: React.FC = () => {
  const [admins, setAdmins] = useState<SuperadminAdmin[]>([]);
  const [schools, setSchools] = useState<SuperadminSchool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [schoolFilter, setSchoolFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const loadAdmins = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [adminResponse, schoolResponse] = await Promise.all([
        fetchSuperadminAdmins(),
        fetchSuperadminSchools(),
      ]);
      setAdmins(adminResponse.results);
      setSchools(schoolResponse.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load school administrators.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAdmins();
  }, [loadAdmins]);

  const visibleAdmins = useMemo(
    () =>
      admins.filter(
        (admin) =>
          (!schoolFilter || String(admin.school?.id ?? '') === schoolFilter) &&
          (statusFilter === 'all' ||
            (statusFilter === 'active' && admin.is_active) ||
            (statusFilter === 'inactive' && !admin.is_active))
      ),
    [admins, schoolFilter, statusFilter]
  );
  const activeCount = admins.filter((admin) => admin.is_active).length;

  const handleDelete = async (admin: SuperadminAdmin) => {
    if (!window.confirm(`Delete administrator "${admin.full_name}"? This cannot be undone.`)) {
      return;
    }
    setError(null);
    try {
      await deleteSuperadminAdmin(admin.id);
      await loadAdmins();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete administrator.');
    }
  };

  const columns: Column<SuperadminAdmin>[] = [
    {
      id: 'name',
      header: 'Administrator',
      sortable: true,
      accessor: (row) => (
        <div>
          <Link to={`/superadmin/admins/${row.id}`} className="fw-bold text-dark">
            {row.full_name || row.username}
          </Link>
          <div className="small text-muted">@{row.username}</div>
        </div>
      ),
    },
    {
      id: 'email',
      header: 'Email',
      sortable: true,
      accessor: (row) => row.email || '—',
    },
    {
      id: 'school',
      header: 'Assigned School',
      sortable: true,
      accessor: (row) => (
        <div>
          <span className="badge bg-primary-subtle text-primary border">
            {row.school?.name || 'Unassigned'}
          </span>
          {row.school && !row.school.is_active && (
            <span className="badge bg-warning-subtle text-warning-emphasis border ms-1">
              Inactive school
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'date_joined',
      header: 'Joined',
      sortable: true,
      accessor: (row) => (
        <small className="text-muted">{row.date_joined ? row.date_joined.split('T')[0] : '—'}</small>
      ),
    },
    {
      id: 'last_login',
      header: 'Last Login',
      sortable: true,
      accessor: (row) => (
        <small className="text-muted">{row.last_login ? row.last_login.split('T')[0] : 'Never'}</small>
      ),
    },
    {
      id: 'is_active',
      header: 'Status',
      sortable: true,
      align: 'center',
      accessor: (row) => (
        <span className={`badge ${row.is_active ? 'bg-success' : 'bg-secondary'}`}>
          {row.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      accessor: (row) => (
        <div className="d-flex flex-wrap gap-2">
          <Link className="btn btn-sm btn-outline-primary" to={`/superadmin/admins/${row.id}`}>
            View
          </Link>
          <Link className="btn btn-sm btn-outline-secondary" to={`/superadmin/admins/${row.id}/edit`}>
            Edit
          </Link>
          <Button type="button" variant="danger" size="sm" onClick={() => void handleDelete(row)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="container-fluid py-4" data-testid="superadmin-admin-list">
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
        <div>
          <h2 className="h3 fw-bold text-dark mb-1">School Administrators</h2>
          <p className="text-muted mb-0">
            Manage administrator accounts across tenant institutions
          </p>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => void loadAdmins()} disabled={loading}>
            Refresh
          </Button>
          <Link to="/superadmin/admins/new" className="btn btn-sm btn-primary">
            Add Administrator
          </Link>
        </div>
      </div>

      {error && (
        <Alert variant="danger" dismissible onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      <div className="row g-3 mb-4">
        <div className="col-12 col-sm-6 col-md-3">
          <div className="card shadow-sm border-0 border-start border-primary border-4 h-100">
            <div className="card-body">
              <div className="text-muted small text-uppercase fw-bold">Total Admins</div>
              <div className="h3 fw-bold text-dark mt-2 mb-0">{admins.length}</div>
            </div>
          </div>
        </div>
        <div className="col-12 col-sm-6 col-md-3">
          <div className="card shadow-sm border-0 border-start border-success border-4 h-100">
            <div className="card-body">
              <div className="text-muted small text-uppercase fw-bold">Active Admins</div>
              <div className="h3 fw-bold text-dark mt-2 mb-0">{activeCount}</div>
            </div>
          </div>
        </div>
        <div className="col-12 col-sm-6 col-md-3">
          <div className="card shadow-sm border-0 border-start border-info border-4 h-100">
            <div className="card-body">
              <label htmlFor="admin-school-filter" className="text-muted small text-uppercase fw-bold">
                School
              </label>
              <select
                id="admin-school-filter"
                className="form-select form-select-sm mt-2"
                value={schoolFilter}
                onChange={(event) => setSchoolFilter(event.target.value)}
              >
                <option value="">All schools</option>
                {schools.filter((school) => school.is_active).map((school) => (
                  <option value={school.id} key={school.id}>{school.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="col-12 col-sm-6 col-md-3">
          <div className="card shadow-sm border-0 border-start border-secondary border-4 h-100">
            <div className="card-body">
              <label htmlFor="admin-status-filter" className="text-muted small text-uppercase fw-bold">
                Status
              </label>
              <select
                id="admin-status-filter"
                className="form-select form-select-sm mt-2"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="card shadow-sm border-0">
        <div className="card-body p-0">
          <DataTable<SuperadminAdmin>
            columns={columns}
            data={visibleAdmins}
            keyExtractor={(row) => row.id}
            loading={loading}
            searchable
            searchPlaceholder="Search admins by name, username, email, or school..."
            emptyTitle="No Administrators Found"
            emptyDescription="There are no administrators matching the selected filters."
          />
        </div>
      </div>
    </div>
  );
};
