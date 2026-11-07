import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchGradingAttempt, updateQuizResponseGrade } from '../../api/teacher';
import type { GradingAttemptData } from '../../types';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';

export const GradingAttempt: React.FC = () => {
  const { attemptId } = useParams<{ attemptId: string }>();
  const id = Number(attemptId);
  const [attempt, setAttempt] = useState<GradingAttemptData | null>(null);
  const [scores, setScores] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchGradingAttempt(id);
      setAttempt(data);
      setScores(Object.fromEntries(data.responses.map((response) => [response.id, String(response.marks_awarded)])));
      setNotes(Object.fromEntries(data.responses.map((response) => [response.id, response.grading_notes])));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load submission for grading.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function submitGrade(responseId: number) {
    const marks = Number(scores[responseId]);
    if (!Number.isFinite(marks) || marks < 0) {
      setError('Enter a valid non-negative mark.');
      return;
    }
    setSavingId(responseId);
    setError(null);
    setMessage(null);
    try {
      const result = await updateQuizResponseGrade(responseId, marks, notes[responseId] ?? '');
      setMessage(result.message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save grade.');
    } finally {
      setSavingId(null);
    }
  }

  if (loading && !attempt) return <LoadingSpinner size="lg" message="Loading submission..." />;
  return (
    <div className="assessment-page container-fluid py-4">
      <div className="mb-3"><Link to="/teacher/grading">&larr; Back to grading queue</Link></div>
      <h1 className="h3">{attempt?.student_name ?? 'Submission'}</h1>
      {attempt && <p className="text-muted">{attempt.quiz_title} · {attempt.admission_number} · Current score {attempt.score}/{attempt.total_marks}</p>}
      {error && <Alert variant="danger" dismissible onDismiss={() => setError(null)}>{error}</Alert>}
      {message && <Alert variant="success" dismissible onDismiss={() => setMessage(null)}>{message}</Alert>}
      {attempt && (attempt.responses.length ? attempt.responses.map((response, index) => (
        <section className="card shadow-sm border-0 mb-3" key={response.id}>
          <div className="card-header bg-white d-flex justify-content-between">
            <strong>Essay response {index + 1}</strong>
            <span className="badge bg-secondary">{response.is_graded ? 'Graded' : 'Needs grading'}</span>
          </div>
          <div className="card-body">
            <p className="fw-semibold">{response.question_text}</p>
            <div className="bg-light rounded p-3 mb-3" style={{ whiteSpace: 'pre-wrap' }}>{response.text_answer || 'No response provided.'}</div>
            <div className="row g-3">
              <div className="col-md-3">
                <label className="form-label" htmlFor={`marks-${response.id}`}>Marks (maximum {response.question_marks})</label>
                <input id={`marks-${response.id}`} className="form-control" type="number" min="0" max={response.question_marks} step="0.1" value={scores[response.id] ?? '0'} onChange={(event) => setScores((current) => ({ ...current, [response.id]: event.target.value }))} />
              </div>
              <div className="col-md-9">
                <label className="form-label" htmlFor={`notes-${response.id}`}>Grading notes</label>
                <textarea id={`notes-${response.id}`} className="form-control" rows={2} value={notes[response.id] ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [response.id]: event.target.value }))} />
              </div>
            </div>
          </div>
          <div className="card-footer bg-white text-end">
            <Button onClick={() => void submitGrade(response.id)} loading={savingId === response.id}>Save grade</Button>
          </div>
        </section>
      )) : <Alert variant="info">There are no essay responses to grade in this submission.</Alert>)}
      {loading && <LoadingSpinner message="Refreshing grades..." />}
    </div>
  );
};
