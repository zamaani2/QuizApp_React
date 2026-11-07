import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchSuperadminDashboard } from '../../api/admin';
import type {
  SuperadminDashboardResponse,
  SuperadminDashboardSchool,
} from '../../types';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import './SuperadminDashboard.css';

const metricLabels: Array<{ key: keyof SuperadminDashboardResponse['stats']; label: string }> = [
  { key: 'total_schools', label: 'Active schools' },
  { key: 'inactive_schools', label: 'Inactive schools' },
  { key: 'total_users', label: 'User accounts' },
  { key: 'total_admins', label: 'Administrators' },
  { key: 'total_teachers', label: 'Teacher accounts' },
  { key: 'total_students', label: 'Student accounts' },
  { key: 'total_superadmins', label: 'Superadmins' },
  { key: 'total_students_all', label: 'Student records' },
  { key: 'total_teachers_all', label: 'Teacher records' },
  { key: 'total_classes', label: 'Classes' },
  { key: 'total_subjects', label: 'Subjects' },
  { key: 'total_quizzes', label: 'Quizzes' },
  { key: 'published_quizzes', label: 'Published quizzes' },
  { key: 'draft_quizzes', label: 'Draft quizzes' },
  { key: 'total_attempts', label: 'Quiz attempts' },
  { key: 'completed_attempts', label: 'Completed attempts' },
];

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

function SchoolRanking({ schools, countLabel }: {
  schools: SuperadminDashboardSchool[];
  countLabel: string;
}) {
  if (schools.length === 0) {
    return <p className="superadmin-dashboard__empty">No school records to display.</p>;
  }

  return (
    <ol className="superadmin-dashboard__ranking">
      {schools.map((school) => (
        <li key={school.id}>
          <Link to={`/superadmin/schools/${school.id}/`}>{school.name}</Link>
          <span>
            {(countLabel === 'Users' ? school.user_count : school.student_count) ?? 0} {countLabel}
          </span>
        </li>
      ))}
    </ol>
  );
}

export const SuperadminDashboard = () => {
  const [data, setData] = useState<SuperadminDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchSuperadminDashboard());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the system overview.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  return (
    <main className="superadmin-dashboard" data-testid="superadmin-dashboard">
      <header className="superadmin-dashboard__header">
        <div>
          <p className="superadmin-dashboard__eyebrow">Superadmin console</p>
          <h1>System overview</h1>
          <p>Monitor schools, accounts, assessments, and platform activity.</p>
        </div>
        <Button variant="secondary" onClick={loadDashboard} disabled={loading}>
          Refresh overview
        </Button>
      </header>

      {error && (
        <Alert variant="danger" dismissible onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading && !data ? (
        <div className="superadmin-dashboard__loading">
          <LoadingSpinner size="lg" message="Loading system overview..." />
        </div>
      ) : data ? (
        <>
          <section className="superadmin-dashboard__metrics" aria-label="System metrics">
            {metricLabels.map(({ key, label }) => (
              <article className="superadmin-dashboard__metric" key={key}>
                <span>{label}</span>
                <strong>{data.stats[key].toLocaleString()}</strong>
              </article>
            ))}
          </section>

          <section className="superadmin-dashboard__panel superadmin-dashboard__actions">
            <div>
              <h2>Quick actions</h2>
              <p>Go directly to common platform management tasks.</p>
            </div>
            <nav aria-label="Superadmin quick actions">
              <Link to="/superadmin/schools/new">Add a school</Link>
              <Link to="/superadmin/schools">Manage schools</Link>
              <Link to="/superadmin/admins">Manage administrators</Link>
              <Link to="/superadmin/users">Manage users</Link>
            </nav>
          </section>

          <div className="superadmin-dashboard__columns">
            <section className="superadmin-dashboard__panel">
              <h2>Recently added schools</h2>
              {data.recent_schools.length === 0 ? (
                <p className="superadmin-dashboard__empty">No schools have been added yet.</p>
              ) : (
                <div className="superadmin-dashboard__table-wrap">
                  <table>
                    <thead>
                      <tr><th>School</th><th>Status</th><th>Date added</th></tr>
                    </thead>
                    <tbody>
                      {data.recent_schools.map((school) => (
                        <tr key={school.id}>
                          <td><Link to={`/superadmin/schools/${school.id}/`}>{school.name}</Link></td>
                          <td>
                            <span className={school.is_active ? 'is-active' : 'is-inactive'}>
                              {school.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td>{formatDate(school.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="superadmin-dashboard__panel">
              <h2>Schools by users</h2>
              <SchoolRanking schools={data.schools_with_users} countLabel="Users" />
            </section>

            <section className="superadmin-dashboard__panel">
              <h2>Schools by students</h2>
              <SchoolRanking schools={data.schools_with_students} countLabel="Students" />
            </section>
          </div>

          <section className="superadmin-dashboard__panel">
            <h2>Recent quizzes</h2>
            {data.recent_quizzes.length === 0 ? (
              <p className="superadmin-dashboard__empty">No quizzes have been created yet.</p>
            ) : (
              <div className="superadmin-dashboard__table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Quiz</th><th>School</th><th>Teacher</th><th>Subject</th><th>Status</th><th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_quizzes.map((quiz) => (
                      <tr key={quiz.id}>
                        <td>{quiz.title}</td>
                        <td>{quiz.school_name || '—'}</td>
                        <td>{quiz.teacher_name || '—'}</td>
                        <td>{quiz.subject_name || '—'}</td>
                        <td>{quiz.status}</td>
                        <td>{formatDate(quiz.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
};
