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
    { label: 'Students', value: data?.total_students ?? 0, icon: 'bi-people', tone: 'students' },
    { label: 'Teachers', value: data?.total_teachers ?? 0, icon: 'bi-person-badge', tone: 'teachers' },
    { label: 'Active classes', value: data?.total_classes ?? 0, icon: 'bi-building', tone: 'classes' },
    { label: 'Quizzes', value: data?.total_quizzes ?? 0, icon: 'bi-patch-question', tone: 'quizzes' },
  ];

  return (
    <div className="admin-dashboard" data-testid="admin-dashboard">
      <header className="admin-dashboard__heading">
        <div className="admin-dashboard__title-group">
          <p className="admin-dashboard__eyebrow">SCHOOL ADMINISTRATION</p>
          <h2>
            {data?.school_name ? `${data.school_name} — Overview` : 'School Administration'}
          </h2>
          <div className="admin-dashboard__period" aria-label="Current academic period">
            {(data?.active_academic_year || data?.current_academic_year) && (
              <span>
                Academic Year: {data?.active_academic_year || data?.current_academic_year}
              </span>
            )}
            {(data?.active_term || data?.current_term) && (
              <span>
                Term: {data?.active_term || data?.current_term}
              </span>
            )}
          </div>
        </div>
        <div className="admin-dashboard__heading-actions">
          <button className="admin-dashboard__refresh" type="button" onClick={loadDashboard} disabled={loading}>
            <i className="bi bi-arrow-clockwise" aria-hidden="true" />
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
                  <i className={`bi ${metric.icon}`} aria-hidden="true" />
                  <h3>{metric.label}</h3>
                </div>
                <p className="admin-metric__value">{new Intl.NumberFormat().format(metric.value)}</p>
              </article>
            ))}
          </section>

          <section className="admin-dashboard__workflows" aria-labelledby="admin-workflows-title">
            <div className="admin-dashboard__section-intro">
              <p className="admin-dashboard__eyebrow">YOUR WORKSPACE</p>
              <h3 id="admin-workflows-title">School workflows</h3>
              <p>Move from records to academic planning and assessment management.</p>
            </div>
            <div className="admin-workflow-list">
              <article className="admin-workflow">
                <div className="admin-workflow__category"><span>01</span><h4>People</h4></div>
                <p>Maintain student records, staff profiles, and class enrollments.</p>
                <div className="admin-workflow__links">
                  <Link to="/admin/students">Open Student Directory <span aria-hidden="true">&rarr;</span></Link>
                  <Link to="/admin/teachers">Open Teacher Directory <span aria-hidden="true">&rarr;</span></Link>
                  <Link to="/admin/enrollments">Manage class enrollments <span aria-hidden="true">&rarr;</span></Link>
                </div>
              </article>
              <article className="admin-workflow">
                <div className="admin-workflow__category"><span>02</span><h4>Academic structure</h4></div>
                <p>Set up the year, terms, classes, and subjects for your school.</p>
                <div className="admin-workflow__links">
                  <Link to="/admin/academic-years">Manage academic years <span aria-hidden="true">&rarr;</span></Link>
                  <Link to="/admin/terms">Manage terms <span aria-hidden="true">&rarr;</span></Link>
                  <Link to="/admin/classes">Manage classes <span aria-hidden="true">&rarr;</span></Link>
                  <Link to="/admin/subjects">Manage subjects <span aria-hidden="true">&rarr;</span></Link>
                </div>
              </article>
            </div>
          </section>
        </>
      )}
    </div>
  );
};
