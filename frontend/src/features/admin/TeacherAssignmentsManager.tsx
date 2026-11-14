import { AppIcon } from '../../components/common/AppIcon';
import React, { useEffect, useState, useCallback } from 'react';
import { allocationsApi } from '../../api/allocations';
import type {
  TeacherAssignment,
  TeacherAssignmentLookups,
  ClassSubjectOption,
} from '../../types';
import { DataTable, type Column } from '../../components/table/DataTable';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { SideDrawer } from '../../components/common/SideDrawer';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';

export const TeacherAssignmentsManager: React.FC = () => {
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [lookups, setLookups] = useState<TeacherAssignmentLookups | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters
  const [selectedYearId, setSelectedYearId] = useState<number | 'all'>('all');
  const [selectedTeacherId, setSelectedTeacherId] = useState<number | 'all'>('all');
  const [selectedClassId, setSelectedClassId] = useState<number | 'all'>('all');
  const [activeFilter, setActiveFilter] = useState<'all' | 'true' | 'false'>('true');

  // Single Assign Modal
  const [isSingleModalOpen, setIsSingleModalOpen] = useState<boolean>(false);
  const [singleTeacherId, setSingleTeacherId] = useState<number | ''>('');
  const [singleClassId, setSingleClassId] = useState<number | ''>('');
  const [singleYearId, setSingleYearId] = useState<number | ''>('');
  const [singleSubjectId, setSingleSubjectId] = useState<number | ''>('');
  const [availableSubjects, setAvailableSubjects] = useState<ClassSubjectOption[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState<boolean>(false);
  const [singleSubmitting, setSingleSubmitting] = useState<boolean>(false);
  const [singleError, setSingleError] = useState<string | null>(null);

  // Bulk assignment workflow
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkTeacherId, setBulkTeacherId] = useState<number | ''>('');
  const [bulkYearId, setBulkYearId] = useState<number | ''>('');
  const [bulkClassId, setBulkClassId] = useState<number | ''>('');
  const [bulkAvailableSubjects, setBulkAvailableSubjects] = useState<ClassSubjectOption[]>([]);
  const [bulkAssignments, setBulkAssignments] = useState<Array<{ class_id: number; subject_id: number }>>([]);
  const [bulkSubjectsLoading, setBulkSubjectsLoading] = useState(false);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  // Edit / Reassign Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editingAssignment, setEditingAssignment] = useState<TeacherAssignment | null>(null);
  const [editTeacherId, setEditTeacherId] = useState<number | ''>('');
  const [editActive, setEditActive] = useState<boolean>(true);
  const [editSubmitting, setEditSubmitting] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete Confirm Dialog
  const [deleteTarget, setDeleteTarget] = useState<TeacherAssignment | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [lookupRes, assignRes] = await Promise.all([
        allocationsApi.getTeacherAssignmentLookups(),
        allocationsApi.getTeacherAssignments({
          academic_year_id: selectedYearId === 'all' ? undefined : selectedYearId,
          teacher_id: selectedTeacherId === 'all' ? undefined : selectedTeacherId,
          class_id: selectedClassId === 'all' ? undefined : selectedClassId,
          is_active: activeFilter === 'true' ? true : activeFilter === 'false' ? false : undefined,
        }),
      ]);
      setLookups(lookupRes);
      setAssignments(assignRes.assignments);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load teacher assignments.');
    } finally {
      setLoading(false);
    }
  }, [selectedYearId, selectedTeacherId, selectedClassId, activeFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load subjects dynamically when class or year changes in Single Modal
  useEffect(() => {
    if (!singleClassId) {
      setAvailableSubjects([]);
      return;
    }
    const fetchSubjects = async () => {
      setSubjectsLoading(true);
      try {
        const res = await allocationsApi.getClassSubjects(
          Number(singleClassId),
          singleYearId ? Number(singleYearId) : undefined
        );
        setAvailableSubjects(res.subjects);
      } catch {
        setAvailableSubjects([]);
      } finally {
        setSubjectsLoading(false);
      }
    };
    fetchSubjects();
  }, [singleClassId, singleYearId]);

  const openSingleModal = () => {
    const currentYear =
      selectedYearId !== 'all'
        ? selectedYearId
        : lookups?.academic_years.find((y) => y.is_current)?.id ||
          lookups?.academic_years[0]?.id ||
          '';

    setSingleTeacherId(selectedTeacherId !== 'all' ? selectedTeacherId : '');
    setSingleClassId(selectedClassId !== 'all' ? selectedClassId : '');
    setSingleYearId(currentYear);
    setSingleSubjectId('');
    setAvailableSubjects([]);
    setSingleError(null);
    setIsSingleModalOpen(true);
  };

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleTeacherId || !singleClassId || !singleYearId || !singleSubjectId) {
      setSingleError('Please select Teacher, Class, Session, and Subject.');
      return;
    }

    setSingleSubmitting(true);
    setSingleError(null);
    try {
      const res = await allocationsApi.createTeacherAssignment({
        teacher_id: Number(singleTeacherId),
        class_id: Number(singleClassId),
        academic_year_id: Number(singleYearId),
        subject_id: Number(singleSubjectId),
      });
      setSuccessMessage(res.message);
      setIsSingleModalOpen(false);
      loadData();
    } catch (err) {
      setSingleError(err instanceof Error ? err.message : 'Assignment failed.');
    } finally {
      setSingleSubmitting(false);
    }
  };

  const openBulkModal = () => {
    const currentYear =
      selectedYearId !== 'all'
        ? selectedYearId
        : lookups?.academic_years.find((year) => year.is_current)?.id ||
          lookups?.academic_years[0]?.id ||
          '';
    setBulkTeacherId(selectedTeacherId !== 'all' ? selectedTeacherId : '');
    setBulkYearId(currentYear);
    setBulkClassId('');
    setBulkAvailableSubjects([]);
    setBulkAssignments([]);
    setBulkError(null);
    setIsBulkModalOpen(true);
  };

  const loadBulkClassSubjects = async (classId: number | '') => {
    setBulkClassId(classId);
    setBulkAvailableSubjects([]);
    if (!classId) return;
    setBulkSubjectsLoading(true);
    setBulkError(null);
    try {
      const response = await allocationsApi.getClassSubjects(
        classId,
        bulkYearId ? Number(bulkYearId) : undefined
      );
      setBulkAvailableSubjects(response.subjects);
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : 'Could not load subjects for this class.');
    } finally {
      setBulkSubjectsLoading(false);
    }
  };

  const toggleBulkAssignment = (subjectId: number) => {
    if (!bulkClassId) return;
    setBulkAssignments((previous) => {
      const exists = previous.some(
        (assignment) => assignment.class_id === bulkClassId && assignment.subject_id === subjectId
      );
      return exists
        ? previous.filter(
            (assignment) => !(assignment.class_id === bulkClassId && assignment.subject_id === subjectId)
          )
        : [...previous, { class_id: bulkClassId, subject_id: subjectId }];
    });
  };

  const handleBulkSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!bulkTeacherId || !bulkYearId || bulkAssignments.length === 0) {
      setBulkError('Choose a teacher, academic year, and at least one class-subject pair.');
      return;
    }
    setBulkSubmitting(true);
    setBulkError(null);
    try {
      const response = await allocationsApi.bulkAssignTeacher({
        teacher_id: Number(bulkTeacherId),
        academic_year_id: Number(bulkYearId),
        assignments: bulkAssignments.map(({ class_id, subject_id }) => ({ class_id, subject_id })),
      });
      setSuccessMessage(
        response.errors.length > 0
          ? `${response.message} ${response.errors.join(' ')}`
          : response.message
      );
      setIsBulkModalOpen(false);
      await loadData();
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : 'Bulk assignment failed.');
    } finally {
      setBulkSubmitting(false);
    }
  };

  const openEditModal = (tsa: TeacherAssignment) => {
    setEditingAssignment(tsa);
    setEditTeacherId(tsa.teacher_id);
    setEditActive(tsa.is_active);
    setEditError(null);
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAssignment || !editTeacherId) return;

    setEditSubmitting(true);
    setEditError(null);
    try {
      const res = await allocationsApi.updateTeacherAssignment(editingAssignment.id, {
        teacher_id: Number(editTeacherId),
        is_active: editActive,
      });
      setSuccessMessage(res.message);
      setIsEditModalOpen(false);
      loadData();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update assignment.');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const res = await allocationsApi.deleteTeacherAssignment(deleteTarget.id);
      setSuccessMessage(res.message);
      setDeleteTarget(null);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete assignment.');
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  const columns: Column<TeacherAssignment>[] = [
    {
      id: 'teacher_info',
      header: 'Teacher / Staff ID',
      sortable: true,
      accessor: (row) => (
        <div>
          <div className="core-type--weight-bold core-text--dark">{row.teacher_name}</div>
          <code className="core-type--small core-text--muted">{row.staff_id}</code>
        </div>
      ),
    },
    {
      id: 'subject_info',
      header: 'Subject & Code',
      sortable: true,
      accessor: (row) => (
        <div>
          <span className="core-type--weight-semibold core-text--dark">{row.subject_name}</span>{' '}
          <code className="core-type--small core-text--primary">{row.subject_code}</code>
        </div>
      ),
    },
    {
      id: 'class_info',
      header: 'Assigned Class & Session',
      sortable: true,
      accessor: (row) => (
        <div>
          <span className="core-badge core-surface--primary-subtle core-text--primary core-border core-border--primary-subtle core-space--margin-end-1">
            <AppIcon name="building" className="core-space--margin-end-1" />
            {row.class_name}
          </span>
          {row.academic_year_name && (
            <span className="core-type--small core-text--secondary">({row.academic_year_name})</span>
          )}
        </div>
      ),
    },
    {
      id: 'reassigned_info',
      header: 'Assignment History',
      accessor: (row) => (
        <div className="core-type--small">
          {row.previous_teacher_name ? (
            <span className="core-text--secondary" title={`Reassigned from ${row.previous_teacher_name}`}>
              <AppIcon name="refresh" className="core-text--warning core-space--margin-end-1" />
              Reassigned from <strong>{row.previous_teacher_name}</strong>
            </span>
          ) : (
            <span className="core-text--muted">Initial assignment</span>
          )}
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
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
      align: 'right',
      accessor: (row) => (
        <div className="core-display-flex core-layout--justify-end core-layout--gap-1">
          <Button
            variant="outline-primary"
            size="sm"
            onClick={() => openEditModal(row)}
            title="Reassign Teacher or Change Status"
          >
            <AppIcon name="pencil" className="core-space--margin-end-1" />
            Reassign
          </Button>
          <Button
            variant="outline-danger"
            size="sm"
            onClick={() => setDeleteTarget(row)}
            title="Delete Assignment"
          >
            <AppIcon name="trash" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="core-container core-space--padding-y-4">
      {/* Header */}
      <div className="core-display-flex core-layout--column core-layout--md-row core-layout--justify-between core-layout--align-md-center core-layout--gap-3 core-space--margin-bottom-4">
        <div>
          <div className="core-display-flex core-layout--align-center core-layout--gap-2">
            <h1 className="core-type--heading-3 core-type--weight-bold core-space--margin-bottom-0 core-text--dark">Teacher Subject Assignments</h1>
            <span className="core-badge core-surface--primary-subtle core-text--primary core-border core-border--primary-subtle">
              {assignments.length} Records
            </span>
          </div>
          <p className="core-text--muted core-type--small core-space--margin-bottom-0 core-space--margin-top-1">
            Allocate teachers to subjects and class cohorts, manage workload distributions, and track reassignment history.
          </p>
        </div>

        <div className="core-display-flex core-layout--align-center core-layout--gap-2">
          <Button variant="primary" size="sm" onClick={openSingleModal}>
            <AppIcon name="circlePlus" className="core-space--margin-end-1" />
            Assign Teacher
          </Button>
          <Button variant="outline-primary" size="sm" onClick={openBulkModal}>
            <AppIcon name="listChecks" className="core-space--margin-end-1" />
            Bulk Assign
          </Button>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <Alert
          variant="success"
          dismissible
          onDismiss={() => setSuccessMessage(null)}
          className="core-space--margin-bottom-4"
        >
          {successMessage}
        </Alert>
      )}

      {error && (
        <Alert
          variant="danger"
          dismissible
          onDismiss={() => setError(null)}
          className="core-space--margin-bottom-4"
        >
          {error}
        </Alert>
      )}

      {/* Filter Toolbar */}
      <div className="core-card core-shadow--sm core-border--none core-space--margin-bottom-4">
        <div className="core-card__body core-space--padding-3 core-display-flex core-layout--wrap core-layout--align-center core-layout--justify-between core-layout--gap-3">
          <div className="core-display-flex core-layout--align-center core-layout--gap-3 core-layout--wrap">
            {/* Academic Year Filter */}
            <div className="core-display-flex core-layout--align-center core-layout--gap-2">
              <label htmlFor="filter-assign-year" className="core-type--small core-type--weight-semibold core-text--secondary core-space--margin-bottom-0">
                Year:
              </label>
              <select
                id="filter-assign-year"
                className="core-field__select core-field__select--sm"
                style={{ width: 'auto' }}
                value={selectedYearId}
                onChange={(e) =>
                  setSelectedYearId(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
              >
                <option value="all">All Sessions</option>
                {lookups?.academic_years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name} {y.is_current ? '(Current)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Teacher Filter */}
            <div className="core-display-flex core-layout--align-center core-layout--gap-2">
              <label htmlFor="filter-assign-teacher" className="core-type--small core-type--weight-semibold core-text--secondary core-space--margin-bottom-0">
                Teacher:
              </label>
              <select
                id="filter-assign-teacher"
                className="core-field__select core-field__select--sm"
                style={{ width: 'auto' }}
                value={selectedTeacherId}
                onChange={(e) =>
                  setSelectedTeacherId(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
              >
                <option value="all">All Faculty</option>
                {lookups?.teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name} ({t.staff_id})
                  </option>
                ))}
              </select>
            </div>

            {/* Class Filter */}
            <div className="core-display-flex core-layout--align-center core-layout--gap-2">
              <label htmlFor="filter-assign-class" className="core-type--small core-type--weight-semibold core-text--secondary core-space--margin-bottom-0">
                Class:
              </label>
              <select
                id="filter-assign-class"
                className="core-field__select core-field__select--sm"
                style={{ width: 'auto' }}
                value={selectedClassId}
                onChange={(e) =>
                  setSelectedClassId(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
              >
                <option value="all">All Classes</option>
                {lookups?.classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div className="core-display-flex core-layout--align-center core-layout--gap-2">
              <span className="core-type--small core-type--weight-semibold core-text--secondary">Status:</span>
              <div className="core-button-group core-button-group--sm" role="group">
                <button
                  type="button"
                  className={`core-button ${activeFilter === 'true' ? 'core-button--primary' : 'core-button--outline-secondary'}`}
                  onClick={() => setActiveFilter('true')}
                >
                  Active Only
                </button>
                <button
                  type="button"
                  className={`core-button ${activeFilter === 'false' ? 'core-button--primary' : 'core-button--outline-secondary'}`}
                  onClick={() => setActiveFilter('false')}
                >
                  Inactive
                </button>
                <button
                  type="button"
                  className={`core-button ${activeFilter === 'all' ? 'core-button--primary' : 'core-button--outline-secondary'}`}
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
            <AppIcon name="refresh" className="core-space--margin-end-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Assignments Table */}
      <div className="core-card core-shadow--sm core-border--none">
        <div className="core-card__body core-space--padding-0">
          <DataTable
            data={assignments}
            columns={columns}
            keyExtractor={(row) => row.id}
            loading={loading}
            emptyTitle="No teacher subject assignments found."
            searchPlaceholder="Search assignments by teacher, subject, or class..."
          />
        </div>
      </div>

      <SideDrawer
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        title="Bulk Assign Teacher"
        closeDisabled={bulkSubmitting}
        footer={
          <div className="side-drawer__actions">
            <span className="allocation-bulk__selection-count">{bulkAssignments.length} class-subject pairs selected</span>
            <div className="core-display-flex core-layout--justify-end core-layout--gap-2">
              <Button variant="secondary" size="sm" onClick={() => setIsBulkModalOpen(false)} disabled={bulkSubmitting}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={handleBulkSubmit} loading={bulkSubmitting} disabled={bulkAssignments.length === 0}>Assign selected</Button>
            </div>
          </div>
        }
      >
        <form className="allocation-bulk" onSubmit={handleBulkSubmit}>
          {bulkError && <Alert variant="danger" className="allocation-bulk__error">{bulkError}</Alert>}
          <div className="allocation-bulk__context">
            <label className="core-field">
              <span className="core-field__label">Teacher *</span>
              <select className="core-select" value={bulkTeacherId} onChange={(event) => setBulkTeacherId(Number(event.target.value))} required>
                <option value="">Choose teacher</option>
                {lookups?.teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.full_name} ({teacher.staff_id})</option>)}
              </select>
            </label>
            <label className="core-field">
              <span className="core-field__label">Academic year *</span>
              <select
                className="core-select"
                value={bulkYearId}
                onChange={(event) => {
                  setBulkYearId(Number(event.target.value));
                  setBulkAssignments([]);
                  setBulkClassId('');
                  setBulkAvailableSubjects([]);
                }}
                required
              >
                <option value="">Choose academic year</option>
                {lookups?.academic_years.map((year) => <option key={year.id} value={year.id}>{year.name}{year.is_current ? ' (Current)' : ''}</option>)}
              </select>
            </label>
          </div>
          <label className="core-field">
            <span className="core-field__label">Class</span>
            <select className="core-select" value={bulkClassId} onChange={(event) => void loadBulkClassSubjects(event.target.value ? Number(event.target.value) : '')} disabled={!bulkYearId}>
              <option value="">Choose a class to load its subjects</option>
              {lookups?.classes.map((classItem) => <option key={classItem.id} value={classItem.id}>{classItem.name}</option>)}
            </select>
          </label>
          <section className="allocation-bulk__subjects" aria-label="Class subjects">
            <h3>{bulkClassId ? 'Subjects assigned to this class' : 'Select a class to view its subjects'}</h3>
            {bulkSubjectsLoading ? (
              <p>Loading class subjects...</p>
            ) : bulkAvailableSubjects.length > 0 ? (
              bulkAvailableSubjects.map((subject) => {
                const checked = bulkAssignments.some((assignment) => assignment.class_id === bulkClassId && assignment.subject_id === subject.id);
                return (
                  <label className="allocation-bulk__subject" key={subject.id}>
                    <input type="checkbox" checked={checked} onChange={() => toggleBulkAssignment(subject.id)} />
                    <span><strong>{subject.subject_name}</strong><small>{subject.subject_code}</small></span>
                  </label>
                );
              })
            ) : (
              <p>{bulkClassId ? 'No subjects are mapped to this class for the selected year.' : 'Subjects are loaded per class so each assignment is matched to its curriculum.'}</p>
            )}
          </section>
        </form>
      </SideDrawer>

      <SideDrawer
        isOpen={isSingleModalOpen}
        onClose={() => setIsSingleModalOpen(false)}
        title="Assign Teacher to Subject & Class"
        closeDisabled={singleSubmitting}
        footer={
          <div className="core-display-flex core-layout--justify-end core-layout--gap-2 core-size--width-full">
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
              disabled={!singleSubjectId}
            >
              Confirm Assignment
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSingleSubmit}>
          {singleError && (
            <Alert variant="danger" className="core-space--margin-bottom-3">
              {singleError}
            </Alert>
          )}

          <div className="core-space--margin-bottom-3">
            <label htmlFor="assign-teacher" className="core-field__label core-type--small core-type--weight-semibold">
              Select Teacher <span className="core-text--danger">*</span>
            </label>
            <select
              id="assign-teacher"
              className="core-field__select"
              value={singleTeacherId}
              onChange={(e) => setSingleTeacherId(Number(e.target.value))}
              required
            >
              <option value="">-- Choose Faculty Member --</option>
              {lookups?.teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name} ({t.staff_id})
                </option>
              ))}
            </select>
          </div>

          <div className="core-grid core-grid--gap-3 core-space--margin-bottom-3">
            <div className="core-grid__span-sm-6">
              <label htmlFor="assign-year" className="core-field__label core-type--small core-type--weight-semibold">
                Academic Session <span className="core-text--danger">*</span>
              </label>
              <select
                id="assign-year"
                className="core-field__select"
                value={singleYearId}
                onChange={(e) => setSingleYearId(Number(e.target.value))}
                required
              >
                <option value="">-- Choose Academic Year --</option>
                {lookups?.academic_years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name} {y.is_current ? '(Current)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="core-grid__span-sm-6">
              <label htmlFor="assign-class" className="core-field__label core-type--small core-type--weight-semibold">
                Target Class <span className="core-text--danger">*</span>
              </label>
              <select
                id="assign-class"
                className="core-field__select"
                value={singleClassId}
                onChange={(e) => setSingleClassId(Number(e.target.value))}
                required
              >
                <option value="">-- Choose Class --</option>
                {lookups?.classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="core-space--margin-bottom-3">
            <label htmlFor="assign-subject" className="core-field__label core-type--small core-type--weight-semibold">
              Subject to Teach in Class <span className="core-text--danger">*</span>
            </label>
            <select
              id="assign-subject"
              className="core-field__select"
              value={singleSubjectId}
              onChange={(e) => setSingleSubjectId(Number(e.target.value))}
              disabled={!singleClassId || subjectsLoading}
              required
            >
              <option value="">
                {!singleClassId
                  ? 'First select a class above...'
                  : subjectsLoading
                  ? 'Loading class subjects...'
                  : availableSubjects.length === 0
                  ? 'No subjects mapped to this class yet'
                  : '-- Choose Subject --'}
              </option>
              {availableSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.subject_code} - {s.subject_name}
                </option>
              ))}
            </select>
            {singleClassId && !subjectsLoading && availableSubjects.length === 0 && (
              <div className="core-field__helper core-text--warning">
                This class does not have curriculum subjects mapped for this session yet. Go to Classes &rarr; Details & Subjects to add subjects.
              </div>
            )}
          </div>
        </form>
      </SideDrawer>

      <SideDrawer
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={`Reassign: ${editingAssignment?.subject_name} (${editingAssignment?.class_name})`}
        closeDisabled={editSubmitting}
        footer={
          <div className="core-display-flex core-layout--justify-end core-layout--gap-2 core-size--width-full">
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
            <Alert variant="danger" className="core-space--margin-bottom-3">
              {editError}
            </Alert>
          )}

          <div className="core-space--margin-bottom-3">
            <label htmlFor="edit-teacher" className="core-field__label core-type--small core-type--weight-semibold">
              Assigned Teacher <span className="core-text--danger">*</span>
            </label>
            <select
              id="edit-teacher"
              className="core-field__select"
              value={editTeacherId}
              onChange={(e) => setEditTeacherId(Number(e.target.value))}
              required
            >
              {lookups?.teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name} ({t.staff_id})
                </option>
              ))}
            </select>
            <div className="core-field__helper">
              Reassigning automatically tracks the previous teacher in historical audit logs.
            </div>
          </div>

          <div className="core-field__check core-field__switch core-space--margin-bottom-2">
            <input
              id="edit-active"
              className="core-field__check-input"
              type="checkbox"
              role="switch"
              checked={editActive}
              onChange={(e) => setEditActive(e.target.checked)}
            />
            <label className="core-field__check-label core-type--small core-type--weight-semibold" htmlFor="edit-active">
              Active Assignment Status
            </label>
          </div>
        </form>
      </SideDrawer>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Teacher Assignment"
        message={
          <div>
            Delete assignment of <strong>{deleteTarget?.teacher_name}</strong> for{' '}
            <strong>{deleteTarget?.subject_name}</strong> in{' '}
            <strong>{deleteTarget?.class_name}</strong>?
            <p className="core-text--muted core-type--small core-space--margin-top-2 core-space--margin-bottom-0">
              The teacher will lose grading and assessment rights for this subject cohort.
            </p>
          </div>
        }
        confirmLabel="Delete Assignment"
        confirmVariant="danger"
        loading={deleteLoading}
      />
    </div>
  );
};
