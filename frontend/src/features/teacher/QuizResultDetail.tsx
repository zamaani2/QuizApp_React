import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchTeacherResult } from '../../api/teacher';
import type { TeacherResultDetail } from '../../types';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { getQuestionType } from '../../question-types';

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
    <div className="assessment-page core-container core-space--padding-y-4">
      <div className="core-display-flex core-layout--justify-between core-layout--align-center core-space--margin-bottom-3">
        <Link to="/teacher/results">&larr; Back to results</Link>
        <div className="core-display-flex core-layout--gap-2">
          <Button size="sm" variant="secondary" onClick={load} disabled={loading}>Refresh</Button>
          {result && <Link className="core-button core-button--sm core-button--outline-primary" to={`/teacher/results/${result.id}/print`}>Print</Link>}
        </div>
      </div>
      {error && <Alert variant="danger" dismissible onDismiss={() => setError(null)}>{error}</Alert>}
      {result && (
        <>
          <h1 className="core-type--heading-3">{result.quiz_title}</h1>
          <p className="core-text--muted">{result.student_name} · {result.admission_number} · Submitted {result.submitted_at ? new Date(result.submitted_at).toLocaleString() : '—'}</p>
          <div className="core-card core-shadow--sm core-border--none core-space--margin-bottom-4">
            <div className="core-card__body core-display-flex core-layout--wrap core-layout--gap-4">
              <div><div className="core-type--small core-text--muted">Score</div><strong>{result.score}/{result.total_marks}</strong></div>
              <div><div className="core-type--small core-text--muted">Percentage</div><strong>{result.percentage}%</strong></div>
              <div><div className="core-type--small core-text--muted">Grading</div><strong>{result.is_graded ? 'Complete' : 'Pending'}</strong></div>
            </div>
          </div>
          {result.section_scores && result.section_scores.length > 0 && (
            <section className="core-card core-shadow--sm core-border--none core-space--margin-bottom-4" aria-label="Section scores">
              <div className="core-card__body">
                <h2 className="core-type--heading-5">Section scores</h2>
                {result.section_scores.map((section) => (
                  <div key={section.section_id} className="core-display-flex core-layout--justify-between core-border-bottom core-space--padding-y-2">
                    <span>{section.title}</span>
                    <strong>{section.score} / {section.total_marks}</strong>
                  </div>
                ))}
              </div>
            </section>
          )}
          {result.responses.map((response, index) => (
            <section className="core-card core-shadow--sm core-border--none core-space--margin-bottom-3" key={response.id}>
              <div className="core-card__header core-surface--white core-display-flex core-layout--justify-between">
                <strong>Question {index + 1}</strong>
                <span>{response.marks_awarded}/{response.marks} marks</span>
              </div>
              <div className="core-card__body">
                <p className="question-review__question-title">{response.question_text}</p>
                {(() => {
                  const Review = getQuestionType(response.question_type).Review;
                  return (
                    <Review
                      answer={response.review_data?.student_answer
                        ?? (response.selected_choices.length
                          ? response.selected_choices
                          : response.selected_choice || response.text_answer)}
                      correctAnswer={response.review_data?.correct_answer
                        ?? (response.correct_choices.length
                          ? response.correct_choices
                          : response.answer_key)}
                      showCorrectAnswers
                    />
                  );
                })()}
                <p className={`core-space--margin-bottom-1 ${response.is_correct ? 'core-text--success' : 'core-text--danger'}`}>{response.is_correct ? 'Correct' : 'Incorrect'}</p>
                {response.grading_notes && <p className="core-text--muted core-space--margin-bottom-0"><strong>Grading notes: </strong>{response.grading_notes}</p>}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
};
