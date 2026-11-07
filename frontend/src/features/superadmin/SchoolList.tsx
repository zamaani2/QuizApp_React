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
          <Link to={`/superadmin/schools/${row.id}`} className="fw-bold text-dark">
            {row.name}
          </Link>
          {row.short_name && (
            <span className="badge bg-light text-secondary ms-2 border">{row.short_name}</span>
          )}
        </div>
      ),
    },
    {
      id: 'school_code',
      header: 'School Code',
      sortable: true,
      accessor: (row) => <code className="text-primary">{row.school_code || '—'}</code>,
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
        <div className="small">
          {row.email && <div>{row.email}</div>}
          {row.phone_number && <div className="text-muted">{row.phone_number}</div>}
        </div>
      ),
    },
    {
      id: 'stats',
      header: 'Enrollment',
      align: 'center',
      accessor: (row) => (
        <div className="d-flex justify-content-center gap-2 small">
          <span className="badge bg-primary-subtle text-primary border" title="Students">
            {row.total_students} Students
          </span>
          <span className="badge bg-success-subtle text-success border" title="Teachers">
            {row.total_teachers} Teachers
          </span>
          <span className="badge bg-info-subtle text-info border" title="Classes">
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
          <Link className="btn btn-sm btn-outline-primary" to={`/superadmin/schools/${row.id}`}>
            View
          </Link>
          <Link className="btn btn-sm btn-outline-secondary" to={`/superadmin/schools/${row.id}/edit`}>
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
    <div className="container-fluid py-4" data-testid="superadmin-school-list">
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
        <div>
          <h2 className="h3 fw-bold text-dark mb-1">Schools Registry</h2>
          <p className="text-muted mb-0">
            System-wide multi-tenant school overview and statistics
          </p>
        </div>
        <div className="d-flex gap-2">
          <Button variant="secondary" size="sm" onClick={loadSchools} disabled={loading}>
            Refresh
          </Button>
          <Link to="/superadmin/schools/new" className="btn btn-sm btn-primary">
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
      <div className="row g-3 mb-4">
        <div className="col-12 col-sm-6 col-md-3">
          <div className="card shadow-sm border-0 border-start border-primary border-4">
            <div className="card-body">
              <div className="text-muted small text-uppercase fw-bold">Total Schools</div>
              <div className="h3 fw-bold text-dark mt-2 mb-0">{schools.length}</div>
            </div>
          </div>
        </div>
        <div className="col-12 col-sm-6 col-md-3">
          <div className="card shadow-sm border-0 border-start border-success border-4">
            <div className="card-body">
              <div className="text-muted small text-uppercase fw-bold">Active Schools</div>
              <div className="h3 fw-bold text-dark mt-2 mb-0">{activeCount}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <label htmlFor="school-status-filter" className="fw-semibold">Filter by status</label>
        <select
          id="school-status-filter"
          className="form-select w-auto"
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

      <div className="card shadow-sm border-0">
        <div className="card-body p-0">
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
