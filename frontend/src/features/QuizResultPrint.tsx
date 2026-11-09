import { AppIcon } from '../components/common/AppIcon';
import React, { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { fetchTeacherResult } from '../api/teacher';
import { studentApi } from '../api/student';
import { Alert } from '../components/common/Alert';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import type { QuizResultSchoolInfo, TeacherResultDetail } from '../types';
import type { StudentQuizResultData } from '../types/student';
import './quiz-result-print.css';

interface QuizResultPrintReportProps {
  quizTitle: string;
  studentName: string;
  admissionNumber: string;
  subjectName?: string;
  teacherName?: string;
  academicYear?: string;
  score: number;
  totalMarks: number;
  percentage: number;
  submittedAt: string | null;
  durationMinutes?: number | null;
  correctAnswers?: number;
  wrongAnswers?: number;
  unanswered?: number;
  schoolInfo?: QuizResultSchoolInfo;
  statusLabel: string;
  statusVariant: 'success' | 'warning' | 'danger';
  returnTo: string;
  showActions?: boolean;
  children: ReactNode;
}

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleString() : 'Not available';

const QuizResultPrintReport: React.FC<QuizResultPrintReportProps> = ({
  quizTitle,
  studentName,
  admissionNumber,
  subjectName,
  teacherName,
  academicYear,
  score,
  totalMarks,
  percentage,
  submittedAt,
  durationMinutes,
  correctAnswers,
  wrongAnswers,
  unanswered,
  schoolInfo,
  statusLabel,
  statusVariant,
  returnTo,
  showActions = true,
  children,
}) => {
  useEffect(() => {
    document.body.classList.add('quiz-result-printing');
    return () => document.body.classList.remove('quiz-result-printing');
  }, []);

  return (
    <div className="quiz-print-page" data-testid="quiz-result-print">
      {showActions && (
        <div className="quiz-print__actions">
          <Link className="quiz-print__back" to={returnTo}>Back to results</Link>
          <button className="quiz-print__button" type="button" onClick={() => window.print()}>
            <AppIcon name="printer" aria-hidden="true" /> Print report
          </button>
        </div>
      )}

      <article className="quiz-print__report">
        <header className="quiz-print__header">
          <div className="quiz-print__school">
            {schoolInfo?.logo_url
              ? <img className="quiz-print__school-logo" src={schoolInfo.logo_url} alt="" />
              : <span className="quiz-print__brand-mark" aria-hidden="true">Q</span>}
            <div>
              <strong>{schoolInfo?.name || 'QuizApp'}</strong>
              {schoolInfo?.address && <span>{schoolInfo.address}</span>}
              {(schoolInfo?.phone_number || schoolInfo?.email) && (
                <span>{[schoolInfo.phone_number, schoolInfo.email].filter(Boolean).join(' · ')}</span>
              )}
            </div>
          </div>
          <p className="quiz-print__eyebrow">QUIZ RESULT</p>
          <h1>{quizTitle}</h1>
          <p className="quiz-print__submitted">Submitted {formatDate(submittedAt)}</p>
        </header>

        <section className="quiz-print__identity" aria-label="Student and quiz details">
          <div><span>Student</span><strong>{studentName}</strong></div>
          <div><span>Admission number</span><strong>{admissionNumber || '—'}</strong></div>
          {subjectName && <div><span>Subject</span><strong>{subjectName}</strong></div>}
          {teacherName && <div><span>Teacher</span><strong>{teacherName}</strong></div>}
          {academicYear && <div><span>Academic year</span><strong>{academicYear}</strong></div>}
        </section>

        <section className="quiz-print__summary" aria-label="Result summary">
          <div className="quiz-print__score">
            <span>Final score</span>
            <strong>{score} <small>/ {totalMarks}</small></strong>
          </div>
          <div className="quiz-print__percentage">
            <span>Percentage</span>
            <strong>{percentage}%</strong>
          </div>
          {durationMinutes !== undefined && durationMinutes !== null && (
            <div className="quiz-print__metric">
              <span>Time taken</span>
              <strong>{durationMinutes} min</strong>
            </div>
          )}
          <span className={`quiz-print__status quiz-print__status--${statusVariant}`}>{statusLabel}</span>
        </section>

        {(correctAnswers !== undefined || wrongAnswers !== undefined || unanswered !== undefined) && (
          <section className="quiz-print__question-counts" aria-label="Answer summary">
            <div><strong>{correctAnswers ?? 0}</strong><span>Correct</span></div>
            <div><strong>{wrongAnswers ?? 0}</strong><span>Wrong</span></div>
            <div><strong>{unanswered ?? 0}</strong><span>Unanswered</span></div>
          </section>
        )}

        <section className="quiz-print__questions">
          <div className="quiz-print__section-heading">
            <h2>Question review</h2>
          </div>
          {children}
        </section>
        <footer className="quiz-print__footer">Generated from QuizApp</footer>
      </article>
    </div>
  );
};

const TeacherResultReport: React.FC<{
  result: TeacherResultDetail;
  showActions?: boolean;
}> = ({ result, showActions = true }) => (
  <QuizResultPrintReport
    quizTitle={result.quiz_title}
    studentName={result.student_name}
    admissionNumber={result.admission_number}
    subjectName={result.subject_name}
    teacherName={result.teacher_name}
    academicYear={result.academic_year}
    score={result.score}
    totalMarks={result.total_marks}
    percentage={result.percentage}
    submittedAt={result.submitted_at}
    durationMinutes={result.duration_minutes}
    correctAnswers={result.correct_answers}
    wrongAnswers={result.wrong_answers}
    unanswered={result.unanswered}
    schoolInfo={result.school_info}
    statusLabel={result.is_graded ? 'Grading complete' : 'Grading pending'}
    statusVariant={result.is_graded ? 'success' : 'warning'}
    returnTo={showActions ? `/teacher/results/${result.id}` : '/teacher/results'}
    showActions={showActions}
  >
    {result.responses.length ? result.responses.map((response, index) => {
      const hasAnswer = response.is_answered ?? Boolean(
        response.selected_choices.length || response.selected_choice || response.text_answer
      );
      const answer = response.selected_choices.length
        ? response.selected_choices.join(', ')
        : response.selected_choice || response.text_answer || 'No answer provided';
      const correctAnswers = response.correct_choices.length
        ? response.correct_choices
        : response.answer_key ? [response.answer_key] : [];

      return (
        <article className="quiz-print__question" key={response.id}>
          <div className="quiz-print__question-heading">
            <h3>Question {index + 1}</h3>
            <span>{response.marks_awarded} / {response.marks} marks</span>
          </div>
          <p className="quiz-print__question-text">{response.question_text}</p>
          <p className="quiz-print__answer"><strong>Student answer:</strong> {answer}</p>
          <p className={`quiz-print__answer-status ${!hasAnswer ? 'is-unanswered' : response.is_correct ? 'is-correct' : 'is-incorrect'}`}>
            {!hasAnswer ? 'Unanswered' : response.is_correct ? 'Correct' : 'Incorrect'}
          </p>
          {correctAnswers.length > 0 && (
            <p className="quiz-print__answer"><strong>Correct answer:</strong> {correctAnswers.join(', ')}</p>
          )}
          {response.grading_notes && (
            <p className="quiz-print__notes"><strong>Grading notes:</strong> {response.grading_notes}</p>
          )}
        </article>
      );
    }) : <p className="quiz-print__empty">No question responses are available.</p>}
  </QuizResultPrintReport>
);

const PrintLoadState: React.FC<{ error: string | null }> = ({ error }) => (
  <div className="quiz-print-page">
    {error ? (
      <Alert variant="danger" dismissible={false}>
        <h2 className="core-type--heading-5">Unable to load quiz result</h2>
        <p className="core-space--margin-bottom-0">{error}</p>
      </Alert>
    ) : (
      <LoadingSpinner size="lg" message="Preparing your result report..." />
    )}
  </div>
);

export const TeacherQuizResultPrint: React.FC = () => {
  const { attemptId } = useParams<{ attemptId: string }>();
  const [result, setResult] = useState<TeacherResultDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setResult(null);
    setError(null);
    const id = Number(attemptId);
    if (!Number.isSafeInteger(id) || id < 1) {
      setError('The quiz result ID is invalid.');
      return () => { active = false; };
    }

    fetchTeacherResult(id)
      .then((data) => { if (active) setResult(data); })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load quiz result.');
      });

    return () => { active = false; };
  }, [attemptId]);

  if (!result) return <PrintLoadState error={error} />;

  return <TeacherResultReport result={result} />;
};

export const TeacherQuizResultsBulkPrint: React.FC = () => {
  const [searchParams] = useSearchParams();
  const query = searchParams.toString();
  const [results, setResults] = useState<TeacherResultDetail[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setResults([]);
    const params = new URLSearchParams(query);
    const rawIds = params.getAll('attempt_ids');
    const ids = rawIds.map(Number);
    const load = async () => {
      setError(null);
      if (rawIds.length && ids.some((id) => !Number.isSafeInteger(id) || id < 1)) {
        setError('One or more selected result IDs are invalid.');
        return;
      }

      try {
        const attemptIds = ids;
        if (!attemptIds.length) {
          setError('No quiz results were selected to print.');
          return;
        }

        const loaded: TeacherResultDetail[] = [];
        for (let index = 0; index < attemptIds.length; index += 8) {
          const batch = await Promise.all(
            attemptIds.slice(index, index + 8).map((id) => fetchTeacherResult(id))
          );
          loaded.push(...batch);
        }
        if (active) setResults(loaded);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Unable to load quiz results for printing.');
        }
      }
    };

    void load();
    return () => { active = false; };
  }, [query]);

  if (error || results.length === 0) return <PrintLoadState error={error} />;

  return (
    <div className="quiz-print-page quiz-print-page--bulk" data-testid="quiz-results-bulk-print">
      <div className="quiz-print__actions">
        <Link className="quiz-print__back" to="/teacher/results">Back to results</Link>
        <button className="quiz-print__button" type="button" onClick={() => window.print()}>
          <AppIcon name="printer" aria-hidden="true" /> Print {results.length} reports
        </button>
      </div>
      {results.map((result) => (
        <TeacherResultReport key={result.id} result={result} showActions={false} />
      ))}
    </div>
  );
};

export const StudentQuizResultPrint: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [result, setResult] = useState<StudentQuizResultData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setResult(null);
    setError(null);
    const attemptId = Number(id);
    if (!Number.isSafeInteger(attemptId) || attemptId < 1) {
      setError('The quiz result ID is invalid.');
      return () => { active = false; };
    }

    studentApi.getStudentQuizResult(attemptId)
      .then((data) => { if (active) setResult(data); })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load quiz result.');
      });

    return () => { active = false; };
  }, [id]);

  if (!result) return <PrintLoadState error={error} />;

  return (
    <QuizResultPrintReport
      quizTitle={result.quiz_title}
      studentName={result.student_name}
      admissionNumber={result.admission_number}
      subjectName={result.subject_name}
      teacherName={result.teacher_name}
      academicYear={result.academic_year}
      score={result.score}
      totalMarks={result.total_marks}
      percentage={result.percentage}
      submittedAt={result.submitted_at}
      durationMinutes={result.duration_minutes}
      correctAnswers={result.correct_answers}
      wrongAnswers={result.wrong_answers}
      unanswered={result.unanswered}
      schoolInfo={result.school_info}
      statusLabel={result.is_passed ? 'Passed' : 'Needs improvement'}
      statusVariant={result.is_passed ? 'success' : 'danger'}
      returnTo={`/student/attempts/${result.attempt_id}/result`}
    >
      {!result.allow_review ? (
        <p className="quiz-print__empty">Score summary only; answer review is not available for this quiz.</p>
      ) : result.questions.length ? result.questions.map((question, index) => (
        <article className="quiz-print__question" key={question.id}>
          <div className="quiz-print__question-heading">
            <h3>Question {index + 1}</h3>
            <span>{question.marks_obtained} / {question.marks} marks</span>
          </div>
          <p className="quiz-print__question-text">{question.question_text}</p>
          {question.choices.length ? (
            <ul className="quiz-print__choices">
              {question.choices.map((choice) => (
                <li key={choice.id}>
                  <span>{choice.choice_text}</span>
                  <span className="quiz-print__choice-labels">
                    {choice.is_selected && <strong>Your answer</strong>}
                    {result.show_correct_answers && choice.is_correct && <strong>Correct answer</strong>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="quiz-print__answer"><strong>Your answer:</strong> {question.student_answer || 'No response provided'}</p>
          )}
          <p className={`quiz-print__answer-status ${question.is_correct ? 'is-correct' : 'is-incorrect'}`}>
            {question.is_correct ? 'Correct' : 'Incorrect'}
          </p>
          {result.show_correct_answers && question.correct_answer && (
            <p className="quiz-print__answer"><strong>Correct answer:</strong> {question.correct_answer}</p>
          )}
          {result.show_correct_answers && question.explanation && (
            <p className="quiz-print__notes"><strong>Explanation:</strong> {question.explanation}</p>
          )}
        </article>
      )) : <p className="quiz-print__empty">No questions are available for review.</p>}
    </QuizResultPrintReport>
  );
};
