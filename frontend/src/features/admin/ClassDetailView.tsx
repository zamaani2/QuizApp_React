import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { academicApi } from '../../api/academic';
import type { ClassDetailData, AssignedSubject, EnrolledStudent, StructureLookups } from '../../types';
import { DataTable, type Column } from '../../components/table/DataTable';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';

export const ClassDetailView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const classId = Number(id);

  const [detail, setDetail] = useState<ClassDetailData | null>(null);
  const [lookups, setLookups] = useState<StructureLookups | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<'subjects' | 'students'>('subjects');

  // Assign Subject Modal state
  const [isAssignModalOpen, setIsAssignModalOpen] = useState<boolean>(false);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | ''>('');
  const [assignLoading, setAssignLoading] = useState<boolean>(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // Remove Subject Dialog state
  const [removeTarget, setRemoveTarget] = useState<AssignedSubject | null>(null);
  const [removeLoading, setRemoveLoading] = useState<boolean>(false);

  const loadClassDetail = useCallback(async () => {
    if (!classId || isNaN(classId)) {
      setError('Invalid Class ID.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [classRes, lookupRes] = await Promise.all([
        academicApi.getClassDetail(classId),
        academicApi.getStructureLookups({ class_id: classId }),
      ]);
      setDetail(classRes);
      setLookups(lookupRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load class details.');
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    loadClassDetail();
  }, [loadClassDetail]);

  const handleAssignSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubjectId) {
      setAssignError('Please select a subject to assign.');
      return;
    }

    setAssignLoading(true);
    setAssignError(null);
    try {
      const res = await academicApi.assignClassSubject(classId, Number(selectedSubjectId));
      setSuccessMessage(res.message);
      setIsAssignModalOpen(false);
      setSelectedSubjectId('');
      loadClassDetail();
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : 'Failed to assign subject.');
    } finally {
      setAssignLoading(false);
    }
  };

  const handleRemoveSubjectConfirm = async () => {
    if (!removeTarget) return;
    setRemoveLoading(true);
    try {
      const res = await academicApi.removeClassSubject(classId, removeTarget.id);
      setSuccessMessage(res.message);
      setRemoveTarget(null);
      loadClassDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unassign subject.');
      setRemoveTarget(null);
    } finally {
      setRemoveLoading(false);
    }
  };

  // Filter available subjects: not already assigned
  const assignedSubjectIds = new Set(detail?.subjects.map((s) => s.subject_id) || []);
  const unassignedSubjects =
    lookups?.available_subjects?.filter((s) => !assignedSubjectIds.has(s.id)) || [];

  const subjectColumns: Column<AssignedSubject>[] = [
    {
      id: 'subject_code',
      header: 'Code',
      sortable: true,
      accessor: (row) => <code className="fw-bold text-primary">{row.subject_code}</code>,
    },
    {
      id: 'subject_name',
      header: 'Subject Name',
      sortable: true,
      accessor: (row) => <span className="fw-semibold text-dark">{row.subject_name}</span>,
    },
    {
      id: 'department',
      header: 'Department',
      sortable: true,
      accessor: (row) => (
        <span className="badge bg-light text-dark border">{row.department_name}</span>
      ),
    },
    {
      id: 'learning_area',
      header: 'Learning Area',
      sortable: true,
      accessor: (row) => (
        <span className="small text-secondary">{row.learning_area_name}</span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      accessor: (row) => (
        <Button
          variant="outline-danger"
          size="sm"
          onClick={() => setRemoveTarget(row)}
          title="Unassign Subject from Class"
        >
          <i className="bi bi-x-circle me-1" />
          Remove
        </Button>
      ),
    },
  ];

  const studentColumns: Column<EnrolledStudent>[] = [
    {
      id: 'admission_number',
      header: 'Admission No',
      sortable: true,
      accessor: (row) => <code className="fw-bold text-dark">{row.admission_number}</code>,
    },
    {
      id: 'full_name',
      header: 'Student Name',
      sortable: true,
      accessor: (row) => <span className="fw-semibold text-dark">{row.full_name}</span>,
    },
    {
      id: 'gender',
      header: 'Gender',
      sortable: true,
      align: 'center',
      accessor: (row) => (
        <span className="badge bg-light text-dark border">
          {row.gender === 'M' ? 'Male' : row.gender === 'F' ? 'Female' : row.gender || '—'}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      sortable: true,
      align: 'center',
      accessor: (row) => (
        <span className={`badge ${row.is_active ? 'bg-success' : 'bg-secondary'}`}>
          {row.is_active ? 'Active' : 'Archived'}
        </span>
      ),
    },
  ];

  if (loading && !detail) {
    return (
      <div className="container-fluid py-5 text-center">
        <LoadingSpinner size="lg" message="Loading class details..." />
      </div>
    );
  }

  if (error && !detail) {
    return (
      <div className="container-fluid py-5 text-center">
        <Alert variant="danger" className="d-inline-block text-start">
          {error}
        </Alert>
        <div className="mt-3">
          <Link to="/admin/classes" className="btn btn-secondary btn-sm">
            &larr; Back to Classes
          </Link>
        </div>
      </div>
    );
  }

  const cls = detail?.class;

  return (
    <div className="container-fluid py-4">
      {/* Breadcrumb Navigation */}
      <nav aria-label="breadcrumb" className="mb-3">
        <ol className="breadcrumb small">
          <li className="breadcrumb-item">
            <Link to="/admin/classes" className="text-decoration-none">
              Classes
            </Link>
          </li>
          <li className="breadcrumb-item active" aria-current="page">
            {cls?.name}
          </li>
        </ol>
      </nav>

      {/* Header */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4">
        <div>
          <div className="d-flex align-items-center gap-2">
            <h1 className="h3 fw-bold mb-0 text-dark">{cls?.name}</h1>
            <code className="text-muted fw-bold">{cls?.class_id}</code>
            <span className={`badge ${cls?.is_active ? 'bg-success' : 'bg-secondary'}`}>
              {cls?.is_active ? 'Active' : 'Archived'}
            </span>
          </div>
          <p className="text-muted small mb-0 mt-1">
            Form: <strong>{cls?.form_name || 'None'}</strong> &bull; Program:{' '}
            <strong>{cls?.learning_area_name || 'General'}</strong> &bull; Session:{' '}
            <strong>{cls?.academic_year_name || 'None'}</strong>
          </p>
        </div>

        <div className="d-flex align-items-center gap-2">
          <Link to="/admin/classes" className="btn btn-outline-secondary btn-sm">
            <i className="bi bi-arrow-left me-1" />
            Back to Classes
          </Link>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setAssignError(null);
              setSelectedSubjectId('');
              setIsAssignModalOpen(true);
            }}
          >
            <i className="bi bi-plus-circle me-1" />
            Assign Subject
          </Button>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <Alert
          variant="success"
          dismissible
          onDismiss={() => setSuccessMessage(null)}
          className="mb-4"
        >
          {successMessage}
        </Alert>
      )}

      {error && (
        <Alert
          variant="danger"
          dismissible
          onDismiss={() => setError(null)}
          className="mb-4"
        >
          {error}
        </Alert>
      )}

      {/* Overview Metric Cards */}
      <div className="row g-3 mb-4">
        <div className="col-12 col-sm-6 col-lg-3">
          <div className="card shadow-sm border-0 border-start border-primary border-4 h-100">
            <div className="card-body">
              <div className="text-muted small text-uppercase fw-bold">Enrollment</div>
              <div className="h3 fw-bold text-dark mt-2 mb-0">
                {detail?.students.length ?? 0}{' '}
                <span className="small fs-6 fw-normal text-muted">/ {cls?.maximum_students} cap</span>
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-lg-3">
          <div className="card shadow-sm border-0 border-start border-info border-4 h-100">
            <div className="card-body">
              <div className="text-muted small text-uppercase fw-bold">Assigned Subjects</div>
              <div className="h3 fw-bold text-dark mt-2 mb-0">
                {detail?.subjects.length ?? 0}
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-lg-3">
          <div className="card shadow-sm border-0 border-start border-success border-4 h-100">
            <div className="card-body">
              <div className="text-muted small text-uppercase fw-bold">Academic Session</div>
              <div className="h5 fw-bold text-dark mt-2 mb-0 text-truncate">
                {cls?.academic_year_name || 'Unassigned'}
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-lg-3">
          <div className="card shadow-sm border-0 border-start border-warning border-4 h-100">
            <div className="card-body">
              <div className="text-muted small text-uppercase fw-bold">Learning Track</div>
              <div className="h5 fw-bold text-dark mt-2 mb-0 text-truncate">
                {cls?.learning_area_name || 'General Studies'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="card shadow-sm border-0">
        <div className="card-header bg-white border-bottom p-0">
          <ul className="nav nav-tabs px-3 pt-2 border-0">
            <li className="nav-item">
              <button
                type="button"
                className={`nav-link fw-semibold ${activeTab === 'subjects' ? 'active' : ''}`}
                onClick={() => setActiveTab('subjects')}
              >
                <i className="bi bi-journal-bookmark me-2" />
                Assigned Subjects ({detail?.subjects.length ?? 0})
              </button>
            </li>
            <li className="nav-item">
              <button
                type="button"
                className={`nav-link fw-semibold ${activeTab === 'students' ? 'active' : ''}`}
                onClick={() => setActiveTab('students')}
              >
                <i className="bi bi-people me-2" />
                Enrolled Students ({detail?.students.length ?? 0})
              </button>
            </li>
          </ul>
        </div>

        <div className="card-body p-0">
          {activeTab === 'subjects' && (
            <DataTable
              data={detail?.subjects || []}
              columns={subjectColumns}
              keyExtractor={(row) => row.id}
              loading={loading}
              emptyTitle="No subjects assigned to this class yet."
              searchPlaceholder="Filter assigned subjects..."
            />
          )}

          {activeTab === 'students' && (
            <DataTable
              data={detail?.students || []}
              columns={studentColumns}
              keyExtractor={(row) => row.id}
              loading={loading}
              emptyTitle="No students currently enrolled in this class."
              searchPlaceholder="Filter enrolled students..."
            />
          )}
        </div>
      </div>

      {/* Assign Subject Modal */}
      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        title={`Assign Subject to ${cls?.name}`}
        footer={
          <div className="d-flex justify-content-end gap-2 w-100">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsAssignModalOpen(false)}
              disabled={assignLoading}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleAssignSubject}
              loading={assignLoading}
              disabled={!selectedSubjectId}
            >
              Assign Subject
            </Button>
          </div>
        }
      >
        <form onSubmit={handleAssignSubject}>
          {assignError && (
            <Alert variant="danger" className="mb-3">
              {assignError}
            </Alert>
          )}

          <div className="mb-3">
            <label htmlFor="select-subject" className="form-label small fw-semibold">
              Select Subject to Teach in this Class <span className="text-danger">*</span>
            </label>
            <select
              id="select-subject"
              className="form-select"
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(Number(e.target.value))}
              required
            >
              <option value="">-- Choose Subject --</option>
              {unassignedSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.subject_code} - {s.subject_name}
                </option>
              ))}
            </select>
            {unassignedSubjects.length === 0 && (
              <div className="form-text text-warning">
                All existing subjects are already assigned to this class.
              </div>
            )}
          </div>
        </form>
      </Modal>

      {/* Remove Subject Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleRemoveSubjectConfirm}
        title="Unassign Subject"
        message={
          <div>
            Unassign subject <strong>{removeTarget?.subject_name}</strong> ({removeTarget?.subject_code})
            from class <strong>{cls?.name}</strong>?
            <p className="text-muted small mt-2 mb-0">
              Future quizzes assigned to this subject will no longer link to this class cohort.
            </p>
          </div>
        }
        confirmLabel="Remove Subject"
        confirmVariant="danger"
        loading={removeLoading}
      />
    </div>
  );
};
