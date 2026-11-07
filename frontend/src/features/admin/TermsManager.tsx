import React, { useEffect, useState, useCallback } from 'react';
import { academicApi } from '../../api/academic';
import type { Term, TermInput, StructureLookups } from '../../types';
import { DataTable, type Column } from '../../components/table/DataTable';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import './AdminAcademic.css';

export const TermsManager: React.FC = () => {
  const [terms, setTerms] = useState<Term[]>([]);
  const [lookups, setLookups] = useState<StructureLookups | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filter state
  const [selectedYearId, setSelectedYearId] = useState<number | 'all'>('all');

  // Modal & Form state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingTerm, setEditingTerm] = useState<Term | null>(null);
  const [formData, setFormData] = useState<TermInput>({
    academic_year_id: 0,
    term_number: 1,
    start_date: '',
    end_date: '',
    is_current: false,
  });
  const [formSubmitting, setFormSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Confirm delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<Term | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<boolean>(false);

  // Confirm set current dialog state
  const [setCurrentTarget, setSetCurrentTarget] = useState<Term | null>(null);
  const [setCurrentLoading, setSetCurrentLoading] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [lookupRes, termsRes] = await Promise.all([
        academicApi.getStructureLookups(),
        academicApi.getTerms(selectedYearId === 'all' ? undefined : selectedYearId),
      ]);
      setLookups(lookupRes);
      setTerms(termsRes.terms);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load terms data.');
    } finally {
      setLoading(false);
    }
  }, [selectedYearId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreateModal = () => {
    const defaultYear =
      selectedYearId !== 'all'
        ? selectedYearId
        : lookups?.academic_years.find((y) => y.is_current)?.id ||
          lookups?.academic_years[0]?.id ||
          0;

    setEditingTerm(null);
    setFormData({
      academic_year_id: defaultYear,
      term_number: 1,
      start_date: '',
      end_date: '',
      is_current: false,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (term: Term) => {
    setEditingTerm(term);
    setFormData({
      academic_year_id: term.academic_year_id,
      term_number: term.term_number,
      start_date: term.start_date,
      end_date: term.end_date,
      is_current: term.is_current,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.academic_year_id || !formData.start_date || !formData.end_date) {
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
      if (editingTerm) {
        const res = await academicApi.updateTerm(editingTerm.id, formData);
        setSuccessMessage(res.message);
      } else {
        const res = await academicApi.createTerm(formData);
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

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const res = await academicApi.deleteTerm(deleteTarget.id);
      setSuccessMessage(res.message);
      setDeleteTarget(null);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete term.');
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleSetCurrentConfirm = async () => {
    if (!setCurrentTarget) return;
    setSetCurrentLoading(true);
    try {
      const res = await academicApi.setTermCurrent(setCurrentTarget.id);
      setSuccessMessage(res.message);
      setSetCurrentTarget(null);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set term as current.');
      setSetCurrentTarget(null);
    } finally {
      setSetCurrentLoading(false);
    }
  };

  const columns: Column<Term>[] = [
    {
      id: 'term_name',
      header: 'Term',
      sortable: true,
      accessor: (row) => (
        <div className="academic-admin__year-name">
          <span>{row.term_display || `Term ${row.term_number}`}</span>
          {row.is_current && (
            <span className="academic-admin__status academic-admin__status--current">
              <i className="bi bi-check-circle-fill" aria-hidden="true" />
              Active Term
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'academic_year',
      header: 'Academic Year',
      sortable: true,
      accessor: (row) => (
        <span className="academic-admin__status academic-admin__status--year">
          <i className="bi bi-calendar3" aria-hidden="true" />{' '}
          {row.academic_year_name}
        </span>
      ),
    },
    {
      id: 'dates',
      header: 'Term Dates',
      sortable: true,
      accessor: (row) => (
        <span className="academic-admin__date-range">
          <i className="bi bi-clock" aria-hidden="true" />{' '}
          {row.start_date} &rarr; {row.end_date}
        </span>
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
              title="Set as Current Active Term"
            >
              <i className="bi bi-check2-circle me-1" />
              Set Current
            </Button>
          )}
          <Button
            variant="outline-primary"
            size="sm"
            onClick={() => openEditModal(row)}
            title="Edit Term"
          >
            <i className="bi bi-pencil" />
          </Button>
          <Button
            variant="outline-danger"
            size="sm"
            onClick={() => setDeleteTarget(row)}
            title="Delete Term"
          >
            <i className="bi bi-trash" />
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
          <h1>Academic Terms</h1>
          <p className="academic-admin__description">
            Manage school terms, exam cycles, and operational date windows.
          </p>
        </div>

        <div className="academic-admin__heading-actions">
          <Button variant="primary" size="sm" onClick={openCreateModal}>
            <i className="bi bi-plus-lg me-1" />
            New Term
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
      <section className="academic-admin__toolbar" aria-label="Term filters">
          <div className="academic-admin__filter-group">
              <label htmlFor="filter-year" className="academic-admin__filter-label">
                Academic Year:
              </label>
              <select
                id="filter-year"
                className="core-select academic-admin__year-filter"
                value={selectedYearId}
                onChange={(e) =>
                  setSelectedYearId(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
              >
                <option value="all">All Academic Years</option>
                {lookups?.academic_years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name} {y.is_current ? '(Current)' : ''}
                  </option>
                ))}
              </select>
          </div>

          <Button
            variant="outline-secondary"
            size="sm"
            onClick={loadData}
            loading={loading}
          >
            <i className="bi bi-arrow-repeat" aria-hidden="true" />{' '}
            Refresh
          </Button>
      </section>

      <div className="academic-admin__table">
          <DataTable
            data={terms}
            columns={columns}
            keyExtractor={(row) => row.id}
            loading={loading}
            emptyTitle="No terms found."
            searchPlaceholder="Search terms..."
          />
      </div>

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingTerm ? `Edit Term: ${editingTerm.term_display}` : 'Create New Term'}
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
              {editingTerm ? 'Save Changes' : 'Create Term'}
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
            <label htmlFor="term-year" className="core-field__label">
              Academic Year <span className="core-field__required">*</span>
            </label>
            <select
              id="term-year"
              className="core-select"
              value={formData.academic_year_id}
              onChange={(e) =>
                setFormData({ ...formData, academic_year_id: Number(e.target.value) })
              }
              required
            >
              <option value="">Select Academic Year</option>
              {lookups?.academic_years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name} {y.is_current ? '(Current Session)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="academic-admin__field">
            <label htmlFor="term-number" className="core-field__label">
              Term Selection <span className="core-field__required">*</span>
            </label>
            <select
              id="term-number"
              className="core-select"
              value={formData.term_number}
              onChange={(e) =>
                setFormData({ ...formData, term_number: Number(e.target.value) })
              }
              required
            >
              <option value={1}>Term 1</option>
              <option value={2}>Term 2</option>
              <option value={3}>Term 3</option>
            </select>
          </div>

          <div className="academic-admin__date-fields">
            <div className="academic-admin__field">
              <label htmlFor="term-start-date" className="core-field__label">
                Start Date <span className="core-field__required">*</span>
              </label>
              <input
                id="term-start-date"
                type="date"
                className="core-input"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                required
              />
            </div>
            <div className="academic-admin__field">
              <label htmlFor="term-end-date" className="core-field__label">
                End Date <span className="core-field__required">*</span>
              </label>
              <input
                id="term-end-date"
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
              id="term-is-current"
              className="academic-admin__switch"
              type="checkbox"
              role="switch"
              checked={formData.is_current}
              onChange={(e) => setFormData({ ...formData, is_current: e.target.checked })}
            />
            <label htmlFor="term-is-current">
              Set as Current Active Term
            </label>
            <div className="core-field__helper">
              Active term sets default scoping for quiz attempts, report cards, and grading.
            </div>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Term"
        message={
          <div>
            Are you sure you want to permanently delete{' '}
            <strong>{deleteTarget?.term_display}</strong> ({deleteTarget?.academic_year_name})?
            <p className="academic-admin__confirmation-note">This action cannot be undone.</p>
          </div>
        }
        confirmLabel="Delete Term"
        confirmVariant="danger"
        loading={deleteLoading}
      />

      {/* Set Current Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(setCurrentTarget)}
        onClose={() => setSetCurrentTarget(null)}
        onConfirm={handleSetCurrentConfirm}
        title="Activate Term"
        message={
          <div>
            Set <strong>{setCurrentTarget?.term_display}</strong> (
            {setCurrentTarget?.academic_year_name}) as the active term for the school?
          </div>
        }
        confirmLabel="Set as Current"
        confirmVariant="primary"
        loading={setCurrentLoading}
      />
    </div>
  );
};
