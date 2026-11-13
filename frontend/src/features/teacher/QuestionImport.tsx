import React, { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  importQuizQuestions,
  previewQuizQuestions,
  type QuestionImportPreview,
} from '../../api/teacher';
import { ApiError } from '../../types';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import './QuestionImport.css';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_TYPES = '.csv,.xlsx';

const FORMAT_ROWS = [
  {
    type: 'Multiple choice',
    example: ['What is 2 + 2?', 'multiple_choice', '1', 'easy', '2', '3', '4', '', '', 'The answer is 4.'],
    hint: 'Correct answer is a 1-based choice number or exact choice text. Separate multiple correct answers with commas.',
  },
  {
    type: 'True / False',
    example: ['The Earth orbits the Sun.', 'true_false', '1', 'easy', 'true', '', '', '', '', 'This is true.'],
    hint: 'Use true or false in correct_answer.',
  },
  {
    type: 'Short answer',
    example: ['Name the largest planet.', 'short_answer', '1', 'medium', 'Jupiter|JUPITER', '', '', '', '', 'Jupiter is the largest planet.'],
    hint: 'Separate accepted answers with a semicolon or |.',
  },
  {
    type: 'Fill in the blank',
    example: ['The capital of England is _____.', 'fill_blank', '1', 'easy', 'London', '', '', '', '', 'London is the capital of England.'],
    hint: 'Use _____ for each blank; separate alternatives with | and blank groups with semicolons.',
  },
  {
    type: 'Matching',
    example: ['Match each item.', 'matching', '2', 'medium', 'Cat=Mammal; Rose=Flower', '', '', '', '', ''],
    hint: 'Enter at least two left=right pairs, separated by semicolons.',
  },
  {
    type: 'Ordering',
    example: ['Order the steps.', 'ordering', '2', 'medium', 'Plan; Build; Test', '', '', '', '', ''],
    hint: 'List at least two distinct items in correct order, separated by semicolons.',
  },
  {
    type: 'Essay',
    example: ['Explain your reasoning.', 'essay', '5', 'hard', '', '', '', '', '', 'Essay questions are manually graded.'],
    hint: 'Essay questions are manually graded; correct_answer can be left blank.',
  },
];

const TEMPLATE_HEADERS = [
  'question_text', 'question_type', 'marks', 'difficulty', 'correct_answer',
  'choice1', 'choice2', 'choice3', 'choice4', 'explanation',
];

interface ImportResult {
  imported: number;
  skipped: number;
}

export const QuestionImport: React.FC = () => {
  const { id, quizId: routeQuizId } = useParams<{ id?: string; quizId?: string }>();
  const quizId = Number(id ?? routeQuizId);
  const fileInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<QuestionImportPreview | null>(null);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [skipInvalid, setSkipInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);

  function chooseFile(nextFile: File | null) {
    setError(null);
    setStatus('');
    setPreview(null);
    setResult(null);
    setSkipInvalid(false);
    if (!nextFile) return;
    if (!/\.(csv|xlsx)$/i.test(nextFile.name)) {
      setFile(null);
      setError('Choose a CSV or XLSX file.');
      return;
    }
    if (nextFile.size > MAX_FILE_SIZE) {
      setFile(null);
      setError('Files must be 5 MB or smaller.');
      return;
    }
    setFile(nextFile);
    setStep(2);
    setStatus(`${nextFile.name} is ready to check.`);
  }

  async function checkFile() {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    setStatus('Checking file. No questions will be created.');
    try {
      const checked = await previewQuizQuestions(quizId, file);
      setPreview(checked);
      setErrorsOnly(false);
      setStatus(`Check complete. ${checked.summary.valid} valid and ${checked.summary.invalid} invalid ${checked.summary.invalid === 1 ? 'row' : 'rows'}. No questions were created.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Unable to check this file.');
      setStatus('');
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!file || !preview || busy || !preview.summary.valid) return;
    if (preview.summary.invalid > 0 && !skipInvalid) return;
    const formData = new FormData();
    formData.set('import_file', file);
    setBusy(true);
    setError(null);
    setStatus('Importing questions.');
    try {
      const imported = await importQuizQuestions(quizId, formData, skipInvalid);
      setResult({ imported: imported.imported, skipped: imported.skipped });
      const created = `${imported.imported} ${imported.imported === 1 ? 'question' : 'questions'}`;
      const skipped = imported.skipped
        ? ` and skipped ${imported.skipped} invalid ${imported.skipped === 1 ? 'row' : 'rows'}`
        : '';
      setStatus(`Import complete. Created ${created}${skipped}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Unable to import questions.');
      setStatus('');
    } finally {
      setBusy(false);
    }
  }

  function startAnotherImport() {
    setStep(1);
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setStatus('');
    setSkipInvalid(false);
    setErrorsOnly(false);
    if (fileInput.current) fileInput.current.value = '';
  }

  const visibleRows = (preview?.rows ?? []).filter((row) => !errorsOnly || row.status === 'invalid');

  return (
    <div className="assessment-page core-container core-space--padding-y-4 question-import">
      <div className="core-space--margin-bottom-3">
        <Link to={`/teacher/questions/${quizId}`}>&larr; Back to questions</Link>
      </div>
      <h1 className="core-type--heading-3 core-space--margin-bottom-2">Import questions</h1>
      <p className="core-text--muted core-space--margin-bottom-4">Check your file before importing. Preview never creates questions.</p>

      <ol className="question-import-steps" aria-label="Import steps">
        {['Format', 'Upload and check', 'Confirm'].map((label, index) => {
          const number = index + 1;
          return (
            <li key={label} className={step === number ? 'is-current' : step > number ? 'is-complete' : ''}>
              <span className="question-import-steps__number">{number}</span>
              <span>{label}</span>
            </li>
          );
        })}
      </ol>

      {error && <Alert variant="danger" dismissible onDismiss={() => setError(null)}>{error}</Alert>}
      <p className="question-import-sr-status" role="status" aria-live="polite">{status}</p>

      {step === 1 && !result && (
        <section className="core-card question-import-card" aria-labelledby="format-title">
          <div className="core-card__body">
            <h2 id="format-title" className="core-type--heading-5">Step 1: Format your file</h2>
            <details className="question-import-format" open>
              <summary>How to format your file</summary>
              <p>Every file needs question_text. question_type defaults to multiple_choice when blank. Marks must be a positive whole number; difficulty is easy, medium, or hard.</p>
              {FORMAT_ROWS.map((row) => (
                <section className="question-import-format-type" key={row.type} aria-labelledby={`format-${row.type.replace(/\W+/g, '-').toLowerCase()}`}>
                  <h3 id={`format-${row.type.replace(/\W+/g, '-').toLowerCase()}`}>{row.type}</h3>
                  <div className="question-import-table-wrap">
                    <table className="core-table question-import-format-table">
                      <caption className="core-visually-hidden">{row.type} import columns and example row</caption>
                      <thead><tr>{TEMPLATE_HEADERS.map((header) => <th scope="col" key={header}>{header}</th>)}</tr></thead>
                      <tbody><tr>{row.example.map((value, index) => <td key={index}><code>{value || '—'}</code></td>)}</tr></tbody>
                    </table>
                  </div>
                  <p>{row.hint}</p>
                </section>
              ))}
            </details>
            <div className="question-import-downloads">
              <a className="core-button core-button--outline-secondary" href={`/quizzes/${quizId}/questions/import-template/csv/`}>Download CSV template</a>
              <a className="core-button core-button--outline-secondary" href={`/quizzes/${quizId}/questions/import-template/xlsx/`}>Download XLSX template</a>
            </div>
            <div className="question-import-actions">
              <Button type="button" onClick={() => setStep(2)}>Continue to upload</Button>
            </div>
          </div>
        </section>
      )}

      {step === 2 && !result && (
        <section className="core-card question-import-card" aria-labelledby="upload-title">
          <div className="core-card__body">
            <h2 id="upload-title" className="core-type--heading-5">Step 2: Upload and check</h2>
            <p id="question-import-file-help">CSV or XLSX, up to 5 MB. Files can contain at most 5,000 question rows.</p>
            <input
              ref={fileInput}
              id="question-import-file"
              className="question-import-file-input"
              type="file"
              accept={ACCEPTED_TYPES}
              aria-label="Question file"
              aria-describedby="question-import-file-help"
              onChange={(event) => {
                chooseFile(event.target.files?.[0] ?? null);
                event.target.value = '';
              }}
            />
            <button
              className="question-import-dropzone"
              type="button"
              aria-describedby="question-import-file-help"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                chooseFile(event.dataTransfer.files[0] ?? null);
              }}
            >
              <strong>{file ? file.name : 'Drop your file here or choose a file'}</strong>
              <span>{file ? `${(file.size / 1024).toFixed(0)} KB · ${file.name.split('.').pop()?.toUpperCase()}` : 'CSV or XLSX · 5 MB maximum'}</span>
              <span className="core-button core-button--outline-secondary">Choose file</span>
            </button>
            {file && <Button type="button" loading={busy} onClick={() => void checkFile()}>Upload and check file</Button>}

            {preview && (
              <div className="question-import-preview" aria-labelledby="preview-title">
                <div className="question-import-preview__heading">
                  <div>
                    <h3 id="preview-title" className="core-type--heading-5">File check</h3>
                    <p className="question-import-counts" aria-live="polite">
                      {preview.summary.total} rows · {preview.summary.valid} valid · {preview.summary.invalid} invalid
                    </p>
                  </div>
                  <label className="core-field__check">
                    <input className="core-field__check-input" type="checkbox" checked={errorsOnly} onChange={(event) => setErrorsOnly(event.target.checked)} />
                    <span className="core-field__check-label">Errors only</span>
                  </label>
                </div>
                {preview.rows.length ? (
                  <div className="question-import-table-wrap">
                    <table className="core-table">
                      <thead><tr><th scope="col">Row</th><th scope="col">Type</th><th scope="col">Question preview</th><th scope="col">Status and errors</th></tr></thead>
                      <tbody>
                        {visibleRows.map((row) => (
                          <tr key={row.row}>
                            <th scope="row">{row.row}</th>
                            <td>{row.type.replace(/_/g, ' ')}</td>
                            <td>{row.text_preview || '—'}</td>
                            <td>
                              <span className={`question-import-status question-import-status--${row.status}`}>
                                {row.status === 'valid' ? 'Valid' : 'Invalid'}
                              </span>
                              {row.errors.length > 0 && (
                                <ul className="question-import-row-errors">
                                  {row.errors.map((rowError, index) => <li key={`${rowError.field}-${index}`}><strong>{rowError.field}:</strong> {rowError.message}</li>)}
                                </ul>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!visibleRows.length && <p>No invalid rows.</p>}
                  </div>
                ) : <p>The file contains no question rows.</p>}
                <div className="question-import-actions">
                  <Button type="button" variant="outline-secondary" onClick={() => setStep(1)}>Back to format</Button>
                  <Button type="button" disabled={!preview.summary.valid} onClick={() => setStep(3)}>Continue to confirm</Button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {step === 3 && preview && !result && (
        <section className="core-card question-import-card" aria-labelledby="confirm-title">
          <div className="core-card__body">
            <h2 id="confirm-title" className="core-type--heading-5">Step 3: Confirm import</h2>
            <p>Import {preview.summary.valid} valid {preview.summary.valid === 1 ? 'question' : 'questions'} from <strong>{file?.name}</strong>.</p>
            {preview.summary.invalid > 0 && (
              <div className="question-import-skip">
                <label className="core-field__check">
                  <input className="core-field__check-input" type="checkbox" checked={skipInvalid} onChange={(event) => setSkipInvalid(event.target.checked)} />
                  <span className="core-field__check-label">Skip {preview.summary.invalid} invalid {preview.summary.invalid === 1 ? 'row' : 'rows'} and import only the valid questions</span>
                </label>
              </div>
            )}
            <div className="question-import-actions">
              <Button type="button" variant="outline-secondary" onClick={() => setStep(2)}>Back to file check</Button>
              <Button type="button" loading={busy} disabled={!preview.summary.valid || (preview.summary.invalid > 0 && !skipInvalid)} onClick={() => void confirmImport()}>
                Import {preview.summary.valid} valid {preview.summary.valid === 1 ? 'question' : 'questions'}
              </Button>
            </div>
          </div>
        </section>
      )}

      {result && (
        <section className="core-card question-import-card" aria-labelledby="import-result-title">
          <div className="core-card__body">
            <h2 id="import-result-title" className="core-type--heading-5">Import complete</h2>
            <p role="status" aria-live="polite">Created {result.imported} {result.imported === 1 ? 'question' : 'questions'}{result.skipped ? ` and skipped ${result.skipped} invalid ${result.skipped === 1 ? 'row' : 'rows'}` : ''}.</p>
            <div className="question-import-actions">
              <Link className="core-button core-button--primary" to={`/teacher/questions/${quizId}`}>View questions</Link>
              <Button type="button" variant="outline-secondary" onClick={startAnotherImport}>Import another file</Button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
