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
          <Link to={`/superadmin/admins/${row.id}`} className="core-type--weight-bold core-text--dark">
            {row.full_name || row.username}
          </Link>
          <div className="core-type--small core-text--muted">@{row.username}</div>
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
          <span className="core-badge core-surface--primary-subtle core-text--primary core-border">
            {row.school?.name || 'Unassigned'}
          </span>
          {row.school && !row.school.is_active && (
            <span className="core-badge core-surface--warning-subtle core-text--warning-emphasis core-border core-space--margin-start-1">
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
        <small className="core-text--muted">{row.date_joined ? row.date_joined.split('T')[0] : '—'}</small>
      ),
    },
    {
      id: 'last_login',
      header: 'Last Login',
      sortable: true,
      accessor: (row) => (
        <small className="core-text--muted">{row.last_login ? row.last_login.split('T')[0] : 'Never'}</small>
      ),
    },
    {
      id: 'is_active',
      header: 'Status',
      sortable: true,
      align: 'center',
      accessor: (row) => (
        <span className={`core-badge ${row.is_active ? 'core-surface--success' : 'core-surface--secondary'}`}>
          {row.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      accessor: (row) => (
        <div className="core-display-flex core-layout--wrap core-layout--gap-2">
          <Link className="core-button core-button--sm core-button--outline-primary" to={`/superadmin/admins/${row.id}`}>
            View
          </Link>
          <Link className="core-button core-button--sm core-button--outline-secondary" to={`/superadmin/admins/${row.id}/edit`}>
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
    <div className="core-container core-space--padding-y-4" data-testid="superadmin-admin-list">
      <div className="core-display-flex core-layout--wrap core-layout--justify-between core-layout--align-center core-space--margin-bottom-4 core-layout--gap-3">
        <div>
          <h2 className="core-type--heading-3 core-type--weight-bold core-text--dark core-space--margin-bottom-1">School Administrators</h2>
          <p className="core-text--muted core-space--margin-bottom-0">
            Manage administrator accounts across tenant institutions
          </p>
        </div>
        <div className="core-display-flex core-layout--wrap core-layout--gap-2">
          <Button variant="secondary" size="sm" onClick={() => void loadAdmins()} disabled={loading}>
            Refresh
          </Button>
          <Link to="/superadmin/admins/new" className="core-button core-button--sm core-button--primary">
            Add Administrator
          </Link>
        </div>
      </div>

      {error && (
        <Alert variant="danger" dismissible onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      <div className="core-grid core-grid--gap-3 core-space--margin-bottom-4">
        <div className="core-grid__span-12 core-grid__span-sm-6 core-grid__span-md-3">
          <div className="core-card core-shadow--sm core-border--none core-border--start core-border--primary core-border--width-4 core-size--height-full">
            <div className="core-card__body">
              <div className="core-text--muted core-type--small core-text--uppercase core-type--weight-bold">Total Admins</div>
              <div className="core-type--heading-3 core-type--weight-bold core-text--dark core-space--margin-top-2 core-space--margin-bottom-0">{admins.length}</div>
            </div>
          </div>
        </div>
        <div className="core-grid__span-12 core-grid__span-sm-6 core-grid__span-md-3">
          <div className="core-card core-shadow--sm core-border--none core-border--start core-border--success core-border--width-4 core-size--height-full">
            <div className="core-card__body">
              <div className="core-text--muted core-type--small core-text--uppercase core-type--weight-bold">Active Admins</div>
              <div className="core-type--heading-3 core-type--weight-bold core-text--dark core-space--margin-top-2 core-space--margin-bottom-0">{activeCount}</div>
            </div>
          </div>
        </div>
        <div className="core-grid__span-12 core-grid__span-sm-6 core-grid__span-md-3">
          <div className="core-card core-shadow--sm core-border--none core-border--start core-border--info core-border--width-4 core-size--height-full">
            <div className="core-card__body">
              <label htmlFor="admin-school-filter" className="core-text--muted core-type--small core-text--uppercase core-type--weight-bold">
                School
              </label>
              <select
                id="admin-school-filter"
                className="core-field__select core-field__select--sm core-space--margin-top-2"
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
        <div className="core-grid__span-12 core-grid__span-sm-6 core-grid__span-md-3">
          <div className="core-card core-shadow--sm core-border--none core-border--start core-border--secondary core-border--width-4 core-size--height-full">
            <div className="core-card__body">
              <label htmlFor="admin-status-filter" className="core-text--muted core-type--small core-text--uppercase core-type--weight-bold">
                Status
              </label>
              <select
                id="admin-status-filter"
                className="core-field__select core-field__select--sm core-space--margin-top-2"
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

      <div className="core-card core-shadow--sm core-border--none">
        <div className="core-card__body core-space--padding-0">
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
