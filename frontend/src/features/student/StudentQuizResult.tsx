import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { studentApi } from '../../api/student';
import type { StudentQuizResultData } from '../../types/student';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { Alert } from '../../components/common/Alert';
import './student.css';

export const StudentQuizResult: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [result, setResult] = useState<StudentQuizResultData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadResult = async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const res = await studentApi.getStudentQuizResult(Number(id));
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quiz results.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadResult();
  }, [id]);

  if (loading) {
    return (
      <div className="d-flex justify-content-center py-5" data-testid="student-quiz-result-loading">
        <LoadingSpinner size="lg" message="Loading your assessment results..." />
      </div>
    );
  }

  if (error || !result) {
    return (
      <div data-testid="student-quiz-result-error">
        <Alert variant="danger" dismissible={false}>
          <h5>Unable to load results</h5>
          <p className="mb-2">{error || 'Result details could not be retrieved.'}</p>
          <div className="d-flex gap-2">
            <button className="stu-btn-outline" onClick={loadResult}>
              Retry
            </button>
            <Link to="/student/attempts" className="stu-btn-outline">
              Back to History
            </Link>
          </div>
        </Alert>
      </div>
    );
  }

  return (
    <div data-testid="student-quiz-result">
      {/* Top Back Navigation & Title */}
      <div className="mb-2">
        <Link to="/student/attempts" className="stu-section-head__link">
          ← Back to My Attempts
        </Link>
      </div>

      <div className="stu-welcome">
        <div className="stu-welcome__heading-row">
          <h1 className="stu-welcome__name">{result.quiz_title}</h1>
          <span className="stu-badge stu-badge--sky">{result.subject_name || 'General'}</span>
        </div>
        <div className="stu-welcome__subtitle">
          <span>Student: {result.student_name}</span>
          {result.submitted_at && (
            <>
              <span className="mx-2">•</span>
              <span>{new Date(result.submitted_at).toLocaleDateString()}</span>
            </>
          )}
        </div>
      </div>

      {/* Prominent Score Summary Card (Promotion Prep Style) */}
      <div className="stu-cta-card">
        <div className="stu-cta-card__top">
          <div
            className="stu-cta-card__icon-box"
            style={{
              backgroundColor: result.is_passed ? 'var(--stu-success-bg)' : 'var(--stu-danger-bg)',
              color: result.is_passed ? 'var(--stu-success)' : 'var(--stu-danger)',
            }}
          >
            <i
              className={`bi ${result.is_passed ? 'bi-check-circle-fill' : 'bi-x-circle-fill'}`}
              aria-hidden="true"
            />
          </div>
          <div className="stu-cta-card__info">
            <div className="stu-cta-card__eyebrow">
              {result.is_passed ? 'ASSESSMENT PASSED' : 'NEEDS IMPROVEMENT'}
            </div>
            <h2 className="stu-cta-card__title">
              {result.score} / {result.total_marks} Marks ({result.percentage}%)
            </h2>
            <p className="stu-cta-card__desc">
              Passing threshold: {result.passing_marks} marks. Outcome:{' '}
              <strong>{result.is_passed ? 'Passed' : 'Needs Improvement'}</strong>.
            </p>
          </div>
        </div>

        <div className="d-flex align-items-center gap-2 flex-wrap">
          <a
            href={`/app/student/attempts/${result.attempt_id}/result/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="stu-btn-outline"
            style={{ flex: 1, minWidth: '140px' }}
          >
            <i className="bi bi-printer me-1" aria-hidden="true" /> Print Result
          </a>
          <Link
            to="/student/quizzes"
            className="stu-btn-primary"
            style={{ flex: 1, minWidth: '140px' }}
          >
            More Quizzes →
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="stu-stats-grid mb-4">
        <div className="stu-stat-box">
          <div className="stu-stat-box__val" style={{ color: 'var(--stu-navy)' }}>
            {result.score}
          </div>
          <div className="stu-stat-box__label">Marks Obtained</div>
        </div>

        <div className="stu-stat-box">
          <div
            className="stu-stat-box__val"
            style={{ color: result.is_passed ? 'var(--stu-success)' : 'var(--stu-danger)' }}
          >
            {result.percentage}%
          </div>
          <div className="stu-stat-box__label">Score</div>
        </div>

        <div className="stu-stat-box">
          <div className="stu-stat-box__val" style={{ color: 'var(--stu-sky)' }}>
            {result.passing_marks}
          </div>
          <div className="stu-stat-box__label">Passing Mark</div>
        </div>
      </div>

      {/* Question-by-Question Review Section */}
      <div className="stu-section-head">
        <div className="stu-section-head__title-group">
          <h2 className="stu-section-head__title">Question-by-Question Review</h2>
          <p className="stu-section-head__subtitle">
            {result.questions.length} Questions Reviewed
          </p>
        </div>
      </div>

      {!result.allow_review ? (
        <div className="stu-card text-center py-4">
          <i className="bi bi-info-circle text-muted" style={{ fontSize: '1.75rem' }} aria-hidden="true" />
          <p className="text-muted small mb-0 mt-2">
            Detailed question review is disabled by your instructor for this quiz.
          </p>
        </div>
      ) : result.questions.length === 0 ? (
        <div className="stu-card text-center py-4">
          <p className="text-muted small mb-0">No questions available for review.</p>
        </div>
      ) : (
        <div className="stu-card-list">
          {result.questions.map((q, idx) => (
            <div
              key={q.id}
              className="stu-card"
              style={{
                borderLeft: `4px solid ${q.is_correct ? 'var(--stu-success)' : 'var(--stu-danger)'}`,
              }}
            >
              <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                <h3 className="fw-bold mb-0 text-dark" style={{ fontSize: '0.95rem', lineHeight: '1.4' }}>
                  Question {idx + 1}: {q.question_text}
                </h3>
                <span
                  className={`stu-badge ${q.is_correct ? 'stu-badge--success' : 'stu-badge--danger'}`}
                >
                  {q.marks_obtained} / {q.marks} pts
                </span>
              </div>

              {/* Multiple Choice / True-False Choices */}
              {q.choices.length > 0 && (
                <div className="mt-3 d-flex flex-column gap-2">
                  {q.choices.map((c) => {
                    let borderCol = 'var(--stu-border)';
                    let bgCol = 'var(--stu-surface)';
                    if (c.is_selected && c.is_correct) {
                      borderCol = 'var(--stu-success)';
                      bgCol = 'var(--stu-success-bg)';
                    } else if (c.is_selected && !c.is_correct) {
                      borderCol = 'var(--stu-danger)';
                      bgCol = 'var(--stu-danger-bg)';
                    } else if (result.show_correct_answers && c.is_correct) {
                      borderCol = 'var(--stu-warning-border)';
                      bgCol = 'var(--stu-warning-bg)';
                    }

                    return (
                      <div
                        key={c.id}
                        className="p-2 rounded d-flex justify-content-between align-items-center"
                        style={{
                          backgroundColor: bgCol,
                          border: `1px solid ${borderCol}`,
                          fontSize: '0.875rem',
                        }}
                      >
                        <span className="text-dark">{c.choice_text}</span>
                        <div className="d-flex gap-1 align-items-center flex-shrink-0">
                          {c.is_selected && (
                            <span className="stu-badge stu-badge--muted">Your Answer</span>
                          )}
                          {result.show_correct_answers && c.is_correct && (
                            <span className="stu-badge stu-badge--success">Correct Key</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Text / Essay Answers */}
              {q.choices.length === 0 && (
                <div className="mt-3">
                  <div className="small fw-semibold text-muted mb-1">Your Submission:</div>
                  <div
                    className="p-2 rounded mb-2 text-dark"
                    style={{
                      backgroundColor: 'var(--stu-surface-alt)',
                      border: '1px solid var(--stu-border)',
                      fontSize: '0.875rem',
                    }}
                  >
                    {q.student_answer || <span className="text-muted fst-italic">No response entered</span>}
                  </div>

                  {result.show_correct_answers && q.correct_answer && (
                    <div>
                      <div className="small fw-semibold text-success mb-1">Model / Correct Answer:</div>
                      <div
                        className="p-2 rounded text-dark"
                        style={{
                          backgroundColor: 'var(--stu-success-bg)',
                          border: '1px solid var(--stu-success-border)',
                          fontSize: '0.875rem',
                        }}
                      >
                        {q.correct_answer}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Explanation Callout */}
              {result.show_correct_answers && q.explanation && (
                <div
                  className="mt-3 p-2 rounded small text-dark"
                  style={{
                    backgroundColor: 'var(--stu-sky-subtle)',
                    border: '1px solid var(--stu-sky-border)',
                  }}
                >
                  <strong style={{ color: 'var(--stu-sky)' }}>
                    <i className="bi bi-lightbulb me-1" aria-hidden="true" /> Explanation:
                  </strong>{' '}
                  {q.explanation}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StudentQuizResult;
