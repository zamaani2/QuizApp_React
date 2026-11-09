import { AppIcon } from '../../components/common/AppIcon';
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
    <div className="core-container core-space--padding-y-4" data-testid="teacher-dashboard">
      <div className="core-display-flex core-layout--wrap core-layout--justify-between core-layout--align-center core-space--margin-bottom-4 core-layout--gap-3">
        <div>
          <h2 className="core-type--heading-3 core-type--weight-bold core-text--dark core-space--margin-bottom-1">
            {data?.teacher_name ? `${data.teacher_name} — Teaching Workspace` : 'Teaching Workspace'}
          </h2>
          <p className="core-text--muted core-space--margin-bottom-0">
            Assessment management, grading queue, and student performance metrics
          </p>
        </div>
        <div className="core-display-flex core-layout--gap-2">
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
        <div className="core-display-flex core-layout--justify-center core-space--padding-y-5">
          <LoadingSpinner size="lg" message="Loading teaching workspace..." />
        </div>
      ) : (
        <>
          {/* Quick Shortcuts Row */}
          <div className="core-display-flex core-layout--wrap core-layout--gap-2 core-space--margin-bottom-4" aria-label="Quick teaching shortcuts">
            <Link to="/teacher/quizzes" className="core-button core-button--sm core-button--outline-primary core-display-inline-flex core-layout--align-center core-layout--gap-1 core-radius--pill core-space--padding-x-3">
              <AppIcon name="badgeHelp" aria-hidden="true" /> Quiz Catalog
            </Link>
            <Link to="/teacher/quizzes/new" className="core-button core-button--sm core-button--primary core-display-inline-flex core-layout--align-center core-layout--gap-1 core-radius--pill core-space--padding-x-3">
              <AppIcon name="circlePlus" aria-hidden="true" /> Create Quiz
            </Link>
            <Link to="/teacher/grading" className="core-button core-button--sm core-button--outline-warning core-text--dark core-display-inline-flex core-layout--align-center core-layout--gap-1 core-radius--pill core-space--padding-x-3">
              <AppIcon name="squarePen" aria-hidden="true" /> Grading Queue
            </Link>
            <Link to="/teacher/results" className="core-button core-button--sm core-button--outline-success core-display-inline-flex core-layout--align-center core-layout--gap-1 core-radius--pill core-space--padding-x-3">
              <AppIcon name="chartColumn" aria-hidden="true" /> Results & Reports
            </Link>
          </div>

          {/* Primary Action Card */}
          <div className="core-card core-shadow--sm core-border--none core-space--margin-bottom-4 core-space--padding-4" style={{ background: 'linear-gradient(135deg, #0f2942 0%, #1e3a5f 100%)', color: '#ffffff', borderRadius: '12px' }}>
            <div className="core-display-flex core-layout--wrap core-layout--justify-between core-layout--align-center core-layout--gap-3">
              <div>
                <span className="core-badge core-surface--info core-text--dark core-radius--pill core-space--padding-x-3 core-space--padding-y-1 core-space--margin-bottom-2 core-type--weight-semibold">Teaching Workspace</span>
                <h3 className="core-type--heading-4 core-type--weight-bold core-text--white core-space--margin-bottom-1">Assessment Builder & Evaluation</h3>
                <p className="core-space--margin-bottom-0 core-text--white-50" style={{ maxWidth: '650px' }}>
                  Create customized quizzes, build questions with multiple answer formats, and evaluate student submissions in real time.
                </p>
              </div>
              <div className="core-display-flex core-layout--wrap core-layout--gap-2">
                <Link to="/teacher/quizzes/new" className="core-button core-button--light core-type--weight-bold core-space--padding-x-3 core-space--padding-y-2 core-text--dark">
                  New Quiz &rarr;
                </Link>
                <Link to="/teacher/grading" className="core-button core-button--outline-light core-type--weight-bold core-space--padding-x-3 core-space--padding-y-2">
                  Open Grading
                </Link>
              </div>
            </div>
          </div>

          {/* Key Metric Cards */}
          <div className="core-grid core-grid--gap-4 core-space--margin-bottom-4">
            <div className="core-grid__span-12 core-grid__span-sm-6 core-grid__span-xl-3">
              <div className="core-card core-shadow--sm core-border--none core-border--start core-border--primary core-border--width-4 core-size--height-full">
                <div className="core-card__body">
                  <div className="core-display-flex core-layout--justify-between core-layout--align-start">
                    <div>
                      <div className="core-text--muted core-type--small core-text--uppercase core-type--weight-bold">My Quizzes</div>
                      <div className="core-type--heading-2 core-type--weight-bold core-text--dark core-space--margin-top-2 core-space--margin-bottom-0">
                        {data?.total_quizzes ?? 0}
                      </div>
                      <small className="core-text--muted">
                        {data?.published_quizzes ?? 0} published · {data?.draft_quizzes ?? 0} draft
                      </small>
                    </div>
                    <span className="core-badge core-surface--primary-subtle core-text--primary core-space--padding-2">
                      <AppIcon name="badgeHelp" className="core-type--size-4" />
                    </span>
                  </div>
                  <div className="core-space--margin-top-3">
                    <Link to="/teacher/quizzes" className="core-type--small core-text--decoration-none core-type--weight-semibold">
                      View All Quizzes &rarr;
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            <div className="core-grid__span-12 core-grid__span-sm-6 core-grid__span-xl-3">
              <div className="core-card core-shadow--sm core-border--none core-border--start core-border--success core-border--width-4 core-size--height-full">
                <div className="core-card__body">
                  <div className="core-display-flex core-layout--justify-between core-layout--align-start">
                    <div>
                      <div className="core-text--muted core-type--small core-text--uppercase core-type--weight-bold">Student Attempts</div>
                      <div className="core-type--heading-2 core-type--weight-bold core-text--dark core-space--margin-top-2 core-space--margin-bottom-0">
                        {data?.completed_attempts_count ?? 0}
                      </div>
                      <small className="core-text--muted">
                        {data?.total_attempts ?? 0} total submissions
                      </small>
                    </div>
                    <span className="core-badge core-surface--success-subtle core-text--success core-space--padding-2">
                      <AppIcon name="clipboardCheck" className="core-type--size-4" />
                    </span>
                  </div>
                  <div className="core-space--margin-top-3">
                    <Link to="/teacher/results" className="core-type--small core-text--decoration-none core-type--weight-semibold core-text--success">
                      View Results &rarr;
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            <div className="core-grid__span-12 core-grid__span-sm-6 core-grid__span-xl-3">
              <div className="core-card core-shadow--sm core-border--none core-border--start core-border--warning core-border--width-4 core-size--height-full">
                <div className="core-card__body">
                  <div className="core-display-flex core-layout--justify-between core-layout--align-start">
                    <div>
                      <div className="core-text--muted core-type--small core-text--uppercase core-type--weight-bold">Needs Grading</div>
                      <div className="core-type--heading-2 core-type--weight-bold core-text--dark core-space--margin-top-2 core-space--margin-bottom-0">
                        {data?.quizzes_needing_grading_count ?? 0}
                      </div>
                      <small className="core-text--muted">
                        Quizzes waiting for manual essay grading
                      </small>
                    </div>
                    <span className="core-badge core-surface--warning-subtle core-text--warning core-space--padding-2">
                      <AppIcon name="squarePen" className="core-type--size-4" />
                    </span>
                  </div>
                  <div className="core-space--margin-top-3">
                    <Link to="/teacher/grading" className="core-type--small core-text--decoration-none core-type--weight-semibold core-text--warning">
                      Open Grading Queue &rarr;
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            <div className="core-grid__span-12 core-grid__span-sm-6 core-grid__span-xl-3">
              <div className="core-card core-shadow--sm core-border--none core-border--start core-border--info core-border--width-4 core-size--height-full">
                <div className="core-card__body">
                  <div className="core-display-flex core-layout--justify-between core-layout--align-start">
                    <div>
                      <div className="core-text--muted core-type--small core-text--uppercase core-type--weight-bold">Average Score</div>
                      <div className="core-type--heading-2 core-type--weight-bold core-text--dark core-space--margin-top-2 core-space--margin-bottom-0">
                        {data?.avg_score ? `${data.avg_score}%` : '0%'}
                      </div>
                      <small className="core-text--muted">
                        Across all completed student attempts
                      </small>
                    </div>
                    <span className="core-badge core-surface--info-subtle core-text--info core-space--padding-2">
                      <AppIcon name="chartUp" className="core-type--size-4" />
                    </span>
                  </div>
                  <div className="core-space--margin-top-3">
                    <Link to="/teacher/results" className="core-type--small core-text--decoration-none core-type--weight-semibold core-text--info">
                      Analytics Breakdown &rarr;
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Action Navigation */}
          <div className="core-card core-shadow--sm core-border--none core-space--margin-bottom-4">
            <div className="core-card__header core-surface--white core-border--bottom core-space--padding-y-3">
              <h5 className="core-space--margin-bottom-0 core-type--weight-bold core-text--dark">Teacher Assessment Tools</h5>
            </div>
            <div className="core-card__body">
              <div className="core-grid core-grid--gap-3">
                <div className="core-grid__span-12 core-grid__span-md-4">
                  <div className="core-space--padding-3 core-border core-radius core-surface--light core-size--height-full core-display-flex core-layout--column core-layout--justify-between">
                    <div>
                      <h6 className="core-type--weight-bold core-space--margin-bottom-1">Quiz Catalog</h6>
                      <p className="core-type--small core-text--muted core-space--margin-bottom-3">
                        Review published and draft assessments, manage questions, and preview layouts.
                      </p>
                    </div>
                    <Link to="/teacher/quizzes" className="core-button core-button--sm core-button--primary core-layout--self-start">
                      Open Quiz Catalog
                    </Link>
                  </div>
                </div>
                <div className="core-grid__span-12 core-grid__span-md-4">
                  <div className="core-space--padding-3 core-border core-radius core-surface--light core-size--height-full core-display-flex core-layout--column core-layout--justify-between">
                    <div>
                      <h6 className="core-type--weight-bold core-space--margin-bottom-1">Manual Grading Queue</h6>
                      <p className="core-type--small core-text--muted core-space--margin-bottom-3">
                        Evaluate student essay responses, assign marks, and provide constructive feedback.
                      </p>
                    </div>
                    <Link to="/teacher/grading" className="core-button core-button--sm core-button--warning core-layout--self-start">
                      Open Grading Queue
                    </Link>
                  </div>
                </div>
                <div className="core-grid__span-12 core-grid__span-md-4">
                  <div className="core-space--padding-3 core-border core-radius core-surface--light core-size--height-full core-display-flex core-layout--column core-layout--justify-between">
                    <div>
                      <h6 className="core-type--weight-bold core-space--margin-bottom-1">Results & Performance</h6>
                      <p className="core-type--small core-text--muted core-space--margin-bottom-3">
                        Analyze class pass rates, individual scores, and submission history.
                      </p>
                    </div>
                    <Link to="/teacher/results" className="core-button core-button--sm core-button--success core-layout--self-start">
                      View Results
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Quizzes & Recent Attempts Grid */}
          <div className="core-grid core-grid--gap-4 core-space--margin-bottom-4">
            <div className="core-grid__span-12 core-grid__span-lg-6">
              <div className="core-card core-shadow--sm core-border--none core-size--height-full">
                <div className="core-card__header core-surface--white core-border--bottom core-space--padding-y-3 core-display-flex core-layout--justify-between core-layout--align-center">
                  <h6 className="core-space--margin-bottom-0 core-type--weight-bold core-text--dark">Recent Quizzes</h6>
                  <Link to="/teacher/quizzes" className="core-type--small core-text--decoration-none">
                    View all &rarr;
                  </Link>
                </div>
                <div className="core-card__body core-space--padding-0">
                  {data?.recent_quizzes && data.recent_quizzes.length > 0 ? (
                    <div className="core-list core-list--flush">
                      {data.recent_quizzes.map((quiz) => (
                        <div key={quiz.id} className="core-list__item core-display-flex core-layout--justify-between core-layout--align-center core-space--padding-3">
                          <div>
                            <Link to={`/teacher/quizzes/${quiz.id}`} className="core-type--weight-bold core-text--dark core-text--decoration-none">
                              {quiz.title}
                            </Link>
                            <div className="core-type--small core-text--muted core-space--margin-top-1">
                              {quiz.subject_name} · {quiz.total_questions} questions · {quiz.total_marks} marks
                            </div>
                          </div>
                          <span
                            className={`core-badge ${
                              quiz.status === 'published'
                                ? 'core-surface--success'
                                : quiz.status === 'draft'
                                ? 'core-surface--warning core-text--dark'
                                : 'core-surface--secondary'
                            }`}
                          >
                            {quiz.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="core-space--padding-4 core-text--center core-text--muted core-type--small">No quizzes created yet.</div>
                  )}
                </div>
              </div>
            </div>

            <div className="core-grid__span-12 core-grid__span-lg-6">
              <div className="core-card core-shadow--sm core-border--none core-size--height-full">
                <div className="core-card__header core-surface--white core-border--bottom core-space--padding-y-3 core-display-flex core-layout--justify-between core-layout--align-center">
                  <h6 className="core-space--margin-bottom-0 core-type--weight-bold core-text--dark">Recent Submissions</h6>
                  <Link to="/teacher/results" className="core-type--small core-text--decoration-none">
                    View all &rarr;
                  </Link>
                </div>
                <div className="core-card__body core-space--padding-0">
                  {data?.recent_attempts && data.recent_attempts.length > 0 ? (
                    <div className="core-list core-list--flush">
                      {data.recent_attempts.map((att) => (
                        <div key={att.id} className="core-list__item core-display-flex core-layout--justify-between core-layout--align-center core-space--padding-3">
                          <div>
                            <div className="core-type--weight-semibold core-text--dark">{att.student_name}</div>
                            <div className="core-type--small core-text--muted core-space--margin-top-1">
                              {att.quiz_title} · {att.admission_number}
                            </div>
                          </div>
                          <div className="core-text--end">
                            <span className="core-badge core-surface--primary-subtle core-text--primary core-border core-type--weight-bold">
                              {att.score}/{att.total_marks} ({att.percentage}%)
                            </span>
                            <div>
                              <small className="core-text--muted">
                                {att.is_graded ? 'Graded' : 'Needs Review'}
                              </small>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="core-space--padding-4 core-text--center core-text--muted core-type--small">No student attempts recorded yet.</div>
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
