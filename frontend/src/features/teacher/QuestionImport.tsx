import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { importQuizQuestions } from '../../api/teacher';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';

export const QuestionImport: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const quizId = Number(id);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    try {
      const result = await importQuizQuestions(quizId, formData);
      setMessage(`${result.message}${result.errors?.length ? ` ${result.errors.length} row(s) need attention.` : ''}`);
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
      <div className="core-card core-shadow--sm core-border--none">
        <form onSubmit={handleSubmit}>
          <div className="core-card__body">
            <label className="core-field__label" htmlFor="question-import-file">Question file</label>
            <input id="question-import-file" className="core-field__input" type="file" accept=".csv,.xlsx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            <div className="core-display-flex core-layout--gap-3 core-space--margin-top-3">
              <a href={`/quizzes/${quizId}/questions/import-template/csv/`} className="link-primary">Download CSV template</a>
              <a href={`/quizzes/${quizId}/questions/import-template/xlsx/`} className="link-primary">Download XLSX template</a>
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
