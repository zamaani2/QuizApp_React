import { AppIcon } from '../../components/common/AppIcon';
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { studentApi } from '../../api/student';
import type { StudentQuizResultData } from '../../types/student';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { Alert } from '../../components/common/Alert';
import { getQuestionType } from '../../question-types';
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
      <div className="core-display-flex core-layout--justify-center core-space--padding-y-5" data-testid="student-quiz-result-loading">
        <LoadingSpinner size="lg" message="Loading your assessment results..." />
      </div>
    );
  }

  if (error || !result) {
    return (
      <div data-testid="student-quiz-result-error">
        <Alert variant="danger" dismissible={false}>
          <h5>Unable to load results</h5>
          <p className="core-space--margin-bottom-2">{error || 'Result details could not be retrieved.'}</p>
          <div className="core-display-flex core-layout--gap-2">
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
      <div className="core-space--margin-bottom-2">
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
              <span className="core-space--margin-x-2">•</span>
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
            <AppIcon name={result.is_passed ? 'circleCheck' : 'circleX'} />
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

        <div className="core-display-flex core-layout--align-center core-layout--gap-2 core-layout--wrap">
          <a
            href={`/app/student/attempts/${result.attempt_id}/result/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="stu-btn-outline"
            style={{ flex: 1, minWidth: '140px' }}
          >
            <AppIcon name="printer" className="core-space--margin-end-1" aria-hidden="true" /> Print Result
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
      <div className="stu-stats-grid core-space--margin-bottom-4">
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
        <div className="stu-card core-text--center core-space--padding-y-4">
          <AppIcon name="info" className="core-text--muted" style={{ fontSize: '1.75rem' }} aria-hidden="true" />
          <p className="core-text--muted core-type--small core-space--margin-bottom-0 core-space--margin-top-2">
            Detailed question review is disabled by your instructor for this quiz.
          </p>
        </div>
      ) : result.questions.length === 0 ? (
        <div className="stu-card core-text--center core-space--padding-y-4">
          <p className="core-text--muted core-type--small core-space--margin-bottom-0">No questions available for review.</p>
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
              <div className="core-display-flex core-layout--justify-between core-layout--align-start core-layout--gap-2 core-space--margin-bottom-2">
                <h3 className="core-type--weight-bold core-space--margin-bottom-0 core-text--dark" style={{ fontSize: '0.95rem', lineHeight: '1.4' }}>
                  Question {idx + 1}: {q.question_text}
                </h3>
                <span
                  className={`stu-badge ${q.is_correct ? 'stu-badge--success' : 'stu-badge--danger'}`}
                >
                  {q.marks_obtained} / {q.marks} pts
                </span>
              </div>

              {(() => {
                const Review = getQuestionType(q.question_type).Review;
                return (
                  <Review
                    answer={q.review_data?.student_answer ?? q.student_answer}
                    correctAnswer={result.show_correct_answers
                      ? q.review_data?.correct_answer ?? q.correct_answer
                      : null}
                    choices={q.choices}
                    showCorrectAnswers={result.show_correct_answers}
                  />
                );
              })()}

              {/* Explanation Callout */}
              {result.show_correct_answers && q.explanation && (
                <div
                  className="core-space--margin-top-3 core-space--padding-2 core-radius core-type--small core-text--dark"
                  style={{
                    backgroundColor: 'var(--stu-sky-subtle)',
                    border: '1px solid var(--stu-sky-border)',
                  }}
                >
                  <strong style={{ color: 'var(--stu-sky)' }}>
                    <AppIcon name="lightbulb" className="core-space--margin-end-1" aria-hidden="true" /> Explanation:
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
