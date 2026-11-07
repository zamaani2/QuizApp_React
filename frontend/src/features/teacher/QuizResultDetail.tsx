import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchTeacherResult } from '../../api/teacher';
import type { TeacherResultDetail } from '../../types';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';

export const QuizResultDetail: React.FC = () => {
  const { attemptId } = useParams<{ attemptId: string }>();
  const id = Number(attemptId);
  const [result, setResult] = useState<TeacherResultDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await fetchTeacherResult(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load quiz result.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);
  if (loading && !result) return <LoadingSpinner size="lg" message="Loading result..." />;

  return (
    <div className="assessment-page container-fluid py-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <Link to="/teacher/results">&larr; Back to results</Link>
        <div className="d-flex gap-2">
          <Button size="sm" variant="secondary" onClick={load} disabled={loading}>Refresh</Button>
          {result && <Link className="btn btn-sm btn-outline-primary" to={`/teacher/results/${result.id}/print`}>Print</Link>}
        </div>
      </div>
      {error && <Alert variant="danger" dismissible onDismiss={() => setError(null)}>{error}</Alert>}
      {result && (
        <>
          <h1 className="h3">{result.quiz_title}</h1>
          <p className="text-muted">{result.student_name} · {result.admission_number} · Submitted {result.submitted_at ? new Date(result.submitted_at).toLocaleString() : '—'}</p>
          <div className="card shadow-sm border-0 mb-4">
            <div className="card-body d-flex flex-wrap gap-4">
              <div><div className="small text-muted">Score</div><strong>{result.score}/{result.total_marks}</strong></div>
              <div><div className="small text-muted">Percentage</div><strong>{result.percentage}%</strong></div>
              <div><div className="small text-muted">Grading</div><strong>{result.is_graded ? 'Complete' : 'Pending'}</strong></div>
            </div>
          </div>
          {result.responses.map((response, index) => (
            <section className="card shadow-sm border-0 mb-3" key={response.id}>
              <div className="card-header bg-white d-flex justify-content-between">
                <strong>Question {index + 1}</strong>
                <span>{response.marks_awarded}/{response.marks} marks</span>
              </div>
              <div className="card-body">
                <p className="fw-semibold">{response.question_text}</p>
                <p><strong>Student answer: </strong>
                  {response.selected_choices.length
                    ? response.selected_choices.join(', ')
                    : response.selected_choice || response.text_answer || 'No answer'}
                </p>
                {response.correct_choices.length > 0 && <p><strong>Correct choice(s): </strong>{response.correct_choices.join(', ')}</p>}
                {response.answer_key && <p><strong>Answer key: </strong>{response.answer_key}</p>}
                <p className={`mb-1 ${response.is_correct ? 'text-success' : 'text-danger'}`}>{response.is_correct ? 'Correct' : 'Incorrect'}</p>
                {response.grading_notes && <p className="text-muted mb-0"><strong>Grading notes: </strong>{response.grading_notes}</p>}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
};
