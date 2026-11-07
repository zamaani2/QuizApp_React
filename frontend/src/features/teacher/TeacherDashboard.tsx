import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { fetchTeacherDashboard } from '../../api/teacher';
import type { TeacherDashboardData } from '../../types';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';

export const TeacherDashboard: React.FC = () => {
  const [data, setData] = useState<TeacherDashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchTeacherDashboard();
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load teacher dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  return (
    <div className="container-fluid py-4" data-testid="teacher-dashboard">
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
        <div>
          <h2 className="h3 fw-bold text-dark mb-1">
            {data?.teacher_name ? `${data.teacher_name} — Teaching Workspace` : 'Teaching Workspace'}
          </h2>
          <p className="text-muted mb-0">
            Assessment management, grading queue, and student performance metrics
          </p>
        </div>
        <div className="d-flex gap-2">
          <Button variant="secondary" size="sm" onClick={loadDashboard} disabled={loading}>
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="danger" dismissible onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading && !data ? (
        <div className="d-flex justify-content-center py-5">
          <LoadingSpinner size="lg" message="Loading teaching workspace..." />
        </div>
      ) : (
        <>
          {/* Key Metric Cards */}
          <div className="row g-4 mb-4">
            <div className="col-12 col-sm-6 col-xl-3">
              <div className="card shadow-sm border-0 border-start border-primary border-4 h-100">
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-start">
                    <div>
                      <div className="text-muted small text-uppercase fw-bold">My Quizzes</div>
                      <div className="h2 fw-bold text-dark mt-2 mb-0">
                        {data?.total_quizzes ?? 0}
                      </div>
                      <small className="text-muted">
                        {data?.published_quizzes ?? 0} published · {data?.draft_quizzes ?? 0} draft
                      </small>
                    </div>
                    <span className="badge bg-primary-subtle text-primary p-2">
                      <i className="bi bi-patch-question fs-4"></i>
                    </span>
                  </div>
                  <div className="mt-3">
                    <Link to="/teacher/quizzes" className="small text-decoration-none fw-semibold">
                      View All Quizzes &rarr;
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-12 col-sm-6 col-xl-3">
              <div className="card shadow-sm border-0 border-start border-success border-4 h-100">
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-start">
                    <div>
                      <div className="text-muted small text-uppercase fw-bold">Student Attempts</div>
                      <div className="h2 fw-bold text-dark mt-2 mb-0">
                        {data?.completed_attempts_count ?? 0}
                      </div>
                      <small className="text-muted">
                        {data?.total_attempts ?? 0} total submissions
                      </small>
                    </div>
                    <span className="badge bg-success-subtle text-success p-2">
                      <i className="bi bi-journal-check fs-4"></i>
                    </span>
                  </div>
                  <div className="mt-3">
                    <Link to="/teacher/results" className="small text-decoration-none fw-semibold text-success">
                      View Results &rarr;
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-12 col-sm-6 col-xl-3">
              <div className="card shadow-sm border-0 border-start border-warning border-4 h-100">
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-start">
                    <div>
                      <div className="text-muted small text-uppercase fw-bold">Needs Grading</div>
                      <div className="h2 fw-bold text-dark mt-2 mb-0">
                        {data?.quizzes_needing_grading_count ?? 0}
                      </div>
                      <small className="text-muted">
                        Quizzes waiting for manual essay grading
                      </small>
                    </div>
                    <span className="badge bg-warning-subtle text-warning p-2">
                      <i className="bi bi-pencil-square fs-4"></i>
                    </span>
                  </div>
                  <div className="mt-3">
                    <Link to="/teacher/grading" className="small text-decoration-none fw-semibold text-warning">
                      Open Grading Queue &rarr;
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-12 col-sm-6 col-xl-3">
              <div className="card shadow-sm border-0 border-start border-info border-4 h-100">
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-start">
                    <div>
                      <div className="text-muted small text-uppercase fw-bold">Average Score</div>
                      <div className="h2 fw-bold text-dark mt-2 mb-0">
                        {data?.avg_score ? `${data.avg_score}%` : '0%'}
                      </div>
                      <small className="text-muted">
                        Across all completed student attempts
                      </small>
                    </div>
                    <span className="badge bg-info-subtle text-info p-2">
                      <i className="bi bi-graph-up fs-4"></i>
                    </span>
                  </div>
                  <div className="mt-3">
                    <Link to="/teacher/results" className="small text-decoration-none fw-semibold text-info">
                      Analytics Breakdown &rarr;
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Action Navigation */}
          <div className="card shadow-sm border-0 mb-4">
            <div className="card-header bg-white border-bottom py-3">
              <h5 className="mb-0 fw-bold text-dark">Teacher Assessment Tools</h5>
            </div>
            <div className="card-body">
              <div className="row g-3">
                <div className="col-12 col-md-4">
                  <div className="p-3 border rounded bg-light h-100 d-flex flex-column justify-content-between">
                    <div>
                      <h6 className="fw-bold mb-1">Quiz Catalog</h6>
                      <p className="small text-muted mb-3">
                        Review published and draft assessments, manage questions, and preview layouts.
                      </p>
                    </div>
                    <Link to="/teacher/quizzes" className="btn btn-sm btn-primary align-self-start">
                      Open Quiz Catalog
                    </Link>
                  </div>
                </div>
                <div className="col-12 col-md-4">
                  <div className="p-3 border rounded bg-light h-100 d-flex flex-column justify-content-between">
                    <div>
                      <h6 className="fw-bold mb-1">Manual Grading Queue</h6>
                      <p className="small text-muted mb-3">
                        Evaluate student essay responses, assign marks, and provide constructive feedback.
                      </p>
                    </div>
                    <Link to="/teacher/grading" className="btn btn-sm btn-warning align-self-start">
                      Open Grading Queue
                    </Link>
                  </div>
                </div>
                <div className="col-12 col-md-4">
                  <div className="p-3 border rounded bg-light h-100 d-flex flex-column justify-content-between">
                    <div>
                      <h6 className="fw-bold mb-1">Results & Performance</h6>
                      <p className="small text-muted mb-3">
                        Analyze class pass rates, individual scores, and submission history.
                      </p>
                    </div>
                    <Link to="/teacher/results" className="btn btn-sm btn-success align-self-start">
                      View Results
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Quizzes & Recent Attempts Grid */}
          <div className="row g-4 mb-4">
            <div className="col-12 col-lg-6">
              <div className="card shadow-sm border-0 h-100">
                <div className="card-header bg-white border-bottom py-3 d-flex justify-content-between align-items-center">
                  <h6 className="mb-0 fw-bold text-dark">Recent Quizzes</h6>
                  <Link to="/teacher/quizzes" className="small text-decoration-none">
                    View all &rarr;
                  </Link>
                </div>
                <div className="card-body p-0">
                  {data?.recent_quizzes && data.recent_quizzes.length > 0 ? (
                    <div className="list-group list-group-flush">
                      {data.recent_quizzes.map((quiz) => (
                        <div key={quiz.id} className="list-group-item d-flex justify-content-between align-items-center p-3">
                          <div>
                            <Link to={`/teacher/quizzes/${quiz.id}`} className="fw-bold text-dark text-decoration-none">
                              {quiz.title}
                            </Link>
                            <div className="small text-muted mt-1">
                              {quiz.subject_name} · {quiz.total_questions} questions · {quiz.total_marks} marks
                            </div>
                          </div>
                          <span
                            className={`badge ${
                              quiz.status === 'published'
                                ? 'bg-success'
                                : quiz.status === 'draft'
                                ? 'bg-warning text-dark'
                                : 'bg-secondary'
                            }`}
                          >
                            {quiz.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-muted small">No quizzes created yet.</div>
                  )}
                </div>
              </div>
            </div>

            <div className="col-12 col-lg-6">
              <div className="card shadow-sm border-0 h-100">
                <div className="card-header bg-white border-bottom py-3 d-flex justify-content-between align-items-center">
                  <h6 className="mb-0 fw-bold text-dark">Recent Submissions</h6>
                  <Link to="/teacher/results" className="small text-decoration-none">
                    View all &rarr;
                  </Link>
                </div>
                <div className="card-body p-0">
                  {data?.recent_attempts && data.recent_attempts.length > 0 ? (
                    <div className="list-group list-group-flush">
                      {data.recent_attempts.map((att) => (
                        <div key={att.id} className="list-group-item d-flex justify-content-between align-items-center p-3">
                          <div>
                            <div className="fw-semibold text-dark">{att.student_name}</div>
                            <div className="small text-muted mt-1">
                              {att.quiz_title} · {att.admission_number}
                            </div>
                          </div>
                          <div className="text-end">
                            <span className="badge bg-primary-subtle text-primary border fw-bold">
                              {att.score}/{att.total_marks} ({att.percentage}%)
                            </span>
                            <div>
                              <small className="text-muted">
                                {att.is_graded ? 'Graded' : 'Needs Review'}
                              </small>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-muted small">No student attempts recorded yet.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
