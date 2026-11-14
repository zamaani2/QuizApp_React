import { useEffect, useState, type ChangeEvent, type FC, type FormEvent } from 'react';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import type { StructureLookups } from '../../types';
import {
  bulkImportTeachers,
  previewTeacherImport,
  type TeacherImportResult,
} from '../../api/admin';

const IMPORT_FIELDS = [
  { id: 'full_name', label: 'Full name', required: true },
  { id: 'contact_number', label: 'Contact number', required: true },
  { id: 'gender', label: 'Gender', required: false },
  { id: 'email', label: 'Email', required: false },
  { id: 'department', label: 'Department', required: false },
] as const;

interface TeacherImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: (result: TeacherImportResult) => void;
  lookups: StructureLookups | null;
  schoolId?: number;
}

export const TeacherImportDialog: FC<TeacherImportDialogProps> = ({
  isOpen,
  onClose,
  onImported,
  lookups,
  schoolId,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Array<Record<string, string>>>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [defaultDepartment, setDefaultDepartment] = useState<number | ''>('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TeacherImportResult | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setFile(null);
    setHeaders([]);
    setPreviewRows([]);
    setMappings({});
    setDefaultDepartment('');
    setError(null);
    setResult(null);
  }, [isOpen]);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] || null;
    setFile(selectedFile);
    setHeaders([]);
    setPreviewRows([]);
    setMappings({});
    setResult(null);
    setError(null);
    if (!selectedFile) return;

    setLoadingPreview(true);
    try {
      const response = await previewTeacherImport(selectedFile);
      setHeaders(response.headers);
      setPreviewRows(response.preview_rows);
      const normalizedHeaders = new Map(
        response.headers.map((header) => [header.trim().toLowerCase(), header])
      );
      setMappings(Object.fromEntries(IMPORT_FIELDS.map((field) => [
        field.id,
        normalizedHeaders.get(field.id.replace(/_/g, ' ')) ||
          normalizedHeaders.get(field.id) ||
          '',
      ])));
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'Could not preview this file.');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleImport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) {
      setError('Choose a CSV or XLSX file first.');
      return;
    }
    const missingMapping = IMPORT_FIELDS.find((field) => field.required && !mappings[field.id]);
    if (missingMapping) {
      setError(`Map the required ${missingMapping.label.toLowerCase()} column before importing.`);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await bulkImportTeachers(
        file,
        mappings,
        schoolId,
        defaultDepartment === '' ? undefined : defaultDepartment
      );
      setResult(response);
      onImported(response);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Import failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Import teachers"
      size="lg"
      footer={result ? (
        <div className="core-modal__actions">
          <Button variant="primary" size="sm" onClick={onClose}>Close</Button>
        </div>
      ) : (
        <div className="core-modal__actions">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button
            variant="primary"
            size="sm"
            type={headers.length ? 'submit' : 'button'}
            form={headers.length ? 'teacher-import-form' : undefined}
            onClick={headers.length ? undefined : () => document.getElementById('teacher-import-file')?.click()}
            loading={submitting || loadingPreview}
            disabled={!file || loadingPreview}
          >
            {headers.length ? 'Import teachers' : 'Preview file'}
          </Button>
        </div>
      )}
    >
      {result ? (
        <div className="student-import-result">
          <Alert variant={result.errors.length ? 'warning' : 'success'} title="Import complete">
            {result.message}
          </Alert>
          {result.errors.length > 0 && (
            <ul className="student-import-result__errors">
              {result.errors.map((message, index) => <li key={`${index}-${message}`}>{message}</li>)}
            </ul>
          )}
        </div>
      ) : (
        <form id="teacher-import-form" className="student-import" onSubmit={handleImport}>
          {error && <Alert variant="danger">{error}</Alert>}
          <div className="student-import__downloads">
            <a href="/teachers/bulk-import/template/csv/">Download CSV template</a>
            <a href="/teachers/bulk-import/template/xlsx/">Download XLSX template</a>
          </div>
          <label className="core-field">
            <span className="core-field__label">Teacher data file</span>
            <input
              id="teacher-import-file"
              className="core-input"
              type="file"
              accept=".csv,.xlsx"
              onChange={(event) => void handleFileChange(event)}
            />
            <span className="core-field__helper">
              Full name and contact number are required. Optional columns include gender, email, and department.
            </span>
          </label>
          {headers.length > 0 && (
            <>
              <div className="student-import__mapping">
                <h3>Map file columns</h3>
                <div className="student-import__mapping-grid">
                  {IMPORT_FIELDS.map((field) => (
                    <label className="core-field" key={field.id}>
                      <span className="core-field__label">
                        {field.label}{field.required ? ' *' : ''}
                      </span>
                      <select
                        className="core-select"
                        value={mappings[field.id] || ''}
                        onChange={(event) => setMappings({ ...mappings, [field.id]: event.target.value })}
                      >
                        <option value="">{field.required ? 'Select column' : 'Skip field'}</option>
                        {headers.map((header) => <option key={header} value={header}>{header}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              </div>
              <label className="core-field">
                <span className="core-field__label">Default department (optional)</span>
                <select
                  className="core-select"
                  value={defaultDepartment}
                  onChange={(event) => setDefaultDepartment(event.target.value ? Number(event.target.value) : '')}
                >
                  <option value="">No default department</option>
                  {lookups?.departments.map((department) => (
                    <option key={department.id} value={department.id}>{department.name}</option>
                  ))}
                </select>
              </label>
              <div className="student-import__preview">
                <h3>Preview</h3>
                <div className="student-import__preview-table">
                  <table>
                    <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
                    <tbody>
                      {previewRows.map((row, index) => (
                        <tr key={index}>{headers.map((header) => <td key={header}>{row[header] || '—'}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </form>
      )}
    </Modal>
  );
};
