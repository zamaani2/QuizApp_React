import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { studentApi } from '../../api/student';
import type { StudentDashboardData } from '../../types/student';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';

export const StudentDashboard: React.FC = () => {
  const [data, setData] = useState<StudentDashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await studentApi.getStudentDashboard();
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load student dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  if (loading) {
    return (
      <div className="container-fluid py-4" data-testid="student-dashboard-loading">
        <div className="d-flex justify-content-center py-5">
          <LoadingSpinner size="lg" message="Loading your dashboard..." />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container-fluid py-4" data-testid="student-dashboard-error">
        <Alert variant="danger" dismissible={false}>
          <h5>Unable to load student dashboard</h5>
          <p className="mb-2">{error || 'An unexpected error occurred.'}</p>
          <Button variant="secondary" size="sm" onClick={loadDashboard}>
            Retry
          </Button>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container-fluid py-4" data-testid="student-dashboard">
      {/* Top Banner / Welcome */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
        <div>
          <h2 className="h3 fw-bold text-dark mb-1">Welcome back, {data.student_name}!</h2>
          <div className="text-muted small d-flex flex-wrap gap-3">
            <span>
              <strong>Admission:</strong> {data.admission_number}
            </span>
            <span>
              <strong>Class:</strong> {data.class_name || 'Not Assigned'}
            </span>
            {data.academic_year && (
              <span>
                <strong>Academic Year:</strong> {data.academic_year}
              </span>
            )}
            {data.term && (
              <span>
                <strong>Term:</strong> {data.term}
              </span>
            )}
          </div>
        </div>
        <div className="d-flex gap-2">
          <Button variant="secondary" size="sm" onClick={loadDashboard}>
            Refresh
          </Button>
        </div>
      </div>

      {/* In-Progress Quizzes Alert Banner */}
      {data.in_progress_attempts.length > 0 && (
        <div className="alert alert-warning border-warning shadow-sm mb-4" role="alert">
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
            <div>
              <h5 className="alert-heading fw-bold mb-1">
                <i className="bi bi-clock-history me-2"></i>
                You have {data.in_progress_attempts.length} quiz attempt(s) in progress!
              </h5>
              <p className="mb-0 small text-dark">
                Don't lose your work. Resume your quiz before your time expires.
              </p>
            </div>
            <div className="d-flex gap-2">
              {data.in_progress_attempts.map((att) => (
                <Link
                  key={att.id}
                  to={`/student/take/${att.id}`}
                  className="btn btn-warning btn-sm fw-bold text-dark"
                >
                  Resume {att.quiz_title}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Metric Cards Grid */}
      <div className="row g-3 mb-4">
        <div className="col-sm-6 col-lg-3">
          <div className="card shadow-sm border-0 h-100">
            <div className="card-body">
              <span className="text-muted small text-uppercase fw-semibold">Available Quizzes</span>
              <h3 className="fw-bold text-primary mt-2 mb-1">{data.total_available}</h3>
              <div className="small text-muted">Ready for you to take</div>
            </div>
          </div>
        </div>
        <div className="col-sm-6 col-lg-3">
          <div className="card shadow-sm border-0 h-100">
            <div className="card-body">
              <span className="text-muted small text-uppercase fw-semibold">Completed</span>
              <h3 className="fw-bold text-success mt-2 mb-1">{data.total_completed}</h3>
              <div className="small text-muted">Assessed attempts</div>
            </div>
          </div>
        </div>
        <div className="col-sm-6 col-lg-3">
          <div className="card shadow-sm border-0 h-100">
            <div className="card-body">
              <span className="text-muted small text-uppercase fw-semibold">Average Score</span>
              <h3 className="fw-bold text-info mt-2 mb-1">{data.avg_score}%</h3>
              <div className="small text-muted">Across all completed quizzes</div>
            </div>
          </div>
        </div>
        <div className="col-sm-6 col-lg-3">
          <div className="card shadow-sm border-0 h-100">
            <div className="card-body">
              <span className="text-muted small text-uppercase fw-semibold">Personal Best</span>
              <h3 className="fw-bold text-warning mt-2 mb-1">{data.best_score}%</h3>
              <div className="small text-muted">Highest score achieved</div>
            </div>
          </div>
        </div>
      </div>

      <div className="row g-4">
        {/* Available Quizzes Column */}
        <div className="col-lg-7">
          <div className="card shadow-sm border-0 h-100">
            <div className="card-header bg-white py-3 border-0 d-flex justify-content-between align-items-center">
              <h5 className="card-title fw-bold mb-0">Available Quizzes</h5>
              <Link to="/student/quizzes" className="small text-primary text-decoration-none fw-semibold">
                View All Available ({data.total_available}) →
              </Link>
            </div>
            <div className="card-body p-0">
              {data.available_quizzes.length === 0 ? (
                <div className="text-center py-5 text-muted">
                  <i className="bi bi-journal-check fs-2 d-block mb-2 text-secondary"></i>
                  <p className="mb-0">No quizzes are currently active for your class.</p>
                </div>
              ) : (
                <div className="list-group list-group-flush">
                  {data.available_quizzes.map((quiz) => (
                    <div key={quiz.id} className="list-group-item px-3 py-3">
                      <div className="d-flex justify-content-between align-items-start gap-2">
                        <div>
                          <h6 className="fw-bold mb-1 text-dark">{quiz.title}</h6>
                          <div className="d-flex flex-wrap gap-2 text-muted small align-items-center">
                            <span className="badge bg-light text-dark border">
                              {quiz.subject_name}
                            </span>
                            <span>
                              <i className="bi bi-clock me-1"></i>
                              {quiz.duration_minutes > 0 ? `${quiz.duration_minutes} mins` : 'Untimed'}
                            </span>
                            <span>•</span>
                            <span>{quiz.total_questions} questions</span>
                            <span>•</span>
                            <span>{quiz.total_marks} marks</span>
                          </div>
                        </div>
                        <Link
                          to={`/student/quizzes/${quiz.id}`}
                          className="btn btn-sm btn-primary text-nowrap"
                        >
                          Details & Take
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Recent Attempts Column */}
        <div className="col-lg-5">
          <div className="card shadow-sm border-0 h-100">
            <div className="card-header bg-white py-3 border-0 d-flex justify-content-between align-items-center">
              <h5 className="card-title fw-bold mb-0">Recent Attempts</h5>
              <Link to="/student/attempts" className="small text-primary text-decoration-none fw-semibold">
                History ({data.total_completed}) →
              </Link>
            </div>
            <div className="card-body p-0">
              {data.recent_attempts.length === 0 ? (
                <div className="text-center py-5 text-muted">
                  <i className="bi bi-clock-history fs-2 d-block mb-2 text-secondary"></i>
                  <p className="mb-0">You have not completed any quizzes yet.</p>
                </div>
              ) : (
                <div className="list-group list-group-flush">
                  {data.recent_attempts.map((att) => (
                    <div key={att.id} className="list-group-item px-3 py-3">
                      <div className="d-flex justify-content-between align-items-center">
                        <div>
                          <h6 className="fw-bold mb-1 text-dark">{att.quiz_title}</h6>
                          <div className="small text-muted">
                            <span>{att.subject_name}</span>
                            {att.submitted_at && (
                              <span className="ms-2">
                                • {new Date(att.submitted_at).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-end">
                          <span
                            className={`badge ${att.is_passed ? 'bg-success' : 'bg-danger'} mb-1`}
                          >
                            {att.percentage}% ({att.is_passed ? 'Passed' : 'Failed'})
                          </span>
                          <div>
                            <Link
                              to={`/student/attempts/${att.id}/result`}
                              className="text-decoration-none small text-primary"
                            >
                              Review Result →
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
