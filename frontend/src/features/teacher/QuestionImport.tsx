import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { importQuizQuestions } from '../../api/teacher';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';

export const QuestionImport: React.FC = () => {
  const { id, quizId: routeQuizId } = useParams<{ id?: string; quizId?: string }>();
  const quizId = Number(id ?? routeQuizId);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [rowErrors, setRowErrors] = useState<string[]>([]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError('Choose a CSV or XLSX file to import.');
      return;
    }
    const formData = new FormData();
    formData.set('import_file', file);
    setBusy(true);
    setError(null);
    setMessage(null);
    setImportedCount(null);
    setRowErrors([]);
    try {
      const result = await importQuizQuestions(quizId, formData);
      setMessage(result.message);
      setImportedCount(result.imported);
      setRowErrors(result.errors ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to import questions.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="assessment-page core-container core-space--padding-y-4">
      <div className="core-space--margin-bottom-3"><Link to={`/teacher/quizzes/${quizId}`}>&larr; Back to quiz</Link></div>
      <h1 className="core-type--heading-3 core-space--margin-bottom-3">Import questions</h1>
      <p className="core-text--muted">Upload a CSV or XLSX file. Files larger than 5 MB are rejected.</p>
      {error && <Alert variant="danger">{error}</Alert>}
      {message && <Alert variant="success">{message}</Alert>}
      {importedCount !== null && (
        <p role="status">Created {importedCount} {importedCount === 1 ? 'question' : 'questions'}.{' '}
          <Link to={`/teacher/quizzes/${quizId}/questions`}>View questions</Link>
        </p>
      )}
      {rowErrors.length > 0 && (
        <section className="core-card core-space--margin-bottom-3" aria-labelledby="import-errors-title">
          <div className="core-card__body">
            <h2 id="import-errors-title" className="core-type--heading-5">{rowErrors.length} import row error{rowErrors.length === 1 ? '' : 's'}</h2>
            <table className="core-table">
              <thead><tr><th scope="col">Row</th><th scope="col">Field</th><th scope="col">Message</th></tr></thead>
              <tbody>{rowErrors.map((rowError, index) => {
                const match = rowError.match(/(?:row|line)\s*(\d+)(?:[^:]*:\s*)?(.*)/i);
                return <tr key={`${index}-${rowError}`}><td>{match?.[1] ?? '—'}</td><td>—</td><td>{match?.[2] || rowError}</td></tr>;
              })}</tbody>
            </table>
          </div>
        </section>
      )}
      <div className="core-card core-shadow--sm core-border--none">
        <form onSubmit={handleSubmit}>
          <div className="core-card__body">
            <label className="core-field__label" htmlFor="question-import-file">Question file</label>
            <input id="question-import-file" className="core-field__input" type="file" accept=".csv,.xlsx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            <div className="core-display-flex core-layout--gap-3 core-space--margin-top-3">
              <a href={`/quizzes/${quizId}/questions/import-template/csv/`} className="core-link">Download CSV template</a>
              <a href={`/quizzes/${quizId}/questions/import-template/xlsx/`} className="core-link">Download XLSX template</a>
            </div>
          </div>
          <div className="core-card__footer core-surface--white core-display-flex core-layout--justify-end">
            <Button type="submit" loading={busy} disabled={!file}>Import questions</Button>
          </div>
        </form>
      </div>
    </div>
  );
};
