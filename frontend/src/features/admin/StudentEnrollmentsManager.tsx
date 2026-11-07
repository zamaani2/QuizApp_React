import React, { useEffect, useState, useCallback } from 'react';
import { allocationsApi } from '../../api/allocations';
import type { StudentEnrollment, EnrollmentLookups } from '../../types';
import { DataTable, type Column } from '../../components/table/DataTable';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import './StudentEnrollmentsManager.css';

export const StudentEnrollmentsManager: React.FC = () => {
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [lookups, setLookups] = useState<EnrollmentLookups | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | 'all'>('all');
  const [selectedClassId, setSelectedClassId] = useState<number | 'all'>('all');
  const [selectedStudentId, setSelectedStudentId] = useState<number | 'all'>('all');
  const [activeFilter, setActiveFilter] = useState<'all' | 'true' | 'false'>('all');

  // Single Enroll Modal
  const [isSingleModalOpen, setIsSingleModalOpen] = useState<boolean>(false);
  const [singleStudentId, setSingleStudentId] = useState<number | ''>('');
  const [singleClassId, setSingleClassId] = useState<number | ''>('');
  const [singleSubmitting, setSingleSubmitting] = useState<boolean>(false);
  const [singleError, setSingleError] = useState<string | null>(null);

  // Bulk Enroll Modal
  const [isBulkModalOpen, setIsBulkModalOpen] = useState<boolean>(false);
  const [bulkClassId, setBulkClassId] = useState<number | ''>('');
  const [bulkStudentIds, setBulkStudentIds] = useState<number[]>([]);
  const [bulkSearch, setBulkSearch] = useState<string>('');
  const [bulkSubmitting, setBulkSubmitting] = useState<boolean>(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  // Edit / Transfer Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editingEnrollment, setEditingEnrollment] = useState<StudentEnrollment | null>(null);
  const [transferClassId, setTransferClassId] = useState<number | ''>('');
  const [transferActive, setTransferActive] = useState<boolean>(true);
  const [editSubmitting, setEditSubmitting] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete Confirm Dialog
  const [deleteTarget, setDeleteTarget] = useState<StudentEnrollment | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<boolean>(false);
  const [selectedEnrollmentIds, setSelectedEnrollmentIds] = useState<number[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [lookupRes, enrRes] = await Promise.all([
        allocationsApi.getEnrollmentLookups(
          selectedSchoolId === 'all' ? undefined : selectedSchoolId,
        ),
        allocationsApi.getEnrollments({
          class_id: selectedClassId === 'all' ? undefined : selectedClassId,
          student_id: selectedStudentId === 'all' ? undefined : selectedStudentId,
          is_active: activeFilter === 'true' ? true : activeFilter === 'false' ? false : undefined,
          school_id: selectedSchoolId === 'all' ? undefined : selectedSchoolId,
        }),
      ]);
      setLookups(lookupRes);
      setEnrollments(enrRes.enrollments);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load enrollment records.');
    } finally {
      setLoading(false);
    }
  }, [selectedSchoolId, selectedClassId, selectedStudentId, activeFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setSelectedEnrollmentIds([]);
  }, [selectedSchoolId, selectedClassId, selectedStudentId, activeFilter]);

  const openSingleModal = () => {
    setSingleStudentId('');
    setSingleClassId(selectedClassId !== 'all' ? selectedClassId : lookups?.classes[0]?.id || '');
    setSingleError(null);
    setIsSingleModalOpen(true);
  };

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleStudentId || !singleClassId) {
      setSingleError('Please select both a student and a target class.');
      return;
    }

    setSingleSubmitting(true);
    setSingleError(null);
    try {
      const res = await allocationsApi.createEnrollment({
        student_id: Number(singleStudentId),
        class_id: Number(singleClassId),
      });
      setSuccessMessage(res.message);
      setIsSingleModalOpen(false);
      void loadData();
    } catch (err) {
      setSingleError(err instanceof Error ? err.message : 'Enrollment failed.');
    } finally {
      setSingleSubmitting(false);
    }
  };

  const openBulkModal = () => {
    setBulkClassId(selectedClassId !== 'all' ? selectedClassId : lookups?.classes[0]?.id || '');
    setBulkStudentIds([]);
    setBulkSearch('');
    setBulkError(null);
    setIsBulkModalOpen(true);
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkClassId || bulkStudentIds.length === 0) {
      setBulkError('Please select a target class and at least one student.');
      return;
    }

    setBulkSubmitting(true);
    setBulkError(null);
    try {
      const res = await allocationsApi.bulkEnrollStudents({
        class_id: Number(bulkClassId),
        student_ids: bulkStudentIds,
      });
      setSuccessMessage(res.message);
      setIsBulkModalOpen(false);
      await loadData();
      if (res.errors.length) {
        setError((previous) =>
          [previous, ...res.errors].filter(Boolean).join(' '),
        );
      }
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : 'Bulk enrollment failed.');
    } finally {
      setBulkSubmitting(false);
    }
  };

  const openEditModal = (enr: StudentEnrollment) => {
    setEditingEnrollment(enr);
    setTransferClassId(enr.assigned_class_id);
    setTransferActive(enr.is_active);
    setEditError(null);
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEnrollment || !transferClassId) return;

    setEditSubmitting(true);
    setEditError(null);
    try {
      const res = await allocationsApi.updateEnrollment(editingEnrollment.id, {
        class_id: Number(transferClassId),
        is_active: transferActive,
      });
      setSuccessMessage(res.message);
      setIsEditModalOpen(false);
      void loadData();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update enrollment.');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const res = await allocationsApi.deleteEnrollment(deleteTarget.id);
      setSuccessMessage(res.message);
      setDeleteTarget(null);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove enrollment.');
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleBulkDeleteConfirm = async () => {
    if (selectedEnrollmentIds.length === 0) return;
    const selectedSchools = new Set(
      enrollments
        .filter((enrollment) => selectedEnrollmentIds.includes(enrollment.id))
        .map((enrollment) => enrollment.school_id)
        .filter((schoolId): schoolId is number => schoolId !== null),
    );
    if (lookups?.schools && selectedSchools.size !== 1) {
      setError('Select enrollments from one school at a time. Filter by school before removing records.');
      setBulkDeleteOpen(false);
      return;
    }
    setBulkDeleteLoading(true);
    try {
      const targetSchoolId = lookups?.schools
        ? Array.from(selectedSchools)[0]
        : undefined;
      const res = await allocationsApi.bulkDeleteEnrollments(
        selectedEnrollmentIds,
        targetSchoolId,
      );
      setSuccessMessage(res.message);
      setSelectedEnrollmentIds([]);
      setBulkDeleteOpen(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove selected enrollments.');
      setBulkDeleteOpen(false);
    } finally {
      setBulkDeleteLoading(false);
    }
  };

  const toggleStudentSelection = (id: number) => {
    setBulkStudentIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleEnrollmentSelection = (id: number) => {
    setSelectedEnrollmentIds((previous) =>
      previous.includes(id) ? previous.filter((selectedId) => selectedId !== id) : [...previous, id]
    );
  };

  const filteredBulkStudents =
    lookups?.students.filter((student) => {
      const targetClass = lookups.classes.find((classItem) => classItem.id === bulkClassId);
      const sameSchool = !targetClass || student.school_id === targetClass.school_id;
      const matchesSearch = !bulkSearch
        || student.full_name.toLowerCase().includes(bulkSearch.toLowerCase())
        || student.admission_number.toLowerCase().includes(bulkSearch.toLowerCase());
      return sameSchool && matchesSearch;
    }) || [];

  const singleClass = lookups?.classes.find((classItem) => classItem.id === singleClassId);
  const singleStudents = lookups?.students.filter(
    (student) => !singleClass || student.school_id === singleClass.school_id,
  ) || [];
  const editClasses = lookups?.classes.filter(
    (classItem) => classItem.school_id === editingEnrollment?.school_id,
  ) || [];
  const schoolName = (schoolId: number | null) =>
    lookups?.schools?.find((school) => school.id === schoolId)?.name;

  const columns: Column<StudentEnrollment>[] = [
    {
      id: 'selection',
      header: 'Select',
      align: 'center',
      accessor: (row) => (
        <input
          type="checkbox"
          aria-label={`Select enrollment for ${row.student_name}`}
          checked={selectedEnrollmentIds.includes(row.id)}
          onChange={() => toggleEnrollmentSelection(row.id)}
        />
      ),
    },
    {
      id: 'student_info',
      header: 'Student & Admission',
      sortable: true,
      accessor: (row) => (
        <div>
          <div className="fw-bold text-dark">{row.student_name}</div>
          <code className="small text-primary">{row.admission_number}</code>
        </div>
      ),
    },
    {
      id: 'gender',
      header: 'Gender',
      align: 'center',
      accessor: (row) => (
        <span className="badge bg-light text-dark border">
          {row.gender === 'M' ? 'Male' : row.gender === 'F' ? 'Female' : row.gender || '—'}
        </span>
      ),
    },
    {
      id: 'class_info',
      header: 'Assigned Class & Session',
      sortable: true,
      accessor: (row) => (
        <div>
          <span className="badge bg-primary-subtle text-primary border border-primary-subtle me-1">
            <i className="bi bi-building me-1" />
            {row.class_name}
          </span>
          {row.academic_year_name && (
            <span className="small text-secondary">({row.academic_year_name})</span>
          )}
        </div>
      ),
    },
    {
      id: 'assigned_meta',
      header: 'Enrollment Details',
      sortable: true,
      accessor: (row) => (
        <div className="small text-muted">
          <div>
            <i className="bi bi-calendar-event me-1" />
            {row.date_assigned ? new Date(row.date_assigned).toLocaleDateString() : '—'}
          </div>
          {row.assigned_by_name && <div>By: {row.assigned_by_name}</div>}
        </div>
      ),
    },
    ...(lookups?.schools
      ? [{
          id: 'school',
          header: 'School',
          sortable: true,
          accessor: (row: StudentEnrollment) =>
            row.school_name || schoolName(row.school_id) || '—',
        }]
      : []),
    {
      id: 'status',
      header: 'Status',
      align: 'center',
      accessor: (row) => (
        <span className={`badge ${row.is_active ? 'bg-success' : 'bg-secondary'}`}>
          {row.is_active ? 'Active' : 'Archived / Transferred'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      accessor: (row) => (
        <div className="d-flex justify-content-end gap-1">
          <Button
            variant="outline-primary"
            size="sm"
            onClick={() => openEditModal(row)}
            title="Transfer / Edit Enrollment"
          >
            <i className="bi bi-arrow-left-right me-1" />
            Transfer
          </Button>
          <Button
            variant="outline-danger"
            size="sm"
            onClick={() => setDeleteTarget(row)}
            title="Remove Enrollment"
          >
            <i className="bi bi-trash" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="enrollment-admin">
      {/* Header */}
      <header className="enrollment-admin__heading">
        <div>
          <p className="enrollment-admin__eyebrow">PEOPLE & ROSTERS</p>
          <div className="d-flex align-items-center gap-2">
            <h1>Student Class Enrollments</h1>
            <span className="enrollment-admin__record-count">
              {enrollments.length} Records
            </span>
          </div>
          <p className="enrollment-admin__description">
            Assign students to class cohorts, manage class transfers, and track active student rosters.
          </p>
        </div>

        <div className="enrollment-admin__actions">
          <Button variant="outline-primary" size="sm" onClick={openBulkModal}>
            <i className="bi bi-people-fill me-1" />
            Bulk Enroll
          </Button>
          <Button variant="primary" size="sm" onClick={openSingleModal}>
            <i className="bi bi-person-plus-fill me-1" />
            Enroll Student
          </Button>
          {selectedEnrollmentIds.length > 0 && (
            <Button variant="outline-danger" size="sm" onClick={() => setBulkDeleteOpen(true)}>
              Remove selected ({selectedEnrollmentIds.length})
            </Button>
          )}
        </div>
      </header>

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

      {/* Filter Toolbar */}
      <section className="enrollment-admin__toolbar" aria-label="Enrollment filters">
          <div className="enrollment-admin__filters">
            {lookups?.schools && (
              <label className="enrollment-admin__filter" htmlFor="filter-school">
                School
                <select
                  id="filter-school"
                  className="form-select form-select-sm"
                  value={selectedSchoolId}
                  onChange={(event) => {
                    setSelectedSchoolId(event.target.value === 'all' ? 'all' : Number(event.target.value));
                    setSelectedClassId('all');
                    setSelectedStudentId('all');
                    setSelectedEnrollmentIds([]);
                  }}
                >
                  <option value="all">All schools</option>
                  {lookups.schools.map((school) => (
                    <option key={school.id} value={school.id}>{school.name}</option>
                  ))}
                </select>
              </label>
            )}
            {/* Class Filter */}
            <label className="enrollment-admin__filter" htmlFor="filter-class">
                Class
              <select
                id="filter-class"
                className="form-select form-select-sm"
                value={selectedClassId}
                onChange={(e) =>
                  setSelectedClassId(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
              >
                <option value="all">All Classes</option>
                {lookups?.classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{schoolName(c.school_id) ? ` — ${schoolName(c.school_id)}` : ''} ({c.current_students}/{c.maximum_students})
                  </option>
                ))}
              </select>
            </label>

            <label className="enrollment-admin__filter" htmlFor="filter-student">
              Student
              <select
                id="filter-student"
                className="form-select form-select-sm"
                value={selectedStudentId}
                onChange={(event) => {
                  setSelectedStudentId(event.target.value === 'all' ? 'all' : Number(event.target.value));
                  setSelectedEnrollmentIds([]);
                }}
              >
                <option value="all">All students</option>
                {lookups?.students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.full_name}{schoolName(student.school_id) ? ` — ${schoolName(student.school_id)}` : ''}
                  </option>
                ))}
              </select>
            </label>

            {/* Status Filter */}
            <div className="enrollment-admin__status-filter">
              <span className="small fw-semibold text-secondary">Status:</span>
              <div className="btn-group btn-group-sm" role="group">
                <button
                  type="button"
                  className={`btn ${activeFilter === 'true' ? 'btn-primary' : 'btn-outline-secondary'}`}
                  onClick={() => setActiveFilter('true')}
                >
                  Active Only
                </button>
                <button
                  type="button"
                  className={`btn ${activeFilter === 'false' ? 'btn-primary' : 'btn-outline-secondary'}`}
                  onClick={() => setActiveFilter('false')}
                >
                  Inactive / Past
                </button>
                <button
                  type="button"
                  className={`btn ${activeFilter === 'all' ? 'btn-primary' : 'btn-outline-secondary'}`}
                  onClick={() => setActiveFilter('all')}
                >
                  All
                </button>
              </div>
            </div>
          </div>

          <Button
            variant="outline-secondary"
            size="sm"
            onClick={loadData}
            loading={loading}
          >
            <i className="bi bi-arrow-repeat me-1" />
            Refresh
          </Button>
      </section>

      {/* Enrollments Table */}
      <div className="card shadow-sm border-0">
        <div className="card-body p-0">
          <DataTable
            data={enrollments}
            columns={columns}
            keyExtractor={(row) => row.id}
            loading={loading}
            emptyTitle="No student enrollments found."
            searchPlaceholder="Search enrollments by student name, admission number, or class..."
          />
        </div>
      </div>

      {/* Single Enroll Modal */}
      <Modal
        isOpen={isSingleModalOpen}
        onClose={() => setIsSingleModalOpen(false)}
        title="Enroll Student in Class"
        footer={
          <div className="d-flex justify-content-end gap-2 w-100">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsSingleModalOpen(false)}
              disabled={singleSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSingleSubmit}
              loading={singleSubmitting}
            >
              Enroll Student
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSingleSubmit}>
          {singleError && (
            <Alert variant="danger" className="mb-3">
              {singleError}
            </Alert>
          )}

          <div className="mb-3">
            <label htmlFor="single-student" className="form-label small fw-semibold">
              Select Student <span className="text-danger">*</span>
            </label>
            <select
              id="single-student"
              className="form-select"
              value={singleStudentId}
              onChange={(e) =>
                setSingleStudentId(e.target.value ? Number(e.target.value) : '')
              }
              required
            >
              <option value="">-- Choose Student --</option>
              {singleStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.admission_number} - {s.full_name}{' '}
                  {schoolName(s.school_id) ? `— ${schoolName(s.school_id)} ` : ''}
                  {s.current_class ? `(Currently in ${s.current_class})` : '(Unassigned)'}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-3">
            <label htmlFor="single-class" className="form-label small fw-semibold">
              Target Class Cohort <span className="text-danger">*</span>
            </label>
            <select
              id="single-class"
              className="form-select"
              value={singleClassId}
              onChange={(e) => {
                const nextClassId = e.target.value ? Number(e.target.value) : '';
                setSingleClassId(nextClassId);
                const nextClass = lookups?.classes.find((classItem) => classItem.id === nextClassId);
                const selectedStudent = lookups?.students.find((student) => student.id === singleStudentId);
                if (nextClass && selectedStudent && selectedStudent.school_id !== nextClass.school_id) {
                  setSingleStudentId('');
                }
              }}
              required
            >
              <option value="">-- Choose Target Class --</option>
              {lookups?.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{schoolName(c.school_id) ? ` — ${schoolName(c.school_id)}` : ''} — {c.current_students}/{c.maximum_students} students{' '}
                  {c.is_full ? '(Full)' : ''}
                </option>
              ))}
            </select>
            <div className="form-text">
              Enrolling into a new class automatically deactivates previous cohort assignments.
            </div>
          </div>
        </form>
      </Modal>

      {/* Bulk Enroll Modal */}
      <Modal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        title="Bulk Enroll Students"
        size="lg"
        footer={
          <div className="d-flex justify-content-between align-items-center w-100">
            <span className="small text-muted">
              {bulkStudentIds.length} student(s) selected
            </span>
            <div className="d-flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsBulkModalOpen(false)}
                disabled={bulkSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleBulkSubmit}
                loading={bulkSubmitting}
                disabled={bulkStudentIds.length === 0}
              >
                Enroll Selected ({bulkStudentIds.length})
              </Button>
            </div>
          </div>
        }
      >
        <form onSubmit={handleBulkSubmit}>
          {bulkError && (
            <Alert variant="danger" className="mb-3">
              {bulkError}
            </Alert>
          )}

          <div className="mb-3">
            <label htmlFor="bulk-class" className="form-label small fw-semibold">
              Target Class Cohort <span className="text-danger">*</span>
            </label>
            <select
              id="bulk-class"
              className="form-select"
              value={bulkClassId}
              onChange={(e) => {
                setBulkClassId(e.target.value ? Number(e.target.value) : '');
                setBulkStudentIds([]);
              }}
              required
            >
              <option value="">-- Choose Target Class --</option>
              {lookups?.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{schoolName(c.school_id) ? ` — ${schoolName(c.school_id)}` : ''} — {c.current_students}/{c.maximum_students} students{' '}
                  {c.is_full ? '(Full)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-2 d-flex justify-content-between align-items-center">
            <label htmlFor="bulk-search-student" className="form-label small fw-semibold mb-0">
              Select Students to Enroll:
            </label>
            <input
              id="bulk-search-student"
              type="text"
              className="form-control form-control-sm"
              style={{ width: '220px' }}
              placeholder="Search students..."
              value={bulkSearch}
              onChange={(e) => setBulkSearch(e.target.value)}
            />
          </div>

          <div className="border rounded p-2 overflow-y-auto" style={{ maxHeight: '250px' }}>
            {filteredBulkStudents.map((s) => {
              const isChecked = bulkStudentIds.includes(s.id);
              return (
                <div
                  key={s.id}
                  className={`form-check py-1 px-3 d-flex align-items-center gap-2 rounded ${
                    isChecked ? 'bg-primary-subtle' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    className="form-check-input"
                    aria-label={`Select ${s.full_name}`}
                    checked={isChecked}
                    onChange={() => toggleStudentSelection(s.id)}
                  />
                  <div className="flex-grow-1">
                    <span className="fw-semibold text-dark">{s.full_name}</span>{' '}
                    <code className="small text-muted">{s.admission_number}</code>
                  </div>
                  {s.current_class ? (
                    <span className="badge bg-light text-dark border small">
                      In {s.current_class}
                    </span>
                  ) : (
                    <span className="badge bg-success-subtle text-success small">Unassigned</span>
                  )}
                </div>
              );
            })}
            {filteredBulkStudents.length === 0 && (
              <div className="text-center py-3 text-muted small">No students found.</div>
            )}
          </div>
        </form>
      </Modal>

      {/* Transfer / Edit Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={`Transfer ${editingEnrollment?.student_name}`}
        footer={
          <div className="d-flex justify-content-end gap-2 w-100">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsEditModalOpen(false)}
              disabled={editSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleEditSubmit}
              loading={editSubmitting}
            >
              Save Changes
            </Button>
          </div>
        }
      >
        <form onSubmit={handleEditSubmit}>
          {editError && (
            <Alert variant="danger" className="mb-3">
              {editError}
            </Alert>
          )}

          <div className="mb-3">
            <label htmlFor="transfer-class" className="form-label small fw-semibold">
              Transfer to Class <span className="text-danger">*</span>
            </label>
            <select
              id="transfer-class"
              className="form-select"
              value={transferClassId}
              onChange={(e) =>
                setTransferClassId(e.target.value ? Number(e.target.value) : '')
              }
              disabled={!transferActive}
              required
            >
              {editClasses.map((c) => (
                <option key={c.id} value={c.id} disabled={c.is_full && c.id !== editingEnrollment?.assigned_class_id}>
                  {c.name}{schoolName(c.school_id) ? ` — ${schoolName(c.school_id)}` : ''} — {c.current_students}/{c.maximum_students} students{' '}
                  {c.is_full && c.id !== editingEnrollment?.assigned_class_id ? '(Full)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="form-check form-switch mb-2">
            <input
              id="transfer-active"
              className="form-check-input"
              type="checkbox"
              role="switch"
              checked={transferActive}
              onChange={(e) => setTransferActive(e.target.checked)}
            />
            <label className="form-check-label small fw-semibold" htmlFor="transfer-active">
              Active Enrollment Status
            </label>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="Remove Student Enrollment"
        message={
          <div>
            Remove enrollment of <strong>{deleteTarget?.student_name}</strong> from class{' '}
            <strong>{deleteTarget?.class_name}</strong>?
            <p className="text-muted small mt-2 mb-0">
              The student will no longer be listed in this cohort and will lose class-specific quiz access.
            </p>
          </div>
        }
        confirmLabel="Remove Enrollment"
        confirmVariant="danger"
        loading={deleteLoading}
      />

      <ConfirmDialog
        isOpen={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={handleBulkDeleteConfirm}
        title="Remove selected enrollments"
        message={`Remove ${selectedEnrollmentIds.length} selected enrollment record(s)? Student profiles and past academic records will remain.`}
        confirmLabel="Remove selected"
        confirmVariant="danger"
        loading={bulkDeleteLoading}
      />
    </div>
  );
};
