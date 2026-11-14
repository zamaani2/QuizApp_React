import { AppIcon } from '../../components/common/AppIcon';
import React, { useEffect, useState, useCallback } from 'react';
import {
  archiveStudent,
  bulkArchiveStudents,
  createStudent,
  fetchSuperadminSchools,
  fetchStudents,
  restoreStudent,
  updateStudent,
} from '../../api/admin';
import type { StudentAdminInput, StudentListItem, StructureLookups, SuperadminSchool } from '../../types';
import { academicApi } from '../../api/academic';
import { useAuth } from '../../auth/AuthContext';
import { DataTable, type Column } from '../../components/table/DataTable';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { StudentImportDialog } from './StudentImportDialog';
import { downloadAuthenticatedFile, saveDownloadedFile } from '../../api/client';
import './AdminDirectory.css';

const emptyStudentForm = (): StudentAdminInput => ({
  full_name: '',
  date_of_birth: '',
  gender: '',
  parent_contact: '',
  admission_date: '',
  email: '',
  form: '',
  learning_area: '',
});

export const StudentList: React.FC = () => {
  const { data: authData } = useAuth();
  const isSuperadmin = Boolean(authData?.user.is_superadmin);
  const [students, setStudents] = useState<StudentListItem[]>([]);
  const [schools, setSchools] = useState<SuperadminSchool[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived' | 'all'>('active');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | 'all'>('all');
  const [formFilterId, setFormFilterId] = useState<number | 'all'>('all');
  const [learningAreaFilterId, setLearningAreaFilterId] = useState<number | 'all'>('all');
  const [genderFilter, setGenderFilter] = useState('all');
  const [classFilterId, setClassFilterId] = useState<number | 'all'>('all');
  const [lookups, setLookups] = useState<StructureLookups | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<StudentListItem | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<StudentListItem | null>(null);
  const [formData, setFormData] = useState<StudentAdminInput>(emptyStudentForm);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<StudentListItem | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<StudentListItem | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkAction, setBulkAction] = useState<'archive' | 'restore'>('archive');
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState<'csv' | 'xlsx' | null>(null);

  useEffect(() => {
    if (!isSuperadmin) return;
    void fetchSuperadminSchools()
      .then((response) => setSchools(response.results.filter((school) => school.is_active)))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load schools.'));
  }, [isSuperadmin]);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchStudents({
        status: statusFilter,
        school_id: selectedSchoolId === 'all' ? undefined : selectedSchoolId,
        form_id: formFilterId === 'all' ? undefined : formFilterId,
        learning_area_id: learningAreaFilterId === 'all' ? undefined : learningAreaFilterId,
        gender: genderFilter === 'all' ? undefined : genderFilter,
        class_id: classFilterId === 'all' ? undefined : classFilterId,
        page,
      });
      setStudents(response.results);
      setTotalCount(response.count);
      setTotalPages(response.total_pages || 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load students directory.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, selectedSchoolId, formFilterId, learningAreaFilterId, genderFilter, classFilterId, page]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  useEffect(() => {
    setSelectedStudentIds([]);
    setPage(1);
  }, [statusFilter, selectedSchoolId, formFilterId, learningAreaFilterId, genderFilter, classFilterId]);

  const loadLookups = async (targetSchoolId?: number) => {
    try {
      setLookups(await academicApi.getStructureLookups({
        school_id: targetSchoolId ?? (selectedSchoolId === 'all' ? undefined : selectedSchoolId),
      }));
      return true;
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not load student form options.');
      return false;
    }
  };

  useEffect(() => {
    if (isSuperadmin && selectedSchoolId === 'all') {
      setLookups(null);
      return;
    }
    const schoolId = selectedSchoolId === 'all' ? undefined : selectedSchoolId;
    void academicApi.getStructureLookups({ school_id: schoolId })
      .then(setLookups)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load student filters.'));
  }, [isSuperadmin, selectedSchoolId]);

  const openCreateModal = async () => {
    setEditingStudent(null);
    setFormData(emptyStudentForm());
    setFormError(null);
    if (isSuperadmin && selectedSchoolId === 'all') {
      setFormError('Choose a school before adding a student.');
      return;
    }
    if (!(await loadLookups())) return;
    if (isSuperadmin && selectedSchoolId !== 'all') {
      setFormData((previous) => ({ ...previous, school_id: selectedSchoolId }));
    }
    setIsModalOpen(true);
  };

  const openImportDialog = async () => {
    if (isSuperadmin && selectedSchoolId === 'all') {
      setError('Choose a school before importing students.');
      return;
    }
    if (!(await loadLookups())) return;
    setImportDialogOpen(true);
  };

  const openEditModal = async (student: StudentListItem) => {
    if (isSuperadmin && !student.school_id) {
      setError('Student school information is unavailable; edit is disabled for safety.');
      return;
    }
    const targetSchoolId = student.school_id;
    if (isSuperadmin && targetSchoolId) setSelectedSchoolId(targetSchoolId);
    setEditingStudent(student);
    setFormData({
      full_name: student.full_name,
      date_of_birth: student.date_of_birth || '',
      gender: student.gender,
      parent_contact: student.parent_contact || '',
      admission_date: student.admission_date || '',
      email: student.email || '',
      form: student.form_id || '',
      learning_area: student.learning_area_id || '',
      school_id: isSuperadmin ? (targetSchoolId ?? undefined) : undefined,
    });
    setFormError(null);
    if (!(await loadLookups(targetSchoolId ?? undefined))) return;
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormSubmitting(true);
    setFormError(null);
    try {
      const response = editingStudent
        ? await updateStudent(editingStudent.id, formData)
        : await createStudent(formData);
      setSuccessMessage(response.message);
      setIsModalOpen(false);
      await loadStudents();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save student.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleArchive = async () => {
    if (!archiveTarget) return;
    setArchiveLoading(true);
    try {
      const response = await archiveStudent(archiveTarget.id);
      setSuccessMessage(response.message);
      setArchiveTarget(null);
      await loadStudents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not archive student.');
      setArchiveTarget(null);
    } finally {
      setArchiveLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!restoreTarget) return;
    setArchiveLoading(true);
    try {
      const response = await restoreStudent(restoreTarget.id);
      setSuccessMessage(response.message);
      setRestoreTarget(null);
      await loadStudents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not restore student.');
      setRestoreTarget(null);
    } finally {
      setArchiveLoading(false);
    }
  };

  const toggleStudentSelection = (studentId: number) => {
    setSelectedStudentIds((previous) =>
      previous.includes(studentId)
        ? previous.filter((id) => id !== studentId)
        : [...previous, studentId]
    );
  };

  const handleBulkArchive = async () => {
    if (selectedStudentIds.length === 0) return;
    const schoolId = selectedSchoolId === 'all' ? undefined : selectedSchoolId;
    if (isSuperadmin && !schoolId) {
      setError('Choose one school before bulk archiving or restoring students.');
      setBulkDialogOpen(false);
      return;
    }
    setBulkLoading(true);
    try {
      const response = await bulkArchiveStudents(selectedStudentIds, bulkAction, schoolId);
      setSuccessMessage(response.message);
      setSelectedStudentIds([]);
      setBulkDialogOpen(false);
      await loadStudents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update selected students.');
      setBulkDialogOpen(false);
    } finally {
      setBulkLoading(false);
    }
  };

  const exportHref = (format: 'csv' | 'xlsx') => {
    const params = new URLSearchParams({ status: statusFilter });
    if (isSuperadmin && selectedSchoolId !== 'all') params.set('school_id', String(selectedSchoolId));
    if (formFilterId !== 'all') params.set('form', String(formFilterId));
    if (learningAreaFilterId !== 'all') params.set('learning_area', String(learningAreaFilterId));
    if (genderFilter !== 'all') params.set('gender', genderFilter);
    if (classFilterId !== 'all') params.set('class', String(classFilterId));
    return `/students/export/${format}/?${params.toString()}`;
  };

  const downloadExport = async (format: 'csv' | 'xlsx') => {
    setExportLoading(format);
    setError(null);
    try {
      const file = await downloadAuthenticatedFile(exportHref(format));
      saveDownloadedFile(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not export students as ${format.toUpperCase()}.`);
    } finally {
      setExportLoading(null);
    }
  };

  const columns: Column<StudentListItem>[] = [
    {
      id: 'selection',
      header: 'Select',
      align: 'center',
      accessor: (row) => (
        <input
          type="checkbox"
          aria-label={`Select ${row.full_name}`}
          disabled={isSuperadmin && selectedSchoolId === 'all'}
          checked={selectedStudentIds.includes(row.id)}
          onChange={() => toggleStudentSelection(row.id)}
        />
      ),
    },
    {
      id: 'admission_number',
      header: 'Admission No',
      sortable: true,
      accessor: (row) => <code className="directory-code">{row.admission_number}</code>,
    },
    {
      id: 'full_name',
      header: 'Full Name',
      sortable: true,
      accessor: (row) => <span className="directory-name">{row.full_name}</span>,
    },
    {
      id: 'gender',
      header: 'Gender',
      sortable: true,
      align: 'center',
      accessor: (row) => (
        <span className="directory-tag directory-tag--neutral">
          {row.gender === 'M' ? 'Male' : row.gender === 'F' ? 'Female' : row.gender || '—'}
        </span>
      ),
    },
    {
      id: 'class_info',
      header: 'Class / Form',
      sortable: true,
      accessor: (row) => (
        <div>
          <div>{row.class_name || 'Unassigned'}</div>
          {row.form_name && <small className="directory-secondary">{row.form_name}</small>}
        </div>
      ),
    },
    {
      id: 'learning_area',
      header: 'Program / Area',
      sortable: true,
      accessor: (row) => (
        <span className="directory-secondary">{row.learning_area || '—'}</span>
      ),
    },
    {
      id: 'contact',
      header: 'Parent Contact',
      accessor: (row) => (
        <div className="directory-cell-stack">
          <div>{row.parent_contact || '—'}</div>
          {row.email && <div className="directory-secondary">{row.email}</div>}
        </div>
      ),
    },
    {
      id: 'is_active',
      header: 'Status',
      sortable: true,
      align: 'center',
      accessor: (row) => (
        <span className={`directory-tag ${row.is_active ? 'directory-tag--active' : 'directory-tag--inactive'}`}>
          {row.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      accessor: (row) => (
        <div className="directory-row-actions">
          <Button variant="outline-secondary" size="sm" onClick={() => setDetailsTarget(row)} title="View student details" aria-label={`View ${row.full_name}`}>
            <AppIcon name="eye" aria-hidden="true" />
          </Button>
          <Button variant="outline-primary" size="sm" onClick={() => void openEditModal(row)} title="Edit student" aria-label={`Edit ${row.full_name}`}>
            <AppIcon name="pencil" aria-hidden="true" />
          </Button>
          {row.is_active ? (
            <Button variant="outline-danger" size="sm" onClick={() => setArchiveTarget(row)} title="Archive student" aria-label={`Archive ${row.full_name}`}>
              <AppIcon name="archive" aria-hidden="true" />
            </Button>
          ) : (
            <Button variant="outline-secondary" size="sm" onClick={() => setRestoreTarget(row)} title="Restore student" aria-label={`Restore ${row.full_name}`}>
              <AppIcon name="rotateCounterclockwise" aria-hidden="true" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="directory-page" data-testid="admin-student-list">
      <header className="directory-page__heading">
        <div>
          <p className="directory-page__eyebrow">PEOPLE</p>
          <h2>Students Directory</h2>
          <p>Enrolled student records scoped to your institution</p>
        </div>
        <div className="directory-page__actions">
          {isSuperadmin && (
            <label className="directory-page__scope">
              <span>School</span>
              <select
                className="core-select"
                value={selectedSchoolId}
                onChange={(event) => setSelectedSchoolId(event.target.value === 'all' ? 'all' : Number(event.target.value))}
              >
                <option value="all">All schools</option>
                {schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
              </select>
            </label>
          )}
          <button className="directory-page__action" type="button" onClick={loadStudents} disabled={loading}>
            <AppIcon name="rotateClockwise" aria-hidden="true" /> Refresh
          </button>
          {(!isSuperadmin || selectedSchoolId !== 'all') && (
            <>
              <Button variant="outline-secondary" size="sm" onClick={() => void downloadExport('csv')} loading={exportLoading === 'csv'} disabled={exportLoading !== null}>Export CSV</Button>
              <Button variant="outline-secondary" size="sm" onClick={() => void downloadExport('xlsx')} loading={exportLoading === 'xlsx'} disabled={exportLoading !== null}>Export XLSX</Button>
              <Button variant="outline-secondary" size="sm" onClick={() => void openImportDialog()}>
                <AppIcon name="upload" aria-hidden="true" /> Import students
              </Button>
            </>
          )}
          {selectedStudentIds.length > 0 && (!isSuperadmin || selectedSchoolId !== 'all') && (
            <Button
              variant="outline-danger"
              size="sm"
              onClick={() => {
                setBulkAction(statusFilter === 'archived' ? 'restore' : 'archive');
                setBulkDialogOpen(true);
              }}
            >
              {statusFilter === 'archived' ? 'Restore' : statusFilter === 'all' ? 'Manage' : 'Archive'} selected ({selectedStudentIds.length})
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={() => void openCreateModal()} disabled={isSuperadmin && selectedSchoolId === 'all'}>
            <AppIcon name="userRoundPlus" aria-hidden="true" /> New Student
          </Button>
        </div>
      </header>

      {successMessage && <Alert variant="success" dismissible onDismiss={() => setSuccessMessage(null)}>{successMessage}</Alert>}
      {error && (
        <Alert variant="danger" dismissible onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      <div className="directory-controls">
        <div className="directory-segmented" role="group" aria-label="Filter students by status">
          <button type="button" className={statusFilter === 'active' ? 'is-selected' : ''} aria-pressed={statusFilter === 'active'} onClick={() => setStatusFilter('active')}>Active</button>
          <button type="button" className={statusFilter === 'archived' ? 'is-selected' : ''} aria-pressed={statusFilter === 'archived'} onClick={() => setStatusFilter('archived')}>Archived</button>
          <button type="button" className={statusFilter === 'all' ? 'is-selected' : ''} aria-pressed={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>All</button>
        </div>
        <span className="directory-record-count">{totalCount} {statusFilter} records</span>
      </div>

      <div className="directory-filters" aria-label="Student filters">
        <label><span>Form</span><select className="core-select" value={formFilterId} onChange={(event) => setFormFilterId(event.target.value === 'all' ? 'all' : Number(event.target.value))}><option value="all">All forms</option>{lookups?.forms?.map((form) => <option key={form.id} value={form.id}>{form.name}</option>)}</select></label>
        <label><span>Learning area</span><select className="core-select" value={learningAreaFilterId} onChange={(event) => setLearningAreaFilterId(event.target.value === 'all' ? 'all' : Number(event.target.value))}><option value="all">All areas</option>{lookups?.learning_areas?.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
        <label><span>Demographic</span><select className="core-select" value={genderFilter} onChange={(event) => setGenderFilter(event.target.value)}><option value="all">All</option><option value="F">Female only</option><option value="M">Male only</option></select></label>
        <label><span>Class</span><select className="core-select" value={classFilterId} onChange={(event) => setClassFilterId(event.target.value === 'all' ? 'all' : Number(event.target.value))}><option value="all">All classes</option>{lookups?.classes?.map((classItem) => <option key={classItem.id} value={classItem.id}>{classItem.name}</option>)}</select></label>
      </div>

      <DataTable<StudentListItem>
        className="directory-table"
        columns={columns}
        data={students}
        keyExtractor={(row) => row.id}
        loading={loading}
        defaultPageSize={50}
        searchable={true}
        searchPlaceholder="Search by student name, admission number, or contact..."
        emptyTitle="No Students Found"
        emptyDescription="There are currently no students registered in this school."
      />

      <nav className="directory-server-pagination" aria-label="Student directory pages">
        <span>Page {page} of {totalPages} · {totalCount} students</span>
        <div>
          <Button variant="outline-secondary" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button>
          <Button variant="outline-secondary" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Next</Button>
        </div>
      </nav>

      <Modal
        isOpen={Boolean(detailsTarget)}
        onClose={() => setDetailsTarget(null)}
        title={detailsTarget?.full_name || 'Student details'}
        footer={<div className="core-modal__actions"><Button variant="secondary" size="sm" onClick={() => setDetailsTarget(null)}>Close</Button></div>}
      >
        {detailsTarget && (
          <dl className="directory-student-details">
            <div><dt>Admission number</dt><dd>{detailsTarget.admission_number}</dd></div>
            <div><dt>Status</dt><dd>{detailsTarget.is_active ? 'Active' : 'Archived'}</dd></div>
            <div><dt>Date of birth</dt><dd>{detailsTarget.date_of_birth || '—'}</dd></div>
            <div><dt>Gender</dt><dd>{detailsTarget.gender === 'M' ? 'Male' : detailsTarget.gender === 'F' ? 'Female' : '—'}</dd></div>
            <div><dt>Admission date</dt><dd>{detailsTarget.admission_date || '—'}</dd></div>
            <div><dt>Parent contact</dt><dd>{detailsTarget.parent_contact || '—'}</dd></div>
            <div><dt>Email</dt><dd>{detailsTarget.email || '—'}</dd></div>
            <div><dt>Current class</dt><dd>{detailsTarget.class_name || 'Unassigned'}</dd></div>
            <div><dt>Form</dt><dd>{detailsTarget.form_name || '—'}</dd></div>
            <div><dt>Learning area</dt><dd>{detailsTarget.learning_area || '—'}</dd></div>
            {isSuperadmin && <div><dt>School</dt><dd>{detailsTarget.school_name || '—'}</dd></div>}
          </dl>
        )}
      </Modal>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingStudent ? `Edit ${editingStudent.full_name}` : 'Register Student'}
        footer={<div className="core-modal__actions"><Button variant="secondary" size="sm" onClick={() => setIsModalOpen(false)} disabled={formSubmitting}>Cancel</Button><Button variant="primary" size="sm" type="submit" form="student-admin-form" loading={formSubmitting}>{editingStudent ? 'Save changes' : 'Create student'}</Button></div>}
      >
        <form id="student-admin-form" className="directory-form" onSubmit={handleFormSubmit}>
          {formError && <Alert variant="danger" className="directory-form__error">{formError}</Alert>}
          <label className="core-field"><span className="core-field__label">Full name *</span><input className="core-input" required value={formData.full_name} onChange={(event) => setFormData({ ...formData, full_name: event.target.value })} /></label>
          <div className="directory-form__grid">
            <label className="core-field"><span className="core-field__label">Date of birth *</span><input className="core-input" type="date" required value={formData.date_of_birth} onChange={(event) => setFormData({ ...formData, date_of_birth: event.target.value })} /></label>
            <label className="core-field"><span className="core-field__label">Admission date *</span><input className="core-input" type="date" required value={formData.admission_date} onChange={(event) => setFormData({ ...formData, admission_date: event.target.value })} /></label>
            <label className="core-field"><span className="core-field__label">Gender *</span><select className="core-select" required value={formData.gender} onChange={(event) => setFormData({ ...formData, gender: event.target.value })}><option value="">Select gender</option><option value="F">Female</option><option value="M">Male</option></select></label>
            <label className="core-field"><span className="core-field__label">Parent contact *</span><input className="core-input" required value={formData.parent_contact} onChange={(event) => setFormData({ ...formData, parent_contact: event.target.value })} /></label>
            <label className="core-field"><span className="core-field__label">Email</span><input className="core-input" type="email" value={formData.email} onChange={(event) => setFormData({ ...formData, email: event.target.value })} /></label>
            <label className="core-field"><span className="core-field__label">Form</span><select className="core-select" value={formData.form} onChange={(event) => setFormData({ ...formData, form: event.target.value ? Number(event.target.value) : '' })}><option value="">No form</option>{lookups?.forms?.map((form) => <option key={form.id} value={form.id}>{form.name}</option>)}</select></label>
            <label className="core-field"><span className="core-field__label">Learning area</span><select className="core-select" value={formData.learning_area} onChange={(event) => setFormData({ ...formData, learning_area: event.target.value ? Number(event.target.value) : '' })}><option value="">No learning area</option>{lookups?.learning_areas?.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
          </div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={Boolean(archiveTarget)} onClose={() => setArchiveTarget(null)} onConfirm={handleArchive} title="Archive student" message={`Archive ${archiveTarget?.full_name}? Their profile and academic history will be retained.`} confirmLabel="Archive" loading={archiveLoading} />
      <ConfirmDialog isOpen={Boolean(restoreTarget)} onClose={() => setRestoreTarget(null)} onConfirm={handleRestore} title="Restore student" message={`Restore ${restoreTarget?.full_name} to the active student directory?`} confirmLabel="Restore" confirmVariant="primary" loading={archiveLoading} />
      <ConfirmDialog
        isOpen={bulkDialogOpen}
        onClose={() => setBulkDialogOpen(false)}
        onConfirm={handleBulkArchive}
        title={bulkAction === 'restore' ? 'Restore selected students' : 'Archive selected students'}
        message={
          <div>
            {statusFilter === 'all' && (
              <label className="core-field">
                <span className="core-field__label">Action</span>
                <select
                  className="core-select"
                  value={bulkAction}
                  onChange={(event) => setBulkAction(event.target.value as 'archive' | 'restore')}
                >
                  <option value="archive">Archive selected</option>
                  <option value="restore">Restore selected</option>
                </select>
              </label>
            )}
            <div className="core-space--margin-top-2">
              {bulkAction === 'restore' ? 'Restore' : 'Archive'} {selectedStudentIds.length} selected student profile(s)? Student history is retained.
            </div>
          </div>
        }
        confirmLabel={bulkAction === 'restore' ? 'Restore selected' : 'Archive selected'}
        confirmVariant={bulkAction === 'restore' ? 'primary' : 'danger'}
        loading={bulkLoading}
      />
      <StudentImportDialog
        isOpen={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        lookups={lookups}
        schoolId={selectedSchoolId === 'all' ? undefined : selectedSchoolId}
        onImported={(result) => {
          setSuccessMessage(result.message);
          void loadStudents();
        }}
      />
    </div>
  );
};
