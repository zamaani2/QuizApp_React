import React, { useEffect, useState, useCallback } from 'react';
import {
  archiveTeacher,
  createTeacher,
  fetchTeachers,
  restoreTeacher,
  updateTeacher,
} from '../../api/admin';
import type { StructureLookups, TeacherAdminInput, TeacherListItem } from '../../types';
import { academicApi } from '../../api/academic';
import { DataTable, type Column } from '../../components/table/DataTable';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import './AdminDirectory.css';

const emptyTeacherForm = (): TeacherAdminInput => ({
  full_name: '',
  gender: '',
  contact_number: '',
  email: '',
  department: '',
});

export const TeacherList: React.FC = () => {
  const [teachers, setTeachers] = useState<TeacherListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived'>('active');
  const [lookups, setLookups] = useState<StructureLookups | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<TeacherListItem | null>(null);
  const [formData, setFormData] = useState<TeacherAdminInput>(emptyTeacherForm);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<TeacherListItem | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<TeacherListItem | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);

  const loadTeachers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchTeachers({ is_active: statusFilter === 'active' });
      setTeachers(response.results);
      setTotalCount(response.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load teachers directory.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadTeachers();
  }, [loadTeachers]);

  const loadLookups = async () => {
    try {
      setLookups(await academicApi.getStructureLookups());
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not load teacher form options.');
    }
  };

  const openCreateModal = async () => {
    setEditingTeacher(null);
    setFormData(emptyTeacherForm());
    setFormError(null);
    await loadLookups();
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
    });
    setFormError(null);
    await loadLookups();
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormSubmitting(true);
    setFormError(null);
    try {
      const response = editingTeacher
        ? await updateTeacher(editingTeacher.id, formData)
        : await createTeacher(formData);
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

  const columns: Column<TeacherListItem>[] = [
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
            <i className="bi bi-pencil" aria-hidden="true" />
          </Button>
          {row.is_active ? (
            <Button variant="outline-danger" size="sm" onClick={() => setArchiveTarget(row)} title="Archive teacher" aria-label={`Archive ${row.full_name}`}>
              <i className="bi bi-archive" aria-hidden="true" />
            </Button>
          ) : (
            <Button variant="outline-secondary" size="sm" onClick={() => setRestoreTarget(row)} title="Restore teacher" aria-label={`Restore ${row.full_name}`}>
              <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
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
            <i className="bi bi-arrow-clockwise" aria-hidden="true" /> Refresh
          </button>
          <Button variant="primary" size="sm" onClick={() => void openCreateModal()}>
            <i className="bi bi-person-plus" aria-hidden="true" /> New Teacher
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
        <span className="directory-record-count">{totalCount} {statusFilter} records</span>
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
            <label className="core-field"><span className="core-field__label">Department</span><select className="core-select" value={formData.department} onChange={(event) => setFormData({ ...formData, department: event.target.value ? Number(event.target.value) : '' })}><option value="">No department</option>{lookups?.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
          </div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={Boolean(archiveTarget)} onClose={() => setArchiveTarget(null)} onConfirm={handleArchive} title="Archive teacher" message={`Archive ${archiveTarget?.full_name}? Their assignment history will be retained.`} confirmLabel="Archive" confirmVariant="danger" loading={archiveLoading} />
      <ConfirmDialog isOpen={Boolean(restoreTarget)} onClose={() => setRestoreTarget(null)} onConfirm={handleRestore} title="Restore teacher" message={`Restore ${restoreTarget?.full_name} to the active faculty directory?`} confirmLabel="Restore" confirmVariant="primary" loading={archiveLoading} />
    </div>
  );
};
