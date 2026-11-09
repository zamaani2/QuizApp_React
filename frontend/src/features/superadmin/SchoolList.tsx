import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { deleteSuperadminSchool, fetchSuperadminSchools } from '../../api/admin';
import type { SuperadminSchool } from '../../types';
import { DataTable, type Column } from '../../components/table/DataTable';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';

export const SchoolList: React.FC = () => {
  const [schools, setSchools] = useState<SuperadminSchool[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const loadSchools = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchSuperadminSchools();
      setSchools(response.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schools registry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSchools();
  }, [loadSchools]);

  const activeCount = schools.filter((s) => s.is_active).length;
  const visibleSchools = useMemo(
    () => schools.filter((school) => (
      statusFilter === 'all'
      || (statusFilter === 'active' && school.is_active)
      || (statusFilter === 'inactive' && !school.is_active)
    )),
    [schools, statusFilter]
  );

  const handleDelete = async (school: SuperadminSchool) => {
    if (!window.confirm(`Are you sure you want to delete "${school.name}"? This action cannot be undone.`)) {
      return;
    }
    setError(null);
    try {
      await deleteSuperadminSchool(school.id);
      await loadSchools();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete school.');
    }
  };

  const columns: Column<SuperadminSchool>[] = [
    {
      id: 'name',
      header: 'School Name',
      sortable: true,
      accessor: (row) => (
        <div>
          <Link to={`/superadmin/schools/${row.id}`} className="core-type--weight-bold core-text--dark">
            {row.name}
          </Link>
          {row.short_name && (
            <span className="core-badge core-surface--light core-text--secondary core-space--margin-start-2 core-border">{row.short_name}</span>
          )}
        </div>
      ),
    },
    {
      id: 'school_code',
      header: 'School Code',
      sortable: true,
      accessor: (row) => <code className="core-text--primary">{row.school_code || '—'}</code>,
    },
    {
      id: 'address',
      header: 'Address',
      sortable: true,
      accessor: (row) => row.address || '—',
    },
    {
      id: 'phone',
      header: 'Phone',
      accessor: (row) => row.phone_number || '—',
    },
    {
      id: 'current_academic_year',
      header: 'Current Academic Year',
      accessor: (row) => row.current_academic_year || 'Not set',
    },
    {
      id: 'contact',
      header: 'Contact Info',
      accessor: (row) => (
        <div className="core-type--small">
          {row.email && <div>{row.email}</div>}
          {row.phone_number && <div className="core-text--muted">{row.phone_number}</div>}
        </div>
      ),
    },
    {
      id: 'stats',
      header: 'Enrollment',
      align: 'center',
      accessor: (row) => (
        <div className="core-display-flex core-layout--justify-center core-layout--gap-2 core-type--small">
          <span className="core-badge core-surface--primary-subtle core-text--primary core-border" title="Students">
            {row.total_students} Students
          </span>
          <span className="core-badge core-surface--success-subtle core-text--success core-border" title="Teachers">
            {row.total_teachers} Teachers
          </span>
          <span className="core-badge core-surface--info-subtle core-text--info core-border" title="Classes">
            {row.total_classes} Classes
          </span>
        </div>
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
          <Link className="core-button core-button--sm core-button--outline-primary" to={`/superadmin/schools/${row.id}`}>
            View
          </Link>
          <Link className="core-button core-button--sm core-button--outline-secondary" to={`/superadmin/schools/${row.id}/edit`}>
            Edit
          </Link>
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={() => void handleDelete(row)}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="core-container core-space--padding-y-4" data-testid="superadmin-school-list">
      <div className="core-display-flex core-layout--wrap core-layout--justify-between core-layout--align-center core-space--margin-bottom-4 core-layout--gap-3">
        <div>
          <h2 className="core-type--heading-3 core-type--weight-bold core-text--dark core-space--margin-bottom-1">Schools Registry</h2>
          <p className="core-text--muted core-space--margin-bottom-0">
            System-wide multi-tenant school overview and statistics
          </p>
        </div>
        <div className="core-display-flex core-layout--gap-2">
          <Button variant="secondary" size="sm" onClick={loadSchools} disabled={loading}>
            Refresh
          </Button>
          <Link to="/superadmin/schools/new" className="core-button core-button--sm core-button--primary">
            Add School
          </Link>
        </div>
      </div>

      {error && (
        <Alert variant="danger" dismissible onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Overview Cards */}
      <div className="core-grid core-grid--gap-3 core-space--margin-bottom-4">
        <div className="core-grid__span-12 core-grid__span-sm-6 core-grid__span-md-3">
          <div className="core-card core-shadow--sm core-border--none core-border--start core-border--primary core-border--width-4">
            <div className="core-card__body">
              <div className="core-text--muted core-type--small core-text--uppercase core-type--weight-bold">Total Schools</div>
              <div className="core-type--heading-3 core-type--weight-bold core-text--dark core-space--margin-top-2 core-space--margin-bottom-0">{schools.length}</div>
            </div>
          </div>
        </div>
        <div className="core-grid__span-12 core-grid__span-sm-6 core-grid__span-md-3">
          <div className="core-card core-shadow--sm core-border--none core-border--start core-border--success core-border--width-4">
            <div className="core-card__body">
              <div className="core-text--muted core-type--small core-text--uppercase core-type--weight-bold">Active Schools</div>
              <div className="core-type--heading-3 core-type--weight-bold core-text--dark core-space--margin-top-2 core-space--margin-bottom-0">{activeCount}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="core-display-flex core-layout--wrap core-layout--align-center core-layout--gap-2 core-space--margin-bottom-3">
        <label htmlFor="school-status-filter" className="core-type--weight-semibold">Filter by status</label>
        <select
          id="school-status-filter"
          className="core-field__select core-size--width-auto"
          value={statusFilter}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setStatusFilter(
              value === 'active' || value === 'inactive' ? value : 'all'
            );
          }}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={() => setStatusFilter('all')}
          disabled={statusFilter === 'all'}
        >
          Clear filter
        </Button>
      </div>

      <div className="core-card core-shadow--sm core-border--none">
        <div className="core-card__body core-space--padding-0">
          <DataTable<SuperadminSchool>
            columns={columns}
            data={visibleSchools}
            keyExtractor={(row) => row.id}
            loading={loading}
            searchable={true}
            searchPlaceholder="Search schools by name, code, or contact..."
            emptyTitle="No Schools Found"
            emptyDescription="There are currently no schools registered in the system."
          />
        </div>
      </div>
    </div>
  );
};
