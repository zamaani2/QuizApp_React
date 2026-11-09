import { AppIcon } from '../../components/common/AppIcon';
import React, { useEffect, useState, useCallback } from 'react';
import { academicApi } from '../../api/academic';
import type { AcademicYear, AcademicYearInput } from '../../types';
import { DataTable, type Column } from '../../components/table/DataTable';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import './AdminAcademic.css';

export const AcademicYearsManager: React.FC = () => {
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filter state
  const [currentFilter, setCurrentFilter] = useState<'all' | 'true' | 'false'>('all');

  // Modal & Form state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingYear, setEditingYear] = useState<AcademicYear | null>(null);
  const [formData, setFormData] = useState<AcademicYearInput>({
    name: '',
    start_date: '',
    end_date: '',
    is_current: false,
  });
  const [formSubmitting, setFormSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Confirm delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<AcademicYear | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<boolean>(false);

  // Confirm set current dialog state
  const [setCurrentTarget, setSetCurrentTarget] = useState<AcademicYear | null>(null);
  const [setCurrentLoading, setSetCurrentLoading] = useState<boolean>(false);

  const loadAcademicYears = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const isCurrentParam =
        currentFilter === 'true' ? true : currentFilter === 'false' ? false : undefined;
      const res = await academicApi.getAcademicYears({ is_current: isCurrentParam });
      setAcademicYears(res.academic_years);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load academic years.');
    } finally {
      setLoading(false);
    }
  }, [currentFilter]);

  useEffect(() => {
    loadAcademicYears();
  }, [loadAcademicYears]);

  const openCreateModal = () => {
    setEditingYear(null);
    setFormData({
      name: '',
      start_date: '',
      end_date: '',
      is_current: false,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (year: AcademicYear) => {
    setEditingYear(year);
    setFormData({
      name: year.name,
      start_date: year.start_date,
      end_date: year.end_date,
      is_current: year.is_current,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.start_date || !formData.end_date) {
      setFormError('Please fill in all required fields.');
      return;
    }
    if (new Date(formData.start_date) >= new Date(formData.end_date)) {
      setFormError('Start date must be before end date.');
      return;
    }

    setFormSubmitting(true);
    setFormError(null);
    try {
      if (editingYear) {
        const res = await academicApi.updateAcademicYear(editingYear.id, formData);
        setSuccessMessage(res.message);
      } else {
        const res = await academicApi.createAcademicYear(formData);
        setSuccessMessage(res.message);
      }
      setIsModalOpen(false);
      loadAcademicYears();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Operation failed.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const res = await academicApi.deleteAcademicYear(deleteTarget.id);
      setSuccessMessage(res.message);
      setDeleteTarget(null);
      loadAcademicYears();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete academic year.');
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleSetCurrentConfirm = async () => {
    if (!setCurrentTarget) return;
    setSetCurrentLoading(true);
    try {
      const res = await academicApi.setAcademicYearCurrent(setCurrentTarget.id);
      setSuccessMessage(res.message);
      setSetCurrentTarget(null);
      loadAcademicYears();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set academic year as current.');
      setSetCurrentTarget(null);
    } finally {
      setSetCurrentLoading(false);
    }
  };

  const columns: Column<AcademicYear>[] = [
    {
      id: 'name',
      header: 'Academic Year',
      sortable: true,
      accessor: (row) => (
        <div className="academic-admin__year-name">
          <span>{row.name}</span>
          {row.is_current && (
            <span className="academic-admin__status academic-admin__status--current">
              <AppIcon name="circleCheck" aria-hidden="true" />
              Current Active
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'dates',
      header: 'Calendar Span',
      sortable: true,
      accessor: (row) => (
        <span className="academic-admin__date-range">
          <AppIcon name="calendarDays" aria-hidden="true" />{' '}
          {row.start_date} &rarr; {row.end_date}
        </span>
      ),
    },
    {
      id: 'stats',
      header: 'Linked Records',
      accessor: (row) => (
        <div className="academic-admin__linked-records">
          <span title="Terms count">
            <AppIcon name="calendarDays" aria-hidden="true" />{' '}
            {row.terms_count ?? 0} Terms
          </span>
          <span title="Classes count">
            <AppIcon name="building" aria-hidden="true" />{' '}
            {row.classes_count ?? 0} Classes
          </span>
          <span title="Quizzes count">
            <AppIcon name="badgeHelp" aria-hidden="true" />{' '}
            {row.quizzes_count ?? 0} Quizzes
          </span>
        </div>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      accessor: (row) => (
        <div className="academic-admin__row-actions">
          {!row.is_current && (
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => setSetCurrentTarget(row)}
              title="Set as Current School Year"
            >
              <AppIcon name="circleCheck" className="core-space--margin-end-1" />
              Set Current
            </Button>
          )}
          <Button
            variant="outline-primary"
            size="sm"
            onClick={() => openEditModal(row)}
            title="Edit Academic Year"
          >
            <AppIcon name="pencil" />
          </Button>
          <Button
            variant="outline-danger"
            size="sm"
            onClick={() => setDeleteTarget(row)}
            disabled={Boolean((row.terms_count ?? 0) > 0 || (row.classes_count ?? 0) > 0)}
            title={
              (row.terms_count ?? 0) > 0 || (row.classes_count ?? 0) > 0
                ? 'Cannot delete year with associated records'
                : 'Delete Academic Year'
            }
          >
            <AppIcon name="trash" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="academic-admin">
      <header className="academic-admin__heading">
        <div>
          <p className="academic-admin__eyebrow">SCHOOL CALENDAR</p>
          <h1>Academic Years</h1>
          <p className="academic-admin__description">
            Configure school academic sessions, schedule ranges, and active calendar periods.
          </p>
        </div>

        <div className="academic-admin__heading-actions">
          <Button variant="primary" size="sm" onClick={openCreateModal}>
            <AppIcon name="plus" className="core-space--margin-end-1" />
            New Academic Year
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

      {/* Filter Toolbar */}
      <section className="academic-admin__toolbar" aria-label="Academic year filters">
          <div className="academic-admin__filter-group">
            <span className="academic-admin__filter-label">Filter status</span>
            <div className="academic-admin__segmented" role="group" aria-label="Filter by status">
              <button
                type="button"
                className={currentFilter === 'all' ? 'is-selected' : ''}
                aria-pressed={currentFilter === 'all'}
                onClick={() => setCurrentFilter('all')}
              >
                All
              </button>
              <button
                type="button"
                className={currentFilter === 'true' ? 'is-selected' : ''}
                aria-pressed={currentFilter === 'true'}
                onClick={() => setCurrentFilter('true')}
              >
                Current Active
              </button>
              <button
                type="button"
                className={currentFilter === 'false' ? 'is-selected' : ''}
                aria-pressed={currentFilter === 'false'}
                onClick={() => setCurrentFilter('false')}
              >
                Past / Inactive
              </button>
            </div>
          </div>

          <Button
            variant="outline-secondary"
            size="sm"
            onClick={loadAcademicYears}
            loading={loading}
          >
            <AppIcon name="refresh" aria-hidden="true" />{' '}
            Refresh
          </Button>
      </section>

      <div className="academic-admin__table">
          <DataTable
            data={academicYears}
            columns={columns}
            keyExtractor={(row) => row.id}
            loading={loading}
            emptyTitle="No academic years found."
            searchPlaceholder="Search academic years..."
          />
      </div>

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingYear ? `Edit Academic Year: ${editingYear.name}` : 'Create Academic Year'}
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
              {editingYear ? 'Save Changes' : 'Create Year'}
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
            <label htmlFor="year-name" className="core-field__label">
              Academic Year Name <span className="core-field__required">*</span>
            </label>
            <input
              id="year-name"
              type="text"
              className="core-input"
              placeholder="e.g. 2026/2027"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
            <div className="core-field__helper">Common format: 2025/2026 or 2026.</div>
          </div>

          <div className="academic-admin__date-fields">
            <div className="academic-admin__field">
              <label htmlFor="year-start-date" className="core-field__label">
                Start Date <span className="core-field__required">*</span>
              </label>
              <input
                id="year-start-date"
                type="date"
                className="core-input"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                required
              />
            </div>
            <div className="academic-admin__field">
              <label htmlFor="year-end-date" className="core-field__label">
                End Date <span className="core-field__required">*</span>
              </label>
              <input
                id="year-end-date"
                type="date"
                className="core-input"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="academic-admin__switch-field">
            <input
              id="year-is-current"
              className="academic-admin__switch"
              type="checkbox"
              role="switch"
              checked={formData.is_current}
              onChange={(e) => setFormData({ ...formData, is_current: e.target.checked })}
            />
            <label htmlFor="year-is-current">
              Set as Current Active Academic Year
            </label>
            <div className="core-field__helper">
              Activating this year automatically archives previous sessions across the school.
            </div>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Academic Year"
        message={
          <div>
            Are you sure you want to permanently delete academic year{' '}
            <strong>{deleteTarget?.name}</strong>?
            <p className="academic-admin__confirmation-note">This action cannot be undone.</p>
          </div>
        }
        confirmLabel="Delete Year"
        confirmVariant="danger"
        loading={deleteLoading}
      />

      {/* Set Current Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(setCurrentTarget)}
        onClose={() => setSetCurrentTarget(null)}
        onConfirm={handleSetCurrentConfirm}
        title="Activate Academic Year"
        message={
          <div>
            Set <strong>{setCurrentTarget?.name}</strong> as the active academic year for the school?
            <p className="academic-admin__confirmation-note">
              All active classes, reports, and grading workflows will default to this session.
            </p>
          </div>
        }
        confirmLabel="Set as Current"
        confirmVariant="primary"
        loading={setCurrentLoading}
      />
    </div>
  );
};
