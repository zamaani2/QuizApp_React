import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Alert } from '../../components/common/Alert';

export const TeacherProfileView = () => {
  const { data } = useAuth();
  const user = data?.user;
  const profile = data?.profile;

  if (!user || !profile || profile.type !== 'teacher') {
    return <Alert variant="danger">Teacher profile information is unavailable.</Alert>;
  }

  return (
    <section className="core-card" data-testid="teacher-profile">
      <div className="core-card__header">
        <h1 className="core-type--heading-5 core-type--weight-bold core-space--margin-bottom-0">Teacher profile</h1>
      </div>
      <div className="core-card__body">
        <dl className="core-display-grid core-layout--gap-3">
          <div><dt className="core-text--muted">Full name</dt><dd>{user.full_name}</dd></div>
          <div><dt className="core-text--muted">Staff ID</dt><dd>{profile.teacher_id || '—'}</dd></div>
          <div><dt className="core-text--muted">Email</dt><dd>{user.email || '—'}</dd></div>
          <div><dt className="core-text--muted">Department</dt><dd>{profile.department || 'Unassigned'}</dd></div>
          <div><dt className="core-text--muted">School</dt><dd>{data.school?.name || '—'}</dd></div>
        </dl>
        <Link className="core-button core-button--primary core-button--sm" to="/account">
          Manage password
        </Link>
      </div>
    </section>
  );
};
