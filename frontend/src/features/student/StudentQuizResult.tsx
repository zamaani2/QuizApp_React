import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { studentApi } from '../../api/student';
import type { StudentQuizResultData } from '../../types/student';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';

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
      <div className="assessment-page container-fluid py-4" data-testid="student-quiz-result-loading">
        <div className="d-flex justify-content-center py-5">
          <LoadingSpinner size="lg" message="Loading your assessment results..." />
        </div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="assessment-page container-fluid py-4" data-testid="student-quiz-result-error">
        <Alert variant="danger" dismissible={false}>
          <h5>Unable to load results</h5>
          <p className="mb-2">{error || 'Result details could not be retrieved.'}</p>
          <div className="d-flex gap-2">
            <Button variant="secondary" size="sm" onClick={loadResult}>
              Retry
            </Button>
            <Link to="/student/attempts" className="btn btn-sm btn-outline-secondary">
              Back to History
            </Link>
          </div>
        </Alert>
      </div>
    );
  }

  return (
    <div className="assessment-page container-fluid py-4" data-testid="student-quiz-result">
      {/* Top Navigation */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
        <div>
          <div className="mb-2">
            <Link to="/student/attempts" className="text-decoration-none small text-muted">
              ← Back to My Attempts
            </Link>
          </div>
          <h2 className="h3 fw-bold text-dark mb-1">{result.quiz_title}</h2>
          <div className="d-flex flex-wrap align-items-center gap-2 mt-2">
            <span className="badge bg-primary">{result.subject_name || 'General'}</span>
            <span className="text-muted small">Student: {result.student_name}</span>
          </div>
        </div>
        <div className="d-flex gap-2">
          <a
            href={`/app/student/attempts/${result.attempt_id}/result/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm btn-outline-secondary"
          >
            <i className="bi bi-printer me-1"></i> Print Result
          </a>
        </div>
      </div>

      {/* Primary Score Summary Card */}
      <div
        className={`card shadow-sm border-0 mb-4 border-start border-4 ${
          result.is_passed ? 'border-success' : 'border-danger'
        }`}
      >
        <div className="card-body p-4">
          <div className="row align-items-center g-4">
            <div className="col-md-3 text-center border-end-md">
              <span className="text-muted small text-uppercase fw-semibold d-block mb-1">
                Assessment Outcome
              </span>
              <span
                className={`badge fs-5 px-3 py-2 ${
                  result.is_passed ? 'bg-success' : 'bg-danger'
                }`}
              >
                <i
                  className={`bi me-1 ${
                    result.is_passed ? 'bi-check-circle-fill' : 'bi-x-circle-fill'
                  }`}
                ></i>
                {result.is_passed ? 'Passed' : 'Needs Improvement'}
              </span>
            </div>

            <div className="col-md-3 text-center border-end-md">
              <span className="text-muted small text-uppercase fw-semibold d-block mb-1">
                Final Score
              </span>
              <h2 className="fw-bold mb-0 text-dark">
                {result.score}{' '}
                <span className="fs-5 text-muted fw-normal">/ {result.total_marks}</span>
              </h2>
            </div>

            <div className="col-md-3 text-center border-end-md">
              <span className="text-muted small text-uppercase fw-semibold d-block mb-1">
                Percentage
              </span>
              <h2
                className={`fw-bold mb-0 ${
                  result.is_passed ? 'text-success' : 'text-danger'
                }`}
              >
                {result.percentage}%
              </h2>
              <span className="small text-muted">Passing: {result.passing_marks} pts</span>
            </div>

            <div className="col-md-3 text-center">
              <span className="text-muted small text-uppercase fw-semibold d-block mb-1">
                Submitted At
              </span>
              <div className="small text-dark fw-semibold">
                {result.submitted_at
                  ? new Date(result.submitted_at).toLocaleDateString()
                  : '—'}
              </div>
              <div className="small text-muted">
                {result.submitted_at
                  ? new Date(result.submitted_at).toLocaleTimeString()
                  : ''}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Question Review Section */}
      <div className="card shadow-sm border-0">
        <div className="card-header bg-white py-3 border-0 d-flex justify-content-between align-items-center">
          <h5 className="card-title fw-bold mb-0">
            <i className="bi bi-card-checklist me-2 text-primary"></i>
            Question-by-Question Review
          </h5>
          <span className="text-muted small">{result.questions.length} Questions Reviewed</span>
        </div>
        <div className="card-body">
          {!result.allow_review ? (
            <div className="alert alert-info mb-0">
              <i className="bi bi-info-circle me-2"></i>
              Detailed question review is disabled by your instructor for this quiz.
            </div>
          ) : result.questions.length === 0 ? (
            <p className="text-muted mb-0">No questions available for review.</p>
          ) : (
            <div className="d-flex flex-column gap-4">
              {result.questions.map((q, idx) => (
                <div
                  key={q.id}
                  className={`p-3 rounded border ${
                    q.is_correct ? 'border-success-subtle bg-light' : 'border-danger-subtle bg-light'
                  }`}
                >
                  <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                    <h6 className="fw-bold mb-0 text-dark">
                      Question {idx + 1}: {q.question_text}
                    </h6>
                    <span
                      className={`badge ${
                        q.is_correct ? 'bg-success' : 'bg-danger'
                      } text-nowrap`}
                    >
                      {q.marks_obtained} / {q.marks} pts
                    </span>
                  </div>

                  {/* Multiple Choice / True False Choices */}
                  {q.choices.length > 0 && (
                    <div className="mt-3">
                      <ul className="list-group list-group-flush border rounded bg-white">
                        {q.choices.map((c) => {
                          let choiceClass = 'list-group-item py-2 px-3';
                          if (c.is_selected && c.is_correct) {
                            choiceClass += ' list-group-item-success fw-semibold';
                          } else if (c.is_selected && !c.is_correct) {
                            choiceClass += ' list-group-item-danger';
                          } else if (result.show_correct_answers && c.is_correct) {
                            choiceClass += ' list-group-item-warning fw-semibold';
                          }

                          return (
                            <li
                              key={c.id}
                              className={`${choiceClass} d-flex justify-content-between align-items-center`}
                            >
                              <span>{c.choice_text}</span>
                              <div className="d-flex gap-2 align-items-center">
                                {c.is_selected && (
                                  <span className="badge bg-secondary">Your Answer</span>
                                )}
                                {result.show_correct_answers && c.is_correct && (
                                  <span className="badge bg-success">Correct Key</span>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {/* Text / Essay Answers */}
                  {q.choices.length === 0 && (
                    <div className="mt-3">
                      <div className="small fw-semibold text-muted mb-1">Your Submission:</div>
                      <div className="p-2 bg-white rounded border mb-2 text-dark">
                        {q.student_answer || <span className="text-muted fst-italic">No response entered</span>}
                      </div>

                      {result.show_correct_answers && q.correct_answer && (
                        <div>
                          <div className="small fw-semibold text-success mb-1">Sample Answer / Model Answer:</div>
                          <div className="p-2 bg-success-subtle rounded border border-success-subtle text-dark">
                            {q.correct_answer}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Explanation Callout */}
                  {result.show_correct_answers && q.explanation && (
                    <div className="mt-3 p-2 bg-info-subtle border border-info-subtle rounded small text-dark">
                      <strong>
                        <i className="bi bi-lightbulb me-1"></i> Explanation:
                      </strong>{' '}
                      {q.explanation}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
