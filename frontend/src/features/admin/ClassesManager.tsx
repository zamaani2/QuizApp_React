import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { academicApi } from '../../api/academic';
import type { ClassItem, ClassInput, StructureLookups } from '../../types';
import { DataTable, type Column } from '../../components/table/DataTable';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import './AdminAcademic.css';
import './AdminAcademic.css';

export const ClassesManager: React.FC = () => {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [lookups, setLookups] = useState<StructureLookups | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filter state
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const [selectedYearId, setSelectedYearId] = useState<number | 'all'>('all');
  const [selectedFormId, setSelectedFormId] = useState<number | 'all'>('all');

  // Modal & Form state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingClass, setEditingClass] = useState<ClassItem | null>(null);
  const [formData, setFormData] = useState<ClassInput>({
    name: '',
    form_id: null,
    learning_area_id: null,
    academic_year_id: null,
    maximum_students: 50,
  });
  const [formSubmitting, setFormSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Archive & Restore dialog state
  const [archiveTarget, setArchiveTarget] = useState<ClassItem | null>(null);
  const [archiveLoading, setArchiveLoading] = useState<boolean>(false);
  const [restoreTarget, setRestoreTarget] = useState<ClassItem | null>(null);
  const [restoreLoading, setRestoreLoading] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [lookupRes, classRes] = await Promise.all([
        academicApi.getStructureLookups(),
        academicApi.getClasses({
          is_active: activeTab === 'active',
          academic_year_id: selectedYearId === 'all' ? undefined : selectedYearId,
          form_id: selectedFormId === 'all' ? undefined : selectedFormId,
        }),
      ]);
      setLookups(lookupRes);
      setClasses(classRes.classes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load classes.');
    } finally {
      setLoading(false);
    }
  }, [activeTab, selectedYearId, selectedFormId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreateModal = () => {
    const currentYear =
      selectedYearId !== 'all'
        ? selectedYearId
        : lookups?.academic_years.find((y) => y.is_current)?.id || null;

    setEditingClass(null);
    setFormData({
      name: '',
      form_id: lookups?.forms[0]?.id || null,
      learning_area_id: lookups?.learning_areas[0]?.id || null,
      academic_year_id: currentYear,
      maximum_students: 50,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (c: ClassItem) => {
    setEditingClass(c);
    setFormData({
      name: c.name,
      form_id: c.form_id,
      learning_area_id: c.learning_area_id,
      academic_year_id: c.academic_year_id,
      maximum_students: c.maximum_students,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setFormError('Class name is required.');
      return;
    }

    setFormSubmitting(true);
    setFormError(null);
    try {
      if (editingClass) {
        const res = await academicApi.updateClass(editingClass.id, formData);
        setSuccessMessage(res.message);
      } else {
        const res = await academicApi.createClass(formData);
        setSuccessMessage(res.message);
      }
      setIsModalOpen(false);
      loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Operation failed.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleArchiveConfirm = async () => {
    if (!archiveTarget) return;
    setArchiveLoading(true);
    try {
      const res = await academicApi.archiveClass(archiveTarget.id);
      setSuccessMessage(res.message);
      setArchiveTarget(null);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive class.');
      setArchiveTarget(null);
    } finally {
      setArchiveLoading(false);
    }
  };

  const handleRestoreConfirm = async () => {
    if (!restoreTarget) return;
    setRestoreLoading(true);
    try {
      const res = await academicApi.restoreClass(restoreTarget.id);
      setSuccessMessage(res.message);
      setRestoreTarget(null);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore class.');
      setRestoreTarget(null);
    } finally {
      setRestoreLoading(false);
    }
  };

  const columns: Column<ClassItem>[] = [
    {
      id: 'class_info',
      header: 'Class / Code',
      sortable: true,
      accessor: (row) => (
        <div className="academic-admin__catalog-name">
          <div>{row.name}</div>
          <code>{row.class_id}</code>
        </div>
      ),
    },
    {
      id: 'form_area',
      header: 'Form & Learning Area',
      sortable: true,
      accessor: (row) => (
        <div className="academic-admin__catalog-meta">
          <span className="academic-admin__status academic-admin__status--year">
            {row.form_name || 'Unassigned Form'}
          </span>
          <span className="academic-admin__catalog-secondary">{row.learning_area_name || 'General'}</span>
        </div>
      ),
    },
    {
      id: 'academic_year',
      header: 'Session',
      sortable: true,
      accessor: (row) => (
        <span className="academic-admin__date-range">
          <i className="bi bi-calendar3" aria-hidden="true" />{' '}
          {row.academic_year_name || '—'}
        </span>
      ),
    },
    {
      id: 'capacity',
      header: 'Students & Cap',
      sortable: true,
      accessor: (row) => {
        const isFull = row.student_count >= row.maximum_students;
        return (
          <div className="academic-admin__capacity">
            <span className={isFull ? 'is-full' : ''}>
              {row.student_count}
            </span>{' '}
            / {row.maximum_students}
            {isFull && <span className="academic-admin__status academic-admin__status--full">Full</span>}
          </div>
        );
      },
    },
    {
      id: 'subjects',
      header: 'Subjects',
      sortable: true,
      accessor: (row) => (
        <span className="academic-admin__status academic-admin__status--info">
          <i className="bi bi-journal-bookmark" aria-hidden="true" />{' '}
          {row.subject_count} Assigned
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      accessor: (row) => (
        <div className="academic-admin__row-actions">
          <Link
            to={`/admin/classes/${row.id}`}
            className="core-button core-button--outline-primary core-button--sm"
            title="View Class Details & Assign Subjects"
          >
            <i className="bi bi-eye" aria-hidden="true" />{' '}
            Details
          </Link>
          <Button
            variant="outline-primary"
            size="sm"
            onClick={() => openEditModal(row)}
            title="Edit Class"
          >
            <i className="bi bi-pencil" />
          </Button>
          {row.is_active ? (
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => setArchiveTarget(row)}
              title="Archive Class"
            >
              <i className="bi bi-archive" />
            </Button>
          ) : (
            <Button
              variant="success"
              size="sm"
              onClick={() => setRestoreTarget(row)}
              title="Restore Class"
            >
              <i className="bi bi-arrow-counterclockwise" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="academic-admin">
      <header className="academic-admin__heading">
        <div>
          <p className="academic-admin__eyebrow">PEOPLE &amp; STRUCTURE</p>
          <h1>Classes Management</h1>
          <p className="academic-admin__description">
            Organize student cohorts, capacity limits, forms, and curriculum subjects.
          </p>
        </div>

        <div className="academic-admin__heading-actions">
          <Button variant="primary" size="sm" onClick={openCreateModal}>
            <i className="bi bi-plus-lg me-1" />
            Add Class
          </Button>
        </div>
      </header>

      {/* Notifications */}
      {successMessage && (
        <Alert
          variant="success"
          dismissible
          onDismiss={() => setSuccessMessage(null)}
          className="academic-admin__alert"
        >
          {successMessage}
        </Alert>
      )}

      {error && (
        <Alert
          variant="danger"
          dismissible
          onDismiss={() => setError(null)}
          className="academic-admin__alert"
        >
          {error}
        </Alert>
      )}

      {/* Filter and Tab Bar */}
      <section className="academic-admin__toolbar" aria-label="Class filters">
          <div className="academic-admin__catalog-filters">
            <div className="academic-admin__segmented" role="group" aria-label="Class status">
                <button
                  type="button"
                  className={activeTab === 'active' ? 'is-selected' : ''}
                  aria-pressed={activeTab === 'active'}
                  onClick={() => setActiveTab('active')}
                >
                  Active Classes
                </button>
                <button
                  type="button"
                  className={activeTab === 'archived' ? 'is-selected' : ''}
                  aria-pressed={activeTab === 'archived'}
                  onClick={() => setActiveTab('archived')}
                >
                  Archived
                </button>
            </div>

            {/* Academic Year Filter */}
            <label className="academic-admin__catalog-filter" htmlFor="filter-class-year">
              <span>
                Year:
              </span>
              <select
                id="filter-class-year"
                className="core-select academic-admin__catalog-select"
                value={selectedYearId}
                onChange={(e) =>
                  setSelectedYearId(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
              >
                <option value="all">All Sessions</option>
                {lookups?.academic_years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
            </label>

            {/* Form Filter */}
            <label className="academic-admin__catalog-filter" htmlFor="filter-class-form">
              <span>
                Form:
              </span>
              <select
                id="filter-class-form"
                className="core-select academic-admin__catalog-select"
                value={selectedFormId}
                onChange={(e) =>
                  setSelectedFormId(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
              >
                <option value="all">All Forms</option>
                {lookups?.forms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
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

      <div className="academic-admin__table">
          <DataTable
            data={classes}
            columns={columns}
            keyExtractor={(row) => row.id}
            loading={loading}
            emptyTitle={`No ${activeTab} classes found.`}
            searchPlaceholder="Search classes by name or code..."
          />
      </div>

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingClass ? `Edit Class: ${editingClass.name}` : 'Create New Class'}
        footer={
          <div className="core-modal__actions">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsModalOpen(false)}
              disabled={formSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleFormSubmit}
              loading={formSubmitting}
            >
              {editingClass ? 'Save Changes' : 'Create Class'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleFormSubmit}>
          {formError && (
            <Alert variant="danger" className="academic-admin__form-error">
              {formError}
            </Alert>
          )}

          <div className="academic-admin__field">
            <label htmlFor="class-name" className="core-field__label">
              Class Name <span className="core-field__required">*</span>
            </label>
            <input
              id="class-name"
              type="text"
              className="core-input"
              placeholder="e.g. Form 1 East, Grade 10 A"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="academic-admin__date-fields">
            <div className="academic-admin__field">
              <label htmlFor="class-form" className="core-field__label">
                Form / Grade Level
              </label>
              <select
                id="class-form"
                className="core-select"
                value={formData.form_id ?? ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    form_id: e.target.value ? Number(e.target.value) : null,
                  })
                }
              >
                <option value="">Select Form Level</option>
                {lookups?.forms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="academic-admin__field">
              <label htmlFor="class-learning-area" className="core-field__label">
                Learning Area / Track
              </label>
              <select
                id="class-learning-area"
                className="core-select"
                value={formData.learning_area_id ?? ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    learning_area_id: e.target.value ? Number(e.target.value) : null,
                  })
                }
              >
                <option value="">Select Learning Area</option>
                {lookups?.learning_areas.map((la) => (
                  <option key={la.id} value={la.id}>
                    {la.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="academic-admin__date-fields">
            <div className="academic-admin__field">
              <label htmlFor="class-academic-year" className="core-field__label">
                Academic Year Session
              </label>
              <select
                id="class-academic-year"
                className="core-select"
                value={formData.academic_year_id ?? ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    academic_year_id: e.target.value ? Number(e.target.value) : null,
                  })
                }
              >
                <option value="">Select Academic Year</option>
                {lookups?.academic_years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name} {y.is_current ? '(Current)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="academic-admin__field">
              <label htmlFor="class-max-students" className="core-field__label">
                Maximum Student Capacity
              </label>
              <input
                id="class-max-students"
                type="number"
                min={1}
                max={500}
                className="core-input"
                value={formData.maximum_students ?? 50}
                onChange={(e) =>
                  setFormData({ ...formData, maximum_students: Number(e.target.value) })
                }
              />
            </div>
          </div>
        </form>
      </Modal>

      {/* Archive Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        onConfirm={handleArchiveConfirm}
        title="Archive Class"
        message={
          <div>
            Archive class <strong>{archiveTarget?.name}</strong>?
            <p className="academic-admin__confirmation-note">
              The class will be hidden from daily operations but can be restored at any time.
            </p>
          </div>
        }
        confirmLabel="Archive Class"
        confirmVariant="warning"
        loading={archiveLoading}
      />

      {/* Restore Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(restoreTarget)}
        onClose={() => setRestoreTarget(null)}
        onConfirm={handleRestoreConfirm}
        title="Restore Class"
        message={
          <div>
            Restore archived class <strong>{restoreTarget?.name}</strong> to active operations?
          </div>
        }
        confirmLabel="Restore Class"
        confirmVariant="primary"
        loading={restoreLoading}
      />
    </div>
  );
};
