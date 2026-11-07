import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { studentApi } from '../../api/student';
import type { StudentQuizDetail as IStudentQuizDetail } from '../../types/student';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';

export const StudentQuizDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [quiz, setQuiz] = useState<IStudentQuizDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState<string>('');
  const [starting, setStarting] = useState<boolean>(false);
  const [startError, setStartError] = useState<string | null>(null);

  const loadDetail = async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const res = await studentApi.getStudentQuizDetail(Number(id));
      setQuiz(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quiz details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
  }, [id]);

  const handleStartOrResume = async () => {
    if (!id) return;
    try {
      setStarting(true);
      setStartError(null);
      const res = await studentApi.startStudentQuiz(Number(id), password);
      if (res.success && res.attempt_id) {
        navigate(`/student/take/${res.attempt_id}`);
      } else {
        setStartError(res.message || 'Unable to start quiz.');
      }
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Failed to start quiz.');
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <div className="assessment-page container-fluid py-4" data-testid="student-quiz-detail-loading">
        <div className="d-flex justify-content-center py-5">
          <LoadingSpinner size="lg" message="Loading quiz details..." />
        </div>
      </div>
    );
  }

  if (error || !quiz) {
    return (
      <div className="assessment-page container-fluid py-4" data-testid="student-quiz-detail-error">
        <Alert variant="danger" dismissible={false}>
          <h5>Unable to load quiz</h5>
          <p className="mb-2">{error || 'Quiz not found or not assigned to your class.'}</p>
          <div className="d-flex gap-2">
            <Button variant="secondary" size="sm" onClick={loadDetail}>
              Retry
            </Button>
            <Link to="/student/quizzes" className="btn btn-sm btn-outline-secondary">
              Back to Available Quizzes
            </Link>
          </div>
        </Alert>
      </div>
    );
  }

  return (
    <div className="assessment-page container-fluid py-4" data-testid="student-quiz-detail">
      {/* Header & Back link */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
        <div>
          <div className="mb-2">
            <Link to="/student/quizzes" className="text-decoration-none small text-muted">
              ← Back to Available Quizzes
            </Link>
          </div>
          <h2 className="h3 fw-bold text-dark mb-1">{quiz.title}</h2>
          <div className="d-flex flex-wrap align-items-center gap-2 mt-2">
            <span className="badge bg-primary">{quiz.subject_name}</span>
            <span className="text-muted small">Instructor: {quiz.teacher_name}</span>
          </div>
        </div>
        <div className="d-flex gap-2">
          <Button variant="secondary" size="sm" onClick={loadDetail}>
            Refresh
          </Button>
        </div>
      </div>

      {startError && (
        <Alert variant="danger" dismissible onDismiss={() => setStartError(null)}>
          {startError}
        </Alert>
      )}

      <div className="row g-4">
        {/* Left Column: Instructions and Rules */}
        <div className="col-lg-8">
          <div className="card shadow-sm border-0 mb-4">
            <div className="card-header bg-white py-3 border-0">
              <h5 className="card-title fw-bold mb-0">Quiz Overview & Instructions</h5>
            </div>
            <div className="card-body">
              {quiz.description && <p className="lead fs-6 text-dark mb-4">{quiz.description}</p>}

              <h6 className="fw-bold text-uppercase small text-muted mb-2">Instructions</h6>
              <div className="p-3 bg-light rounded border mb-4">
                {quiz.instructions ? (
                  <p className="mb-0 text-dark" style={{ whiteSpace: 'pre-line' }}>
                    {quiz.instructions}
                  </p>
                ) : (
                  <p className="mb-0 text-muted fst-italic">No specific instructions provided.</p>
                )}
              </div>

              {/* Assessment Rules Grid */}
              <h6 className="fw-bold text-uppercase small text-muted mb-3">Assessment Rules</h6>
              <div className="row g-3">
                <div className="col-sm-6 col-md-3">
                  <div className="p-3 border rounded text-center">
                    <span className="small text-muted d-block">Time Limit</span>
                    <strong className="fs-5 text-dark">
                      {quiz.duration_minutes > 0 ? `${quiz.duration_minutes}m` : 'Untimed'}
                    </strong>
                  </div>
                </div>
                <div className="col-sm-6 col-md-3">
                  <div className="p-3 border rounded text-center">
                    <span className="small text-muted d-block">Questions</span>
                    <strong className="fs-5 text-dark">{quiz.total_questions}</strong>
                  </div>
                </div>
                <div className="col-sm-6 col-md-3">
                  <div className="p-3 border rounded text-center">
                    <span className="small text-muted d-block">Total Marks</span>
                    <strong className="fs-5 text-dark">{quiz.total_marks}</strong>
                  </div>
                </div>
                <div className="col-sm-6 col-md-3">
                  <div className="p-3 border rounded text-center">
                    <span className="small text-muted d-block">Passing Mark</span>
                    <strong className="fs-5 text-dark">
                      {quiz.passing_marks} ({quiz.pass_percentage}%)
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Past Attempts Table */}
          <div className="card shadow-sm border-0">
            <div className="card-header bg-white py-3 border-0">
              <h5 className="card-title fw-bold mb-0">Your Past Attempts</h5>
            </div>
            <div className="card-body p-0">
              {quiz.past_attempts.length === 0 ? (
                <div className="text-center py-4 text-muted small">
                  You haven't attempted this quiz yet.
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead className="table-light">
                      <tr>
                        <th scope="col">Attempt</th>
                        <th scope="col">Score</th>
                        <th scope="col">Percentage</th>
                        <th scope="col">Status</th>
                        <th scope="col">Date</th>
                        <th scope="col" className="text-end">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quiz.past_attempts.map((att) => (
                        <tr key={att.id}>
                          <td className="fw-semibold">Attempt #{att.attempt_number}</td>
                          <td>
                            {att.score} / {att.total_marks}
                          </td>
                          <td>{att.percentage}%</td>
                          <td>
                            <span
                              className={`badge ${
                                att.is_passed ? 'bg-success' : 'bg-danger'
                              }`}
                            >
                              {att.is_passed ? 'Passed' : 'Failed'}
                            </span>
                          </td>
                          <td className="small text-muted">
                            {att.submitted_at
                              ? new Date(att.submitted_at).toLocaleString()
                              : 'In Progress'}
                          </td>
                          <td className="text-end">
                            {att.is_submitted ? (
                              <Link
                                to={`/student/attempts/${att.id}/result`}
                                className="btn btn-sm btn-outline-primary"
                              >
                                Review
                              </Link>
                            ) : (
                              <Link
                                to={`/student/take/${att.id}`}
                                className="btn btn-sm btn-warning fw-bold text-dark"
                              >
                                Resume
                              </Link>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Quiz Action Card */}
        <div className="col-lg-4">
          <div className="card shadow-sm border-0">
            <div className="card-body p-4">
              <h5 className="fw-bold text-dark mb-3">Ready to Begin?</h5>

              <div className="mb-3">
                <div className="d-flex justify-content-between small text-muted mb-1">
                  <span>Attempts allowed:</span>
                  <strong>{quiz.max_attempts}</strong>
                </div>
                <div className="d-flex justify-content-between small text-muted mb-1">
                  <span>Attempts taken:</span>
                  <strong>{quiz.attempts_count}</strong>
                </div>
                <div className="d-flex justify-content-between small text-muted">
                  <span>Attempts remaining:</span>
                  <strong className={quiz.remaining_attempts > 0 ? 'text-success' : 'text-danger'}>
                    {quiz.remaining_attempts}
                  </strong>
                </div>
              </div>

              <hr />

              {quiz.require_password && (
                <div className="mb-3">
                  <label htmlFor="quiz-password" className="form-label small fw-semibold">
                    Quiz Access Password:
                  </label>
                  <input
                    id="quiz-password"
                    type="password"
                    className="form-control"
                    placeholder="Enter quiz password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              )}

              {quiz.in_progress_attempt_id ? (
                <div>
                  <div className="alert alert-warning small mb-3">
                    You have an attempt in progress!
                  </div>
                  <Button
                    variant="primary"
                    className="w-100 py-2 fw-bold"
                    onClick={handleStartOrResume}
                    loading={starting}
                  >
                    Resume In-Progress Quiz
                  </Button>
                </div>
              ) : quiz.can_attempt ? (
                <div>
                  <Button
                    variant="primary"
                    className="w-100 py-2 fw-bold"
                    onClick={handleStartOrResume}
                    loading={starting}
                    disabled={quiz.require_password && !password.trim()}
                  >
                    Start Assessment Now
                  </Button>
                  <p className="small text-muted text-center mt-2 mb-0">
                    Timer starts immediately upon clicking.
                  </p>
                </div>
              ) : (
                <div>
                  <div className="alert alert-secondary small mb-0">
                    {quiz.attempt_message || 'You cannot take this assessment at this time.'}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
