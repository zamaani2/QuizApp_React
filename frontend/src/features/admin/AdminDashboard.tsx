import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { fetchAdminDashboard } from '../../api/admin';
import type { AdminDashboardOverview } from '../../types';
import { Alert } from '../../components/common/Alert';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import './AdminDashboard.css';

export const AdminDashboard: React.FC = () => {
  const [data, setData] = useState<AdminDashboardOverview | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchAdminDashboard();
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const metrics = [
    { label: 'Students', detail: 'Student records', value: data?.total_students ?? 0, icon: 'bi-people', tone: 'students' },
    { label: 'Teachers', detail: 'Teaching staff', value: data?.total_teachers ?? 0, icon: 'bi-person-badge', tone: 'teachers' },
    { label: 'Active classes', detail: 'School classes', value: data?.total_classes ?? 0, icon: 'bi-building', tone: 'classes' },
    { label: 'Quizzes', detail: 'Assessments', value: data?.total_quizzes ?? 0, icon: 'bi-patch-question', tone: 'quizzes' },
  ];

  return (
    <div className="admin-dashboard" data-testid="admin-dashboard">
      <header className="admin-dashboard__heading">
        <div className="admin-dashboard__title-group">
          <p className="admin-dashboard__eyebrow"><span aria-hidden="true" /> SCHOOL ADMINISTRATION</p>
          <h2>
            {data?.school_name ? `${data.school_name} — Overview` : 'School Administration'}
          </h2>
          <p className="admin-dashboard__intro">A clear view of your school’s people, classes, and assessment activity.</p>
          <div className="admin-dashboard__period" aria-label="Current academic period">
            {(data?.active_academic_year || data?.current_academic_year) && (
              <span className="admin-dashboard__period-chip">
                <i className="bi bi-calendar3" aria-hidden="true" />
                Academic Year: {data?.active_academic_year || data?.current_academic_year}
              </span>
            )}
            {(data?.active_term || data?.current_term) && (
              <span className="admin-dashboard__period-chip">
                <i className="bi bi-calendar-range" aria-hidden="true" />
                Term: {data?.active_term || data?.current_term}
              </span>
            )}
          </div>
        </div>
        <div className="admin-dashboard__heading-actions">
          <button className="admin-dashboard__refresh" type="button" onClick={loadDashboard} disabled={loading}>
            <i className={`bi ${loading ? 'bi-arrow-repeat admin-dashboard__refresh-icon--loading' : 'bi-arrow-clockwise'}`} aria-hidden="true" />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {error && (
        <Alert variant="danger" dismissible onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading && !data ? (
        <div className="admin-dashboard__loading">
          <LoadingSpinner size="lg" message="Loading dashboard metrics..." />
        </div>
      ) : (
        <>
          <section className="admin-dashboard__metrics" aria-label="School overview metrics">
            {metrics.map((metric) => (
              <article className={`admin-metric admin-metric--${metric.tone}`} key={metric.label}>
                <div className="admin-metric__label">
                  <span className="admin-metric__icon"><i className={`bi ${metric.icon}`} aria-hidden="true" /></span>
                  <h3>{metric.label}</h3>
                </div>
                <p className="admin-metric__value">{new Intl.NumberFormat().format(metric.value)}</p>
                <p className="admin-metric__detail">{metric.detail}</p>
              </article>
            ))}
          </section>

          <section className="admin-dashboard__workflows" aria-labelledby="admin-workflows-title">
            <div className="admin-dashboard__section-intro">
              <div>
                <p className="admin-dashboard__eyebrow"><span aria-hidden="true" /> YOUR WORKSPACE</p>
                <h3 id="admin-workflows-title">School workflows</h3>
              </div>
              <p>Go straight to the tools you use to keep your school running smoothly.</p>
            </div>
            <div className="admin-workflow-list">
              <article className="admin-workflow">
                <div className="admin-workflow__category">
                  <span className="admin-workflow__icon"><i className="bi bi-people" aria-hidden="true" /></span>
                  <div><span className="admin-workflow__number">01 / PEOPLE</span><h4>People and enrollment</h4></div>
                </div>
                <p>Maintain student records, staff profiles, and class enrollments.</p>
                <div className="admin-workflow__links">
                  <Link to="/admin/students"><i className="bi bi-person-lines-fill" aria-hidden="true" /> Student directory <span aria-hidden="true">↗</span></Link>
                  <Link to="/admin/teachers"><i className="bi bi-person-badge" aria-hidden="true" /> Teacher directory <span aria-hidden="true">↗</span></Link>
                  <Link to="/admin/enrollments"><i className="bi bi-person-plus" aria-hidden="true" /> Class enrollments <span aria-hidden="true">↗</span></Link>
                </div>
              </article>
              <article className="admin-workflow">
                <div className="admin-workflow__category">
                  <span className="admin-workflow__icon"><i className="bi bi-journal-richtext" aria-hidden="true" /></span>
                  <div><span className="admin-workflow__number">02 / ACADEMICS</span><h4>Academic structure</h4></div>
                </div>
                <p>Set up the year, terms, classes, and subjects for your school.</p>
                <div className="admin-workflow__links">
                  <Link to="/admin/academic-years"><i className="bi bi-calendar3" aria-hidden="true" /> Academic years <span aria-hidden="true">↗</span></Link>
                  <Link to="/admin/terms"><i className="bi bi-calendar-range" aria-hidden="true" /> Terms <span aria-hidden="true">↗</span></Link>
                  <Link to="/admin/classes"><i className="bi bi-building" aria-hidden="true" /> Classes <span aria-hidden="true">↗</span></Link>
                  <Link to="/admin/subjects"><i className="bi bi-journal-bookmark" aria-hidden="true" /> Subjects <span aria-hidden="true">↗</span></Link>
                </div>
              </article>
            </div>
          </section>
        </>
      )}
    </div>
  );
};
