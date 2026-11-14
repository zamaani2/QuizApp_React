import { AppIcon } from '../../components/common/AppIcon';
import React, { useEffect, useState, useCallback } from 'react';
import {
  archiveTeacher,
  bulkArchiveTeachers,
  createTeacher,
  fetchSuperadminSchools,
  fetchTeachers,
  restoreTeacher,
  updateTeacher,
} from '../../api/admin';
import type { StructureLookups, SuperadminSchool, TeacherAdminInput, TeacherListItem } from '../../types';
import type { TeacherImportResult } from '../../api/admin';
import { academicApi } from '../../api/academic';
import { DataTable, type Column } from '../../components/table/DataTable';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { TeacherImportDialog } from './TeacherImportDialog';
import { useAuth } from '../../auth/AuthContext';
import { downloadAuthenticatedFile, saveDownloadedFile } from '../../api/client';
import './AdminDirectory.css';

const emptyTeacherForm = (): TeacherAdminInput => ({
  full_name: '',
  gender: '',
  contact_number: '',
  email: '',
  department: '',
  school_id: '',
});

export const TeacherList: React.FC = () => {
  const { data: authData } = useAuth();
  const isSuperadmin = Boolean(authData?.user.is_superadmin);
  const [teachers, setTeachers] = useState<TeacherListItem[]>([]);
  const [schools, setSchools] = useState<SuperadminSchool[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | 'all'>('all');
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived'>('active');
  const [departmentFilter, setDepartmentFilter] = useState<number | 'all'>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [lookups, setLookups] = useState<StructureLookups | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<TeacherListItem | null>(null);
  const [formData, setFormData] = useState<TeacherAdminInput>(emptyTeacherForm);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<TeacherListItem | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<TeacherListItem | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<number[]>([]);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  const loadTeachers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchTeachers({
        is_active: statusFilter === 'active',
        school_id: selectedSchoolId === 'all' ? undefined : selectedSchoolId,
        department_id: departmentFilter === 'all' ? undefined : departmentFilter,
        page,
      });
      setTeachers(response.results);
      setTotalCount(response.count);
      setTotalPages(response.total_pages || 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load teachers directory.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, selectedSchoolId, departmentFilter, page]);

  useEffect(() => {
    loadTeachers();
  }, [loadTeachers]);

  useEffect(() => {
    if (!isSuperadmin) return;
    void fetchSuperadminSchools()
      .then((response) => setSchools(response.results.filter((school) => school.is_active)))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load schools.'));
  }, [isSuperadmin]);

  useEffect(() => {
    if (isSuperadmin && selectedSchoolId === 'all') {
      setLookups(null);
      return;
    }
    void academicApi.getStructureLookups({
      school_id: selectedSchoolId === 'all' ? undefined : selectedSchoolId,
    })
      .then(setLookups)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load teacher filters.'));
  }, [isSuperadmin, selectedSchoolId]);

  useEffect(() => {
    setPage(1);
    setSelectedTeacherIds([]);
  }, [statusFilter, selectedSchoolId, departmentFilter]);

  const loadLookups = async (targetSchoolId?: number) => {
    try {
      setLookups(await academicApi.getStructureLookups({ school_id: targetSchoolId }));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not load teacher form options.');
    }
  };

  const openCreateModal = async () => {
    setEditingTeacher(null);
    setFormData(emptyTeacherForm());
    setFormError(null);
    if (isSuperadmin && selectedSchoolId === 'all') {
      setFormError('Choose a school before adding a teacher.');
      return;
    }
    if (isSuperadmin && selectedSchoolId !== 'all') {
      setFormData((previous) => ({ ...previous, school_id: selectedSchoolId }));
    }
    await loadLookups(selectedSchoolId === 'all' ? undefined : selectedSchoolId);
    setIsModalOpen(true);
  };

  const openEditModal = async (teacher: TeacherListItem) => {
    setEditingTeacher(teacher);
    setFormData({
      full_name: teacher.full_name,
      gender: teacher.gender || '',
      contact_number: teacher.contact_number || '',
      email: teacher.email || '',
      department: teacher.department_id || '',
      school_id: teacher.school_id || '',
    });
    setFormError(null);
    if (isSuperadmin && teacher.school_id) setSelectedSchoolId(teacher.school_id);
    await loadLookups(teacher.school_id || undefined);
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormSubmitting(true);
    setFormError(null);
    try {
      const payload = {
        ...formData,
        ...(isSuperadmin && selectedSchoolId !== 'all' ? { school_id: selectedSchoolId } : {}),
      };
      const response = editingTeacher
        ? await updateTeacher(editingTeacher.id, payload)
        : await createTeacher(payload);
      setSuccessMessage(response.message);
      setIsModalOpen(false);
      await loadTeachers();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save teacher.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleArchive = async () => {
    if (!archiveTarget) return;
    setArchiveLoading(true);
    try {
      const response = await archiveTeacher(archiveTarget.id);
      setSuccessMessage(response.message);
      setArchiveTarget(null);
      await loadTeachers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not archive teacher.');
      setArchiveTarget(null);
    } finally {
      setArchiveLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!restoreTarget) return;
    setArchiveLoading(true);
    try {
      const response = await restoreTeacher(restoreTarget.id);
      setSuccessMessage(response.message);
      setRestoreTarget(null);
      await loadTeachers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not restore teacher.');
      setRestoreTarget(null);
    } finally {
      setArchiveLoading(false);
    }
  };

  const handleTeacherImport = async (result: TeacherImportResult) => {
    setSuccessMessage(result.message);
    if (result.errors.length) setError(result.errors.join('\n'));
    setImportDialogOpen(false);
    try {
      await loadTeachers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not refresh teachers after import.');
    }
  };

  const handleBulkArchive = async () => {
    if (!selectedTeacherIds.length) return;
    const schoolId = selectedSchoolId === 'all' ? undefined : selectedSchoolId;
    if (isSuperadmin && !schoolId) {
      setError('Choose one school before bulk archiving or restoring teachers.');
      setBulkDialogOpen(false);
      return;
    }
    setBulkLoading(true);
    try {
      const action = statusFilter === 'active' ? 'archive' : 'restore';
      const response = await bulkArchiveTeachers(selectedTeacherIds, action, schoolId);
      setSuccessMessage(response.message);
      setSelectedTeacherIds([]);
      setBulkDialogOpen(false);
      await loadTeachers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update selected teachers.');
      setBulkDialogOpen(false);
    } finally {
      setBulkLoading(false);
    }
  };

  const downloadExport = async () => {
    setExportLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ format: 'csv' });
      if (isSuperadmin && selectedSchoolId !== 'all') {
        params.set('school_id', String(selectedSchoolId));
      }
      const file = await downloadAuthenticatedFile(`/api/v1/teachers/export/?${params.toString()}`);
      saveDownloadedFile(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not export teachers.');
    } finally {
      setExportLoading(false);
    }
  };

  const columns: Column<TeacherListItem>[] = [
    {
      id: 'selection',
      header: 'Select',
      align: 'center',
      accessor: (row) => (
        <input
          type="checkbox"
          aria-label={`Select ${row.full_name}`}
          checked={selectedTeacherIds.includes(row.id)}
          onChange={() => setSelectedTeacherIds((previous) =>
            previous.includes(row.id)
              ? previous.filter((id) => id !== row.id)
              : [...previous, row.id]
          )}
        />
      ),
    },
    {
      id: 'staff_id',
      header: 'Staff ID',
      sortable: true,
      accessor: (row) => <code className="directory-code">{row.staff_id}</code>,
    },
    {
      id: 'full_name',
      header: 'Faculty Name',
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
      id: 'department',
      header: 'Department',
      sortable: true,
      accessor: (row) => (
        <span className="directory-tag directory-tag--department">
          {row.department_name || 'Unassigned'}
        </span>
      ),
    },
    {
      id: 'assigned_classes',
      header: 'Assigned Classes',
      sortable: true,
      align: 'center',
      accessor: (row) => (
        <span className="directory-tag directory-tag--classes">
          {row.assigned_classes_count} classes
        </span>
      ),
    },
    {
      id: 'contact',
      header: 'Contact Info',
      accessor: (row) => (
        <div className="directory-cell-stack">
          <div>{row.contact_number || '—'}</div>
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
          <Button variant="outline-primary" size="sm" onClick={() => void openEditModal(row)} title="Edit teacher" aria-label={`Edit ${row.full_name}`}>
            <AppIcon name="pencil" aria-hidden="true" />
          </Button>
          {row.is_active ? (
            <Button variant="outline-danger" size="sm" onClick={() => setArchiveTarget(row)} title="Archive teacher" aria-label={`Archive ${row.full_name}`}>
              <AppIcon name="archive" aria-hidden="true" />
            </Button>
          ) : (
            <Button variant="outline-secondary" size="sm" onClick={() => setRestoreTarget(row)} title="Restore teacher" aria-label={`Restore ${row.full_name}`}>
              <AppIcon name="rotateCounterclockwise" aria-hidden="true" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="directory-page" data-testid="admin-teacher-list">
      <header className="directory-page__heading">
        <div>
          <p className="directory-page__eyebrow">PEOPLE</p>
          <h2>Teachers Directory</h2>
          <p>Faculty members and instructors scoped to your institution</p>
        </div>
        <div className="directory-page__actions">
          <button className="directory-page__action" type="button" onClick={loadTeachers} disabled={loading}>
            <AppIcon name="rotateClockwise" aria-hidden="true" /> Refresh
          </button>
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={() => setImportDialogOpen(true)}
            disabled={isSuperadmin && selectedSchoolId === 'all'}
          >
            <AppIcon name="upload" aria-hidden="true" /> Import teachers
          </Button>
          {isSuperadmin && (
            <label className="core-field">
              <span className="core-field__label">School</span>
              <select className="core-select" value={selectedSchoolId} onChange={(event) => setSelectedSchoolId(event.target.value ? Number(event.target.value) : 'all')}>
                <option value="all">All schools</option>
                {schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
              </select>
            </label>
          )}
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={() => void downloadExport()}
            loading={exportLoading}
            disabled={exportLoading || (isSuperadmin && selectedSchoolId === 'all')}
          >
            Export CSV
          </Button>
          <Button variant="primary" size="sm" onClick={() => void openCreateModal()}>
            <AppIcon name="userRoundPlus" aria-hidden="true" /> New Teacher
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
        <div className="directory-segmented" role="group" aria-label="Filter teachers by status">
          <button type="button" className={statusFilter === 'active' ? 'is-selected' : ''} aria-pressed={statusFilter === 'active'} onClick={() => setStatusFilter('active')}>Active</button>
          <button type="button" className={statusFilter === 'archived' ? 'is-selected' : ''} aria-pressed={statusFilter === 'archived'} onClick={() => setStatusFilter('archived')}>Archived</button>
        </div>
        <label className="core-field">
          <span className="core-field__label">Department</span>
          <select
            className="core-select"
            value={departmentFilter}
            onChange={(event) => setDepartmentFilter(event.target.value ? Number(event.target.value) : 'all')}
          >
            <option value="all">All departments</option>
            {(lookups?.departments || []).map((department) => (
              <option key={department.id} value={department.id}>{department.name}</option>
            ))}
          </select>
        </label>
        <span className="directory-record-count">{totalCount} {statusFilter} records</span>
        <Button
          variant="outline-danger"
          size="sm"
          disabled={!selectedTeacherIds.length || bulkLoading}
          onClick={() => setBulkDialogOpen(true)}
        >
          {statusFilter === 'active' ? 'Archive' : 'Restore'} selected ({selectedTeacherIds.length})
        </Button>
      </div>

      <DataTable<TeacherListItem>
        className="directory-table"
        columns={columns}
        data={teachers}
        keyExtractor={(row) => row.id}
        loading={loading}
        searchable={true}
        searchPlaceholder="Search by teacher name, staff ID, or department..."
        emptyTitle="No Teachers Found"
        emptyDescription="There are currently no faculty members registered in this school."
      />
      <div className="directory-pagination" aria-label="Teacher directory pagination">
        <Button variant="outline-secondary" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>
          Previous
        </Button>
        <span>Page {page} of {totalPages}</span>
        <Button variant="outline-secondary" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>
          Next
        </Button>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingTeacher ? `Edit ${editingTeacher.full_name}` : 'Register Teacher'}
        footer={<div className="core-modal__actions"><Button variant="secondary" size="sm" onClick={() => setIsModalOpen(false)} disabled={formSubmitting}>Cancel</Button><Button variant="primary" size="sm" type="submit" form="teacher-admin-form" loading={formSubmitting}>{editingTeacher ? 'Save changes' : 'Create teacher'}</Button></div>}
      >
        <form id="teacher-admin-form" className="directory-form" onSubmit={handleFormSubmit}>
          {formError && <Alert variant="danger" className="directory-form__error">{formError}</Alert>}
          <label className="core-field"><span className="core-field__label">Full name *</span><input className="core-input" required value={formData.full_name} onChange={(event) => setFormData({ ...formData, full_name: event.target.value })} /></label>
          <div className="directory-form__grid">
            <label className="core-field"><span className="core-field__label">Gender</span><select className="core-select" value={formData.gender} onChange={(event) => setFormData({ ...formData, gender: event.target.value })}><option value="">Not specified</option><option value="F">Female</option><option value="M">Male</option></select></label>
            <label className="core-field"><span className="core-field__label">Contact number *</span><input className="core-input" required value={formData.contact_number} onChange={(event) => setFormData({ ...formData, contact_number: event.target.value })} /></label>
            <label className="core-field"><span className="core-field__label">Email</span><input className="core-input" type="email" value={formData.email} onChange={(event) => setFormData({ ...formData, email: event.target.value })} /></label>
            <label className="core-field"><span className="core-field__label">Department</span><select className="core-select" value={formData.department} onChange={(event) => setFormData({ ...formData, department: event.target.value ? Number(event.target.value) : '' })}><option value="">No department</option>{(lookups?.departments || []).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
          </div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={Boolean(archiveTarget)} onClose={() => setArchiveTarget(null)} onConfirm={handleArchive} title="Archive teacher" message={`Archive ${archiveTarget?.full_name}? Their assignment history will be retained.`} confirmLabel="Archive" confirmVariant="danger" loading={archiveLoading} />
      <ConfirmDialog isOpen={Boolean(restoreTarget)} onClose={() => setRestoreTarget(null)} onConfirm={handleRestore} title="Restore teacher" message={`Restore ${restoreTarget?.full_name} to the active faculty directory?`} confirmLabel="Restore" confirmVariant="primary" loading={archiveLoading} />
      <ConfirmDialog
        isOpen={bulkDialogOpen}
        onClose={() => setBulkDialogOpen(false)}
        onConfirm={handleBulkArchive}
        title={`${statusFilter === 'active' ? 'Archive' : 'Restore'} selected teachers`}
        message={`${statusFilter === 'active' ? 'Archive' : 'Restore'} ${selectedTeacherIds.length} selected teacher(s)?`}
        confirmLabel={statusFilter === 'active' ? 'Archive selected' : 'Restore selected'}
        confirmVariant={statusFilter === 'active' ? 'danger' : 'primary'}
        loading={bulkLoading}
      />
      <TeacherImportDialog
        isOpen={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        onImported={(result) => void handleTeacherImport(result)}
        lookups={lookups}
        schoolId={selectedSchoolId === 'all' ? undefined : selectedSchoolId}
      />
    </div>
  );
};
