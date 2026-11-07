import React, { useEffect, useState } from 'react';
import { studentApi } from '../../api/student';
import type { StudentProfileData } from '../../types/student';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';

export const StudentProfileView: React.FC = () => {
  const [data, setData] = useState<StudentProfileData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'academic' | 'performance'>('academic');

  const loadProfile = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await studentApi.getStudentProfile();
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load student profile.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  if (loading) {
    return (
      <div className="container-fluid py-5 text-center">
        <LoadingSpinner message="Loading student profile & academic records..." />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container-fluid py-4">
        <Alert variant="danger" dismissible onDismiss={() => setError(null)}>
          {error || 'Unable to retrieve student profile.'}
        </Alert>
        <div className="text-center py-4">
          <Button variant="primary" onClick={loadProfile}>
            <i className="bi bi-arrow-clockwise me-1" /> Retry Loading Profile
          </Button>
        </div>
      </div>
    );
  }

  const { personal, academic, enrollments, stats } = data;

  return (
    <div className="container-fluid py-4">
      {/* Top Banner / Actions */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4">
        <div>
          <div className="d-flex align-items-center gap-2">
            <h1 className="h3 fw-bold mb-0 text-dark">Student Profile</h1>
            <span className="badge bg-primary-subtle text-primary border border-primary-subtle">
              {personal.admission_number}
            </span>
            <span className={`badge ${personal.is_active ? 'bg-success' : 'bg-secondary'}`}>
              {personal.is_active ? 'Active' : 'Archived'}
            </span>
          </div>
          <p className="text-muted small mb-0 mt-1">
            Official academic enrollment records, personal contact details, and assessment performance.
          </p>
        </div>

        <div className="d-flex align-items-center gap-2 flex-wrap">
          <a href="/app/student/quizzes" className="btn btn-primary btn-sm">
            <i className="bi bi-patch-question me-1" />
            Available Quizzes
          </a>
          <a href="/app/student/attempts" className="btn btn-outline-primary btn-sm">
            <i className="bi bi-award me-1" />
            My Attempts
          </a>
        </div>
      </div>

      {/* Hero Profile Overview Card */}
      <div className="card shadow-sm border-0 mb-4 overflow-hidden">
        <div className="card-body p-4">
          <div className="row align-items-center g-4">
            <div className="col-auto text-center">
              {personal.profile_picture_url ? (
                <img
                  src={personal.profile_picture_url}
                  alt={personal.full_name}
                  className="rounded-circle shadow-sm border border-2 border-primary"
                  style={{ width: '96px', height: '96px', objectFit: 'cover' }}
                />
              ) : (
                <div
                  className="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center shadow-sm fw-bold mx-auto"
                  style={{ width: '96px', height: '96px', fontSize: '2.4rem' }}
                >
                  {personal.full_name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            <div className="col">
              <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
                <h2 className="h4 fw-bold mb-0 text-dark">{personal.full_name}</h2>
                <span className="badge bg-light text-dark border">
                  {personal.gender_display}
                </span>
                {academic.current_class && (
                  <span className="badge bg-info-subtle text-info-emphasis border border-info-subtle">
                    <i className="bi bi-building me-1" />
                    {academic.current_class.name}
                  </span>
                )}
              </div>

              <div className="text-secondary small d-flex flex-wrap gap-3 mt-2">
                <div>
                  <i className="bi bi-person-badge me-1 text-primary" />
                  Admission No: <strong className="text-dark">{personal.admission_number}</strong>
                </div>
                {academic.school_name && (
                  <div>
                    <i className="bi bi-mortarboard-fill me-1 text-primary" />
                    School: <strong className="text-dark">{academic.school_name}</strong>
                  </div>
                )}
                {academic.form_name && (
                  <div>
                    <i className="bi bi-journal-bookmark me-1 text-primary" />
                    Level: <strong className="text-dark">{academic.form_name}</strong>
                  </div>
                )}
                {personal.email && (
                  <div>
                    <i className="bi bi-envelope me-1 text-primary" />
                    {personal.email}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="row g-3 mb-4">
        <div className="col-6 col-lg-3">
          <div className="card shadow-sm border-0 h-100">
            <div className="card-body p-3 text-center">
              <div className="text-secondary small fw-semibold text-uppercase">Assessments Taken</div>
              <div className="display-6 fw-bold text-primary mt-1">{stats.total_completed}</div>
              <div className="small text-muted mt-1">Submitted attempts</div>
            </div>
          </div>
        </div>

        <div className="col-6 col-lg-3">
          <div className="card shadow-sm border-0 h-100">
            <div className="card-body p-3 text-center">
              <div className="text-secondary small fw-semibold text-uppercase">Pass Rate</div>
              <div className={`display-6 fw-bold mt-1 ${stats.pass_rate >= 50 ? 'text-success' : 'text-danger'}`}>
                {stats.pass_rate}%
              </div>
              <div className="small text-muted mt-1">
                {stats.passed_count} passed / {stats.failed_count} failed
              </div>
            </div>
          </div>
        </div>

        <div className="col-6 col-lg-3">
          <div className="card shadow-sm border-0 h-100">
            <div className="card-body p-3 text-center">
              <div className="text-secondary small fw-semibold text-uppercase">Average Score</div>
              <div className="display-6 fw-bold text-info mt-1">{stats.avg_score}%</div>
              <div className="small text-muted mt-1">Across all completed quizzes</div>
            </div>
          </div>
        </div>

        <div className="col-6 col-lg-3">
          <div className="card shadow-sm border-0 h-100">
            <div className="card-body p-3 text-center">
              <div className="text-secondary small fw-semibold text-uppercase">Highest Score</div>
              <div className="display-6 fw-bold text-warning mt-1">{stats.best_score}%</div>
              <div className="small text-muted mt-1">Personal best record</div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <ul className="nav nav-tabs mb-4 border-bottom" role="tablist">
        <li className="nav-item" role="presentation">
          <button
            type="button"
            className={`nav-link fw-semibold px-4 py-2 ${activeTab === 'academic' ? 'active' : ''}`}
            onClick={() => setActiveTab('academic')}
          >
            <i className="bi bi-mortarboard me-2" />
            Academic & Cohort Roster
          </button>
        </li>
        <li className="nav-item" role="presentation">
          <button
            type="button"
            className={`nav-link fw-semibold px-4 py-2 ${activeTab === 'performance' ? 'active' : ''}`}
            onClick={() => setActiveTab('performance')}
          >
            <i className="bi bi-graph-up me-2" />
            Performance & Assessment Records
          </button>
        </li>
      </ul>

      {/* Tab 1: Academic & Cohort Roster */}
      {activeTab === 'academic' && (
        <div className="row g-4">
          {/* Left Column: Personal Information Details */}
          <div className="col-lg-4">
            <div className="card shadow-sm border-0 h-100">
              <div className="card-header bg-white py-3 border-bottom">
                <h3 className="h6 fw-bold mb-0 text-dark">
                  <i className="bi bi-person-lines-fill text-primary me-2" />
                  Personal Information
                </h3>
              </div>
              <div className="card-body">
                <ul className="list-group list-group-flush small">
                  <li className="list-group-item px-0 py-2 d-flex justify-content-between align-items-center">
                    <span className="text-secondary">Admission Number:</span>
                    <strong className="text-dark">{personal.admission_number}</strong>
                  </li>
                  <li className="list-group-item px-0 py-2 d-flex justify-content-between align-items-center">
                    <span className="text-secondary">Gender:</span>
                    <strong className="text-dark">{personal.gender_display}</strong>
                  </li>
                  <li className="list-group-item px-0 py-2 d-flex justify-content-between align-items-center">
                    <span className="text-secondary">Date of Birth:</span>
                    <strong className="text-dark">
                      {personal.date_of_birth ? new Date(personal.date_of_birth).toLocaleDateString() : '—'}
                    </strong>
                  </li>
                  <li className="list-group-item px-0 py-2 d-flex justify-content-between align-items-center">
                    <span className="text-secondary">Admission Date:</span>
                    <strong className="text-dark">
                      {personal.admission_date ? new Date(personal.admission_date).toLocaleDateString() : '—'}
                    </strong>
                  </li>
                  <li className="list-group-item px-0 py-2 d-flex justify-content-between align-items-center">
                    <span className="text-secondary">Parent / Guardian Contact:</span>
                    <strong className="text-dark">{personal.parent_contact || '—'}</strong>
                  </li>
                  <li className="list-group-item px-0 py-2 d-flex justify-content-between align-items-center">
                    <span className="text-secondary">Email:</span>
                    <strong className="text-dark">{personal.email || '—'}</strong>
                  </li>
                  <li className="list-group-item px-0 py-2 d-flex justify-content-between align-items-center">
                    <span className="text-secondary">Account Status:</span>
                    <span className={`badge ${personal.is_active ? 'bg-success' : 'bg-secondary'}`}>
                      {personal.is_active ? 'Active' : 'Archived'}
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Right Column: Class Enrollment Timeline */}
          <div className="col-lg-8">
            <div className="card shadow-sm border-0 mb-4">
              <div className="card-header bg-white py-3 border-bottom d-flex justify-content-between align-items-center">
                <h3 className="h6 fw-bold mb-0 text-dark">
                  <i className="bi bi-clock-history text-primary me-2" />
                  Class Enrollment History
                </h3>
                <span className="badge bg-primary-subtle text-primary border border-primary-subtle">
                  {enrollments.length} Record{enrollments.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="card-body p-0">
                {enrollments.length === 0 ? (
                  <div className="p-4 text-center text-muted">
                    <i className="bi bi-inbox fs-2 d-block mb-2 text-secondary" />
                    No class enrollment records found.
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0 small">
                      <thead className="table-light">
                        <tr>
                          <th>Class Cohort</th>
                          <th>Session / Year</th>
                          <th>Date Assigned</th>
                          <th>Assigned By</th>
                          <th className="text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {enrollments.map((enr) => (
                          <tr key={enr.id}>
                            <td>
                              <div className="fw-bold text-dark">{enr.class_name}</div>
                              {enr.class_code && (
                                <code className="small text-muted">{enr.class_code}</code>
                              )}
                            </td>
                            <td>{enr.academic_year || '—'}</td>
                            <td>
                              {enr.date_assigned
                                ? new Date(enr.date_assigned).toLocaleDateString()
                                : '—'}
                            </td>
                            <td>{enr.assigned_by_name || 'System'}</td>
                            <td className="text-center">
                              <span
                                className={`badge ${
                                  enr.is_active ? 'bg-success' : 'bg-secondary'
                                }`}
                              >
                                {enr.is_active ? 'Active' : 'Past'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Academic Departmental Affiliation */}
            <div className="card shadow-sm border-0">
              <div className="card-header bg-white py-3 border-bottom">
                <h3 className="h6 fw-bold mb-0 text-dark">
                  <i className="bi bi-building-gear text-primary me-2" />
                  Academic Affiliation & Placement
                </h3>
              </div>
              <div className="card-body">
                <div className="row g-3">
                  <div className="col-sm-6">
                    <div className="p-3 rounded-2 bg-light border">
                      <span className="small text-secondary d-block">Form / Grade Level</span>
                      <strong className="fs-6 text-dark">{academic.form_name || 'Unassigned'}</strong>
                    </div>
                  </div>
                  <div className="col-sm-6">
                    <div className="p-3 rounded-2 bg-light border">
                      <span className="small text-secondary d-block">Learning Area / Track</span>
                      <strong className="fs-6 text-dark">
                        {academic.learning_area_name || 'General Curriculum'}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Performance & Assessment Records */}
      {activeTab === 'performance' && (
        <div className="card shadow-sm border-0">
          <div className="card-header bg-white py-3 border-bottom d-flex justify-content-between align-items-center">
            <div>
              <h3 className="h6 fw-bold mb-0 text-dark">
                <i className="bi bi-journal-check text-primary me-2" />
                Recent Assessment History
              </h3>
              <p className="text-muted small mb-0 mt-1">
                Latest quiz submissions and verified scores.
              </p>
            </div>
            <a href="/app/student/attempts" className="btn btn-outline-primary btn-sm">
              View All Attempts <i className="bi bi-arrow-right ms-1" />
            </a>
          </div>

          <div className="card-body p-0">
            {stats.recent_activity.length === 0 ? (
              <div className="p-5 text-center text-muted">
                <i className="bi bi-patch-question fs-1 d-block mb-2 text-secondary" />
                <p className="mb-3">You haven't completed any quiz assessments yet.</p>
                <a href="/app/student/quizzes" className="btn btn-primary btn-sm">
                  <i className="bi bi-play-circle me-1" /> Browse Available Quizzes
                </a>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0 small">
                  <thead className="table-light">
                    <tr>
                      <th>Assessment & Subject</th>
                      <th>Submitted Date</th>
                      <th>Score</th>
                      <th>Percentage</th>
                      <th className="text-center">Outcome</th>
                      <th className="text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recent_activity.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div className="fw-bold text-dark">{item.quiz_title}</div>
                          {item.subject_name && (
                            <span className="text-muted small">{item.subject_name}</span>
                          )}
                        </td>
                        <td>
                          {item.submitted_at
                            ? new Date(item.submitted_at).toLocaleDateString()
                            : '—'}
                        </td>
                        <td>
                          <strong>{item.score}</strong> / {item.total_marks}
                        </td>
                        <td>
                          <div className="d-flex align-items-center gap-2">
                            <span className="fw-semibold">{item.percentage}%</span>
                            <div
                              className="progress flex-grow-1"
                              style={{ height: '6px', minWidth: '60px' }}
                            >
                              <div
                                className={`progress-bar ${
                                  item.is_passed ? 'bg-success' : 'bg-danger'
                                }`}
                                style={{ width: `${Math.min(item.percentage, 100)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="text-center">
                          <span
                            className={`badge ${
                              item.is_passed ? 'bg-success' : 'bg-danger'
                            }`}
                          >
                            {item.is_passed ? 'Passed' : 'Failed'}
                          </span>
                        </td>
                        <td className="text-end">
                          <a
                            href={`/app/student/attempts/${item.id}/result`}
                            className="btn btn-sm btn-outline-primary"
                            title="View detailed scorecard"
                          >
                            <i className="bi bi-file-earmark-text me-1" />
                            Scorecard
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
