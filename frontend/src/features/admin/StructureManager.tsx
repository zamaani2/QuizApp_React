import { AppIcon } from '../../components/common/AppIcon';
import React, { useCallback, useEffect, useState } from 'react';
import { academicApi, type SchoolStructureResponse } from '../../api/academic';
import type {
  SchoolStructureInput,
  SchoolStructureItem,
  SchoolStructureSchool,
  SchoolStructureTeacher,
} from '../../types';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { Modal } from '../../components/common/Modal';
import { DataTable, type Column } from '../../components/table/DataTable';
import './AdminAcademic.css';

type StructureResource = 'forms' | 'learning-areas' | 'departments';
type SchoolFilter = number | 'all';

interface StructureManagerProps {
  resource: StructureResource;
}

interface StructureForm {
  name: string;
  description: string;
  form_number: string;
  code: string;
  head_of_department_id: string;
  school_id: string;
}

const resourceDetails: Record<StructureResource, {
  title: string;
  singular: string;
  description: string;
}> = {
  forms: {
    title: 'Forms & Grade Levels',
    singular: 'Form',
    description: 'Manage grade levels and review student associations.',
  },
  'learning-areas': {
    title: 'Learning Areas',
    singular: 'Learning Area',
    description: 'Manage school learning areas and review student associations.',
  },
  departments: {
    title: 'Departments',
    singular: 'Department',
    description: 'Manage departments, heads of department, and teacher associations.',
  },
};

const emptyForm = (): StructureForm => ({
  name: '',
  description: '',
  form_number: '',
  code: '',
  head_of_department_id: '',
  school_id: '',
});

const responseItems = (
  resource: StructureResource,
  response: SchoolStructureResponse,
): SchoolStructureItem[] => {
  if (resource === 'forms') return response.forms ?? [];
  if (resource === 'learning-areas') return response.learning_areas ?? [];
  return response.departments ?? [];
};

export const StructureManager: React.FC<StructureManagerProps> = ({ resource }) => {
  const [items, setItems] = useState<SchoolStructureItem[]>([]);
  const [schools, setSchools] = useState<SchoolStructureSchool[] | null>(null);
  const [teachers, setTeachers] = useState<SchoolStructureTeacher[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<SchoolFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SchoolStructureItem | null>(null);
  const [formData, setFormData] = useState<StructureForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SchoolStructureItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const details = resourceDetails[resource];

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const schoolId = selectedSchool === 'all' ? undefined : selectedSchool;
      const response = await academicApi.getSchoolStructure(resource, schoolId);
      setItems(responseItems(resource, response));
      setSchools(response.schools ?? null);
      setTeachers(response.teachers ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : `Failed to load ${details.title.toLowerCase()}.`);
    } finally {
      setLoading(false);
    }
  }, [details.title, resource, selectedSchool]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openCreateModal = () => {
    setEditingItem(null);
    setFormData({
      ...emptyForm(),
      school_id: selectedSchool === 'all' ? '' : String(selectedSchool),
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (item: SchoolStructureItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      description: item.description,
      form_number: item.form_number === undefined ? '' : String(item.form_number),
      code: item.code ?? '',
      head_of_department_id: item.head_of_department_id == null ? '' : String(item.head_of_department_id),
      school_id: item.school_id == null ? '' : String(item.school_id),
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!formData.name.trim()) {
      setFormError(`${details.singular} name is required.`);
      return;
    }
    if (resource === 'forms' && (!formData.form_number || Number(formData.form_number) < 1)) {
      setFormError('Enter a valid form number.');
      return;
    }
    if (resource !== 'forms' && !formData.code.trim()) {
      setFormError(`${details.singular} code is required.`);
      return;
    }
    if (!editingItem && schools && !formData.school_id) {
      setFormError('Select a school for this record.');
      return;
    }

    const input: SchoolStructureInput = {
      name: formData.name.trim(),
      description: formData.description.trim(),
      ...(resource === 'forms'
        ? { form_number: Number(formData.form_number) }
        : { code: formData.code.trim() }),
      ...(resource === 'departments'
        ? { head_of_department_id: formData.head_of_department_id ? Number(formData.head_of_department_id) : null }
        : {}),
      ...(!editingItem && formData.school_id
        ? { school_id: Number(formData.school_id) }
        : {}),
    };

    setFormSubmitting(true);
    setFormError(null);
    try {
      const result = editingItem
        ? await academicApi.updateSchoolStructureItem(resource, editingItem.id, input)
        : await academicApi.createSchoolStructureItem(resource, input);
      setSuccessMessage(result.message);
      setIsModalOpen(false);
      await loadData();
    } catch (submitError) {
      setFormError(submitError instanceof Error ? submitError.message : 'The record could not be saved.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setError(null);
    try {
      const result = await academicApi.deleteSchoolStructureItem(resource, deleteTarget.id);
      setSuccessMessage(result.message);
      setDeleteTarget(null);
      await loadData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : `Failed to delete ${details.singular.toLowerCase()}.`);
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  const columns: Column<SchoolStructureItem>[] = [];
  if (resource === 'forms') {
    columns.push({
      id: 'form_number',
      header: 'Form Number',
      sortable: true,
      accessor: (item) => <span className="academic-admin__status academic-admin__status--info">{item.form_number}</span>,
    });
  } else {
    columns.push({
      id: 'code',
      header: 'Code',
      sortable: true,
      accessor: (item) => <code>{item.code}</code>,
    });
  }
  columns.push({
    id: 'name',
    header: 'Name',
    sortable: true,
    accessor: (item) => <span className="academic-admin__catalog-name">{item.name}</span>,
  });
  if (resource === 'departments') {
    columns.push({
      id: 'head_of_department_name',
      header: 'Head of Department',
      sortable: true,
      accessor: (item) => item.head_of_department_name || <span className="academic-admin__catalog-secondary">Not assigned</span>,
    });
  }
  columns.push({
    id: 'description',
    header: 'Description',
    accessor: (item) => item.description || <span className="academic-admin__catalog-secondary">—</span>,
  });
  columns.push({
    id: 'association_count',
    header: resource === 'departments' ? 'Teachers' : 'Students',
    sortable: true,
    accessor: (item) => (
      <span className="academic-admin__status academic-admin__status--info">
        {resource === 'departments' ? item.teacher_count : item.student_count}
      </span>
    ),
  });
  if (schools) {
    columns.push({
      id: 'school_name',
      header: 'School',
      sortable: true,
      accessor: 'school_name',
    });
  }
  columns.push({
    id: 'actions',
    header: 'Actions',
    align: 'right',
    accessor: (item) => (
      <div className="academic-admin__row-actions">
        <Button
          variant="outline-primary"
          size="sm"
          aria-label={`Edit ${item.name}`}
          title={`Edit ${item.name}`}
          onClick={() => openEditModal(item)}
        >
          <AppIcon name="pencil" aria-hidden="true" />
        </Button>
        <Button
          variant="outline-danger"
          size="sm"
          aria-label={`Delete ${item.name}`}
          title={`Delete ${item.name}`}
          onClick={() => setDeleteTarget(item)}
        >
          <AppIcon name="trash" aria-hidden="true" />
        </Button>
      </div>
    ),
  });

  const availableTeachers = teachers.filter(
    (teacher) => !formData.school_id || teacher.school_id === Number(formData.school_id),
  );
  const selectedSchoolName = schools?.find((school) => school.id === Number(formData.school_id))?.name;

  return (
    <div className="academic-admin">
      <header className="academic-admin__heading">
        <div>
          <p className="academic-admin__eyebrow">SCHOOL STRUCTURE</p>
          <h1>{details.title}</h1>
          <p className="academic-admin__description">{details.description}</p>
        </div>
        <div className="academic-admin__heading-actions">
          <Button variant="primary" size="sm" onClick={openCreateModal}>
            <AppIcon name="plus" aria-hidden="true" /> Add {details.singular}
          </Button>
        </div>
      </header>

      {successMessage && (
        <Alert variant="success" dismissible onDismiss={() => setSuccessMessage(null)} className="academic-admin__alert">
          {successMessage}
        </Alert>
      )}
      {error && (
        <Alert variant="danger" dismissible onDismiss={() => setError(null)} className="academic-admin__alert">
          {error}
        </Alert>
      )}

      <section className="academic-admin__toolbar" aria-label={`${details.title} controls`}>
        {schools ? (
          <label className="academic-admin__catalog-filter" htmlFor="structure-school-filter">
            <span>School:</span>
            <select
              id="structure-school-filter"
              className="core-select academic-admin__catalog-select"
              value={selectedSchool}
              onChange={(event) => setSelectedSchool(event.target.value === 'all' ? 'all' : Number(event.target.value))}
            >
              <option value="all">All schools</option>
              {schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
            </select>
          </label>
        ) : <span className="academic-admin__catalog-secondary">Manage records for your school.</span>}
        <Button variant="outline-secondary" size="sm" onClick={() => void loadData()} loading={loading}>
          <AppIcon name="refresh" aria-hidden="true" /> Refresh
        </Button>
      </section>

      <div className="academic-admin__table">
        <DataTable
          data={items}
          columns={columns}
          keyExtractor={(item) => item.id}
          loading={loading}
          emptyTitle={`No ${details.title.toLowerCase()} found.`}
          searchPlaceholder={`Search ${details.title.toLowerCase()}...`}
        />
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingItem ? `Edit ${details.singular}: ${editingItem.name}` : `Create ${details.singular}`}
        footer={
          <div className="core-modal__actions">
            <Button variant="secondary" size="sm" onClick={() => setIsModalOpen(false)} disabled={formSubmitting}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleFormSubmit} loading={formSubmitting}>
              {editingItem ? 'Save Changes' : `Create ${details.singular}`}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleFormSubmit}>
          {formError && <Alert variant="danger" className="academic-admin__form-error">{formError}</Alert>}
          {schools && (
            <div className="academic-admin__field">
              <label htmlFor="structure-form-school" className="core-field__label">School</label>
              {editingItem ? (
                <input id="structure-form-school" className="core-input" value={editingItem.school_name} disabled />
              ) : (
                <select
                  id="structure-form-school"
                  className="core-select"
                  value={formData.school_id}
                  onChange={(event) => setFormData({ ...formData, school_id: event.target.value, head_of_department_id: '' })}
                  required
                >
                  <option value="">Select a school</option>
                  {schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
                </select>
              )}
            </div>
          )}
          {resource === 'forms' && (
            <div className="academic-admin__field">
              <label htmlFor="structure-form-number" className="core-field__label">Form Number <span className="core-field__required">*</span></label>
              <input
                id="structure-form-number"
                type="number"
                min="1"
                step="1"
                className="core-input"
                value={formData.form_number}
                onChange={(event) => setFormData({ ...formData, form_number: event.target.value })}
                required
              />
            </div>
          )}
          {resource !== 'forms' && (
            <div className="academic-admin__field">
              <label htmlFor="structure-code" className="core-field__label">Code <span className="core-field__required">*</span></label>
              <input
                id="structure-code"
                type="text"
                maxLength={resource === 'departments' ? 10 : 30}
                className="core-input"
                value={formData.code}
                onChange={(event) => setFormData({ ...formData, code: event.target.value })}
                required
              />
            </div>
          )}
          <div className="academic-admin__field">
            <label htmlFor="structure-name" className="core-field__label">{details.singular} Name <span className="core-field__required">*</span></label>
            <input
              id="structure-name"
              type="text"
              maxLength={resource === 'forms' ? 50 : 100}
              className="core-input"
              value={formData.name}
              onChange={(event) => setFormData({ ...formData, name: event.target.value })}
              required
            />
          </div>
          {resource === 'departments' && (
            <div className="academic-admin__field">
              <label htmlFor="structure-head" className="core-field__label">Head of Department</label>
              <select
                id="structure-head"
                className="core-select"
                value={formData.head_of_department_id}
                onChange={(event) => setFormData({ ...formData, head_of_department_id: event.target.value })}
              >
                <option value="">No head assigned</option>
                {availableTeachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>{teacher.full_name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="academic-admin__field">
            <label htmlFor="structure-description" className="core-field__label">Description</label>
            <textarea
              id="structure-description"
              className="core-input"
              rows={3}
              value={formData.description}
              onChange={(event) => setFormData({ ...formData, description: event.target.value })}
            />
          </div>
          {selectedSchoolName && schools && <p className="academic-admin__confirmation-note">School: {selectedSchoolName}</p>}
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleDelete()}
        title={`Delete ${details.singular}?`}
        message={<>Delete <strong>{deleteTarget?.name}</strong>? Records with associated students or teachers cannot be deleted.</>}
        confirmLabel={`Delete ${details.singular}`}
        confirmVariant="danger"
        loading={deleteLoading}
      />
    </div>
  );
};
