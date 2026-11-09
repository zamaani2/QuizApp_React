import { AppIcon } from '../../components/common/AppIcon';
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { studentApi } from '../../api/student';
import type { StudentProfileData } from '../../types/student';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { Alert } from '../../components/common/Alert';
import './student.css';

export const StudentProgressView: React.FC = () => {
  const [data, setData] = useState<StudentProfileData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadProgress = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await studentApi.getStudentProfile();
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load progress records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProgress();
  }, []);

  if (loading) {
    return (
      <div className="core-display-flex core-layout--justify-center core-space--padding-y-5" data-testid="student-progress-loading">
        <LoadingSpinner size="lg" message="Loading your academic progress..." />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div data-testid="student-progress-error">
        <Alert variant="danger" dismissible={false}>
          <h5>Unable to load progress</h5>
          <p className="core-space--margin-bottom-2">{error || 'An unexpected error occurred.'}</p>
          <button className="stu-btn-outline" onClick={loadProgress}>
            Retry
          </button>
        </Alert>
      </div>
    );
  }

  const { stats, personal, academic } = data;

  return (
    <div data-testid="student-progress">
      {/* Welcome & Section Heading */}
      <div className="stu-welcome">
        <div className="stu-welcome__heading-row">
          <h1 className="stu-welcome__name">Learning Progress</h1>
          <span className="stu-welcome__role-badge">
            <AppIcon name="graduationCap" aria-hidden="true" /> {academic.current_class?.name || 'Academic Record'}
          </span>
        </div>
        <div className="stu-welcome__subtitle">
          {personal.full_name} • {personal.admission_number} {academic.school_name ? `• ${academic.school_name}` : ''}
        </div>
      </div>

      {/* Primary Overview Cards */}
      <div className="stu-stats-grid">
        <div className="stu-stat-box">
          <div className="stu-stat-box__val" style={{ color: 'var(--stu-sky)' }}>
            {stats.total_completed}
          </div>
          <div className="stu-stat-box__label">Quizzes Completed</div>
        </div>

        <div className="stu-stat-box">
          <div className="stu-stat-box__val" style={{ color: stats.pass_rate >= 50 ? 'var(--stu-success)' : 'var(--stu-danger)' }}>
            {stats.pass_rate}%
          </div>
          <div className="stu-stat-box__label">Pass Rate</div>
        </div>

        <div className="stu-stat-box">
          <div className="stu-stat-box__val" style={{ color: 'var(--stu-navy)' }}>
            {stats.avg_score}%
          </div>
          <div className="stu-stat-box__label">Average Score</div>
        </div>
      </div>

      {/* Prominent Progress CTA */}
      <div className="stu-cta-card">
        <div className="stu-cta-card__top">
          <div className="stu-cta-card__icon-box">
            <AppIcon name="trophy" aria-hidden="true" />
          </div>
          <div className="stu-cta-card__info">
            <div className="stu-cta-card__eyebrow">ACADEMIC EXCELLENCE</div>
            <h2 className="stu-cta-card__title">Personal Best: {stats.best_score}%</h2>
            <p className="stu-cta-card__desc">
              You have passed {stats.passed_count} of {stats.total_completed} completed assessments. Keep practising to improve your scores.
            </p>
          </div>
        </div>
        <Link to="/student/quizzes" className="stu-cta-card__btn">
          Practise More Quizzes →
        </Link>
      </div>

      {/* Recent Assessment Milestones */}
      <div className="stu-section-head">
        <div className="stu-section-head__title-group">
          <h2 className="stu-section-head__title">Recent Milestones</h2>
          <p className="stu-section-head__subtitle">Your most recently completed quizzes and outcomes</p>
        </div>
        <Link to="/student/attempts" className="stu-section-head__link">
          All History →
        </Link>
      </div>

      {stats.recent_activity.length === 0 ? (
        <div className="stu-card core-text--center core-space--padding-y-4">
          <AppIcon name="clipboardCheck" className="core-text--muted" style={{ fontSize: '2rem' }} aria-hidden="true" />
          <p className="core-text--muted core-space--margin-top-2 core-space--margin-bottom-0" style={{ fontSize: '0.875rem' }}>
            No assessments completed yet. Take your first quiz to see your progress here!
          </p>
        </div>
      ) : (
        <div className="stu-card-list">
          {stats.recent_activity.map((item) => (
            <div key={item.id} className="stu-result-card">
              <div className="stu-result-card__info">
                <h3 className="stu-result-card__title">{item.quiz_title}</h3>
                <div className="stu-result-card__sub">
                  <span className="stu-badge stu-badge--sky core-space--margin-end-2">{item.subject_name}</span>
                  {item.submitted_at && <span>{new Date(item.submitted_at).toLocaleDateString()}</span>}
                </div>
              </div>
              <div className="stu-result-card__score-box">
                <span className={`stu-badge ${item.is_passed ? 'stu-badge--success' : 'stu-badge--danger'}`}>
                  {item.percentage}% ({item.is_passed ? 'Passed' : 'Failed'})
                </span>
                <Link
                  to={`/student/attempts`}
                  className="stu-section-head__link"
                  style={{ fontSize: '0.75rem' }}
                >
                  Scorecard →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StudentProgressView;
