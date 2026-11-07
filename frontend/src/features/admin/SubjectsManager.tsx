import React, { useEffect, useState, useCallback } from 'react';
import { academicApi } from '../../api/academic';
import type { SubjectItem, SubjectInput, StructureLookups } from '../../types';
import { DataTable, type Column } from '../../components/table/DataTable';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import './AdminAcademic.css';

export const SubjectsManager: React.FC = () => {
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [lookups, setLookups] = useState<StructureLookups | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filter state
  const [activeTab, setActiveTab] = useState<'active' | 'archived' | 'all'>('active');
  const [selectedDeptId, setSelectedDeptId] = useState<number | 'all'>('all');
  const [selectedAreaId, setSelectedAreaId] = useState<number | 'all'>('all');
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal & Form state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingSubject, setEditingSubject] = useState<SubjectItem | null>(null);
  const [formLookups, setFormLookups] = useState<StructureLookups | null>(null);
  const [formData, setFormData] = useState<SubjectInput>({
    subject_name: '',
    department_id: null,
    learning_area_id: null,
    school_id: null,
  });
  const [formSubmitting, setFormSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Archive & Restore dialog state
  const [archiveTarget, setArchiveTarget] = useState<SubjectItem | null>(null);
  const [archiveLoading, setArchiveLoading] = useState<boolean>(false);
  const [restoreTarget, setRestoreTarget] = useState<SubjectItem | null>(null);
  const [restoreLoading, setRestoreLoading] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [lookupRes, subjectRes] = await Promise.all([
        academicApi.getStructureLookups(
          selectedSchoolId === 'all' ? undefined : { school_id: selectedSchoolId },
        ),
        academicApi.getSubjects({
          status: activeTab,
          department_id: selectedDeptId === 'all' ? undefined : selectedDeptId,
          learning_area_id: selectedAreaId === 'all' ? undefined : selectedAreaId,
          school_id: selectedSchoolId === 'all' ? undefined : selectedSchoolId,
        }),
      ]);
      setLookups(lookupRes);
      setSubjects(subjectRes.subjects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subjects.');
    } finally {
      setLoading(false);
    }
  }, [activeTab, selectedDeptId, selectedAreaId, selectedSchoolId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreateModal = () => {
    const schoolId = selectedSchoolId === 'all' ? null : selectedSchoolId;
    setEditingSubject(null);
    setFormData({
      subject_name: '',
      department_id: lookups?.departments[0]?.id || null,
      learning_area_id: lookups?.learning_areas[0]?.id || null,
      school_id: schoolId,
    });
    setFormLookups(lookups);
    setFormError(null);
    setIsModalOpen(true);
    if (lookups?.schools && schoolId) {
      academicApi.getStructureLookups({ school_id: schoolId })
        .then(setFormLookups)
        .catch((err: unknown) => {
          setFormError(err instanceof Error ? err.message : 'Failed to load school curriculum options.');
        });
    }
  };

  const openEditModal = (s: SubjectItem) => {
    setEditingSubject(s);
    setFormData({
      subject_name: s.subject_name,
      department_id: s.department_id,
      learning_area_id: s.learning_area_id,
      school_id: s.school_id,
    });
    setFormLookups(lookups);
    setFormError(null);
    setIsModalOpen(true);
    if (lookups?.schools && s.school_id) {
      academicApi.getStructureLookups({ school_id: s.school_id })
        .then(setFormLookups)
        .catch((err: unknown) => {
          setFormError(err instanceof Error ? err.message : 'Failed to load school curriculum options.');
        });
    }
  };

  const handleTargetSchoolChange = async (schoolId: number | null) => {
    setFormData((previous) => ({
      ...previous,
      school_id: schoolId,
      department_id: null,
      learning_area_id: null,
    }));
    setFormError(null);
    if (!schoolId) {
      setFormLookups(lookups ? { ...lookups, departments: [], learning_areas: [] } : null);
      return;
    }
    try {
      setFormLookups(await academicApi.getStructureLookups({ school_id: schoolId }));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to load school curriculum options.');
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.subject_name.trim()) {
      setFormError('Subject name is required.');
      return;
    }
    if (lookups?.schools && !formData.school_id) {
      setFormError('Select a target school.');
      return;
    }

    setFormSubmitting(true);
    setFormError(null);
    try {
      if (editingSubject) {
        const res = await academicApi.updateSubject(editingSubject.id, formData);
        setSuccessMessage(res.message);
      } else {
        const res = await academicApi.createSubject(formData);
        setSuccessMessage(res.message);
      }
      setIsModalOpen(false);
      void loadData();
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
      const res = await academicApi.archiveSubject(archiveTarget.id);
      setSuccessMessage(res.message);
      setArchiveTarget(null);
      void loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive subject.');
      setArchiveTarget(null);
    } finally {
      setArchiveLoading(false);
    }
  };

  const handleRestoreConfirm = async () => {
    if (!restoreTarget) return;
    setRestoreLoading(true);
    try {
      const res = await academicApi.restoreSubject(restoreTarget.id);
      setSuccessMessage(res.message);
      setRestoreTarget(null);
      void loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore subject.');
      setRestoreTarget(null);
    } finally {
      setRestoreLoading(false);
    }
  };

  const visibleSubjects = subjects.filter((subject) => {
    const query = searchQuery.trim().toLowerCase();
    return !query
      || subject.subject_name.toLowerCase().includes(query)
      || subject.subject_code.toLowerCase().includes(query);
  });
  const isSuperadmin = lookups?.schools !== undefined;

  const columns: Column<SubjectItem>[] = [
    {
      id: 'subject_info',
      header: 'Subject & Code',
      sortable: true,
      accessor: (row) => (
        <div className="academic-admin__catalog-name">
          <div>
            {row.subject_name}
            {activeTab === 'all' && !row.is_active && (
              <span className="badge bg-secondary ms-2">
                Archived
              </span>
            )}
          </div>
          <code>{row.subject_code}</code>
        </div>
      ),
    },
    {
      id: 'department',
      header: 'Department',
      sortable: true,
      accessor: (row) => (
        <span className="academic-admin__status academic-admin__status--year">
          {row.department_name || 'General Department'}
        </span>
      ),
    },
    {
      id: 'learning_area',
      header: 'Learning Area',
      sortable: true,
      accessor: (row) => (
        <span className="academic-admin__catalog-secondary">{row.learning_area_name || 'Core Curriculum'}</span>
      ),
    },
    {
      id: 'classes',
      header: 'Quizzes',
      sortable: true,
      accessor: (row) => (
        <span className="academic-admin__status academic-admin__status--info">
          <i className="bi bi-journal-check" aria-hidden="true" />{' '}
          {row.quiz_count} Quizzes
        </span>
      ),
    },
    {
      id: 'class_count',
      header: 'Class Cohorts',
      sortable: true,
      accessor: (row) => (
        <span className="academic-admin__status academic-admin__status--info">
          <i className="bi bi-building" aria-hidden="true" /> {row.class_count} Classes
        </span>
      ),
    },
    ...(isSuperadmin
      ? [{
          id: 'school',
          header: 'School',
          sortable: true,
          accessor: (row: SubjectItem) => row.school_name || '—',
        }]
      : []),
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      accessor: (row) => (
        <div className="academic-admin__row-actions">
          <Button
            variant="outline-primary"
            size="sm"
            onClick={() => openEditModal(row)}
            title="Edit Subject"
          >
            <i className="bi bi-pencil" />
          </Button>
          {row.is_active ? (
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => setArchiveTarget(row)}
              title="Archive Subject"
            >
              <i className="bi bi-archive" />
            </Button>
          ) : (
            <Button
              variant="success"
              size="sm"
              onClick={() => setRestoreTarget(row)}
              title="Restore Subject"
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
          <p className="academic-admin__eyebrow">CURRICULUM</p>
          <h1>Subjects Catalog</h1>
          <p className="academic-admin__description">
            Maintain curriculum subjects, course codes, departments, and academic tracks.
          </p>
        </div>

        <div className="academic-admin__heading-actions">
          <Button variant="primary" size="sm" onClick={openCreateModal}>
            <i className="bi bi-plus-lg me-1" />
            Add Subject
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
      <section className="academic-admin__toolbar" aria-label="Subject filters">
          <div className="academic-admin__catalog-filters">
            {isSuperadmin && (
              <label className="academic-admin__catalog-filter" htmlFor="filter-subject-school">
                <span>School:</span>
                <select
                  id="filter-subject-school"
                  className="core-select academic-admin__catalog-select"
                  value={selectedSchoolId}
                  onChange={(event) => {
                    setSelectedSchoolId(
                      event.target.value === 'all' ? 'all' : Number(event.target.value),
                    );
                    setSelectedDeptId('all');
                    setSelectedAreaId('all');
                  }}
                >
                  <option value="all">All Schools</option>
                  {lookups?.schools?.map((school) => (
                    <option key={school.id} value={school.id}>{school.name}</option>
                  ))}
                </select>
              </label>
            )}
            <div className="academic-admin__segmented" role="group" aria-label="Subject status">
                <button
                  type="button"
                  className={activeTab === 'active' ? 'is-selected' : ''}
                  aria-pressed={activeTab === 'active'}
                  onClick={() => setActiveTab('active')}
                >
                  Active Subjects
                </button>
                <button
                  type="button"
                  className={activeTab === 'archived' ? 'is-selected' : ''}
                  aria-pressed={activeTab === 'archived'}
                  onClick={() => setActiveTab('archived')}
                >
                  Archived
                </button>
                <button
                  type="button"
                  className={activeTab === 'all' ? 'is-selected' : ''}
                  aria-pressed={activeTab === 'all'}
                  onClick={() => setActiveTab('all')}
                >
                  All Subjects
                </button>
            </div>

            {/* Department Filter */}
            <label className="academic-admin__catalog-filter" htmlFor="filter-subject-dept">
              <span>
                Department:
              </span>
              <select
                id="filter-subject-dept"
                className="core-select academic-admin__catalog-select"
                value={selectedDeptId}
                onChange={(e) =>
                  setSelectedDeptId(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
              >
                <option value="all">All Departments</option>
                {lookups?.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>

            {/* Learning Area Filter */}
            <label className="academic-admin__catalog-filter" htmlFor="filter-subject-area">
              <span>
                Learning Area:
              </span>
              <select
                id="filter-subject-area"
                className="core-select academic-admin__catalog-select"
                value={selectedAreaId}
                onChange={(e) =>
                  setSelectedAreaId(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
              >
                <option value="all">All Learning Areas</option>
                {lookups?.learning_areas.map((la) => (
                  <option key={la.id} value={la.id}>
                    {la.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="academic-admin__catalog-filter" htmlFor="filter-subject-search">
              <span>Search:</span>
              <input
                id="filter-subject-search"
                className="core-input academic-admin__catalog-select"
                type="search"
                placeholder="Name or code"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </label>
          </div>

          <div className="d-flex gap-2">
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => {
                setActiveTab('active');
                setSelectedDeptId('all');
                setSelectedAreaId('all');
                setSelectedSchoolId('all');
                setSearchQuery('');
              }}
            >
              Clear Filters
            </Button>
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={loadData}
              loading={loading}
            >
              <i className="bi bi-arrow-repeat me-1" />
              Refresh
            </Button>
          </div>
      </section>

      <div className="academic-admin__table">
          <DataTable
            data={visibleSubjects}
            columns={columns}
            keyExtractor={(row) => row.id}
            loading={loading}
            emptyTitle={`No ${activeTab} subjects found.`}
            searchable={false}
          />
      </div>

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingSubject ? `Edit Subject: ${editingSubject.subject_name}` : 'Create New Subject'}
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
              {editingSubject ? 'Save Changes' : 'Create Subject'}
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

          {isSuperadmin && !editingSubject && (
            <div className="academic-admin__field">
              <label htmlFor="subject-school" className="core-field__label">
                Target School <span className="core-field__required">*</span>
              </label>
              <select
                id="subject-school"
                className="core-select"
                value={formData.school_id ?? ''}
                onChange={(event) =>
                  void handleTargetSchoolChange(
                    event.target.value ? Number(event.target.value) : null,
                  )
                }
                required
              >
                <option value="">Select School</option>
                {lookups?.schools?.map((school) => (
                  <option key={school.id} value={school.id}>{school.name}</option>
                ))}
              </select>
            </div>
          )}

          {isSuperadmin && editingSubject && (
            <div className="academic-admin__field">
              <span className="core-field__label">School</span>
              <div>{editingSubject.school_name || 'Unknown school'}</div>
            </div>
          )}

          <div className="academic-admin__field">
            <label htmlFor="subject-name" className="core-field__label">
              Subject Name <span className="core-field__required">*</span>
            </label>
            <input
              id="subject-name"
              type="text"
              className="core-input"
              placeholder="e.g. Mathematics, Integrated Science"
              value={formData.subject_name}
              onChange={(e) => setFormData({ ...formData, subject_name: e.target.value })}
              required
            />
          </div>

          <div className="academic-admin__field">
            <span className="core-field__label">Subject Code</span>
            <div className="core-field__helper">
              {editingSubject
                ? `${editingSubject.subject_code} (generated code; cannot be changed)`
                : 'Generated automatically when the subject is created.'}
            </div>
          </div>

          <div className="academic-admin__date-fields">
            <div className="academic-admin__field">
              <label htmlFor="subject-department" className="core-field__label">
                Department
              </label>
              <select
                id="subject-department"
                className="core-select"
                value={formData.department_id ?? ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    department_id: e.target.value ? Number(e.target.value) : null,
                  })
                }
              >
                <option value="">Select Department</option>
                {formLookups?.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="academic-admin__field">
              <label htmlFor="subject-learning-area" className="core-field__label">
                Learning Area / Track
              </label>
              <select
                id="subject-learning-area"
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
                {formLookups?.learning_areas.map((la) => (
                  <option key={la.id} value={la.id}>
                    {la.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </form>
      </Modal>

      {/* Archive Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        onConfirm={handleArchiveConfirm}
        title="Archive Subject"
        message={
          <div>
            Archive subject <strong>{archiveTarget?.subject_name}</strong> ({archiveTarget?.subject_code})?
            <p className="academic-admin__confirmation-note">
              The subject will be hidden from new quiz assignments but past records remain intact.
            </p>
          </div>
        }
        confirmLabel="Archive Subject"
        confirmVariant="warning"
        loading={archiveLoading}
      />

      {/* Restore Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(restoreTarget)}
        onClose={() => setRestoreTarget(null)}
        onConfirm={handleRestoreConfirm}
        title="Restore Subject"
        message={
          <div>
            Restore archived subject <strong>{restoreTarget?.subject_name}</strong> to active curriculum?
          </div>
        }
        confirmLabel="Restore Subject"
        confirmVariant="primary"
        loading={restoreLoading}
      />
    </div>
  );
};
