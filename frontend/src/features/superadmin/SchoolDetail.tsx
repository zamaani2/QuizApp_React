import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchSuperadminSchool } from '../../api/admin';
import type { SuperadminSchoolDetail as SchoolRecord } from '../../types';
import { Alert } from '../../components/common/Alert';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import './schoolManagement.css';

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

export const SchoolDetail = () => {
  const { schoolId } = useParams<{ schoolId: string }>();
  const id = Number(schoolId);
  const [school, setSchool] = useState<SchoolRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSchool = useCallback(async () => {
    if (!Number.isInteger(id) || id < 1) {
      setError('Invalid school ID.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetchSuperadminSchool(id);
      setSchool(response.school);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load school details.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadSchool();
  }, [loadSchool]);

  if (loading) {
    return (
      <div className="superadmin-school__loading">
        <LoadingSpinner size="lg" message="Loading school details..." />
      </div>
    );
  }

  return (
    <main className="superadmin-school" data-testid="superadmin-school-detail">
      {error && (
        <Alert variant="danger" dismissible onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}
      {school && (
        <>
          <header className="superadmin-school__header">
            <div>
              <p className="superadmin-school__eyebrow">School registry</p>
              <h1>{school.name}</h1>
              <p>{school.short_name}{school.school_code ? ` · ${school.school_code}` : ''}</p>
            </div>
            <div className="superadmin-school__header-actions">
              <Link className="superadmin-school__back" to="/superadmin/schools">
                Back to schools
              </Link>
              <Link className="superadmin-school__button" to={`/superadmin/schools/${school.id}/edit`}>
                Edit school
              </Link>
            </div>
          </header>

          <section className="superadmin-school__section">
            <h2>Basic information</h2>
            <dl className="superadmin-school__details">
              <div><dt>Status</dt><dd>{school.is_active ? 'Active' : 'Inactive'}</dd></div>
              <div><dt>School name</dt><dd>{school.name}</dd></div>
              <div><dt>Short name</dt><dd>{school.short_name}</dd></div>
              <div><dt>School code</dt><dd>{school.school_code || 'Not set'}</dd></div>
              <div><dt>Slug</dt><dd>{school.slug}</dd></div>
            </dl>
          </section>

          <section className="superadmin-school__section">
            <h2>Contact information</h2>
            <dl className="superadmin-school__details">
              <div><dt>Address</dt><dd>{school.address}</dd></div>
              <div><dt>Postal code</dt><dd>{school.postal_code || 'Not set'}</dd></div>
              <div><dt>Phone number</dt><dd>{school.phone_number}</dd></div>
              <div><dt>Email</dt><dd>{school.email || 'Not set'}</dd></div>
              <div>
                <dt>Website</dt>
                <dd>
                  {school.website ? (
                    <a href={school.website} target="_blank" rel="noreferrer">{school.website}</a>
                  ) : 'Not set'}
                </dd>
              </div>
            </dl>
          </section>

          <section className="superadmin-school__section">
            <h2>Academic information</h2>
            <dl className="superadmin-school__details">
              <div>
                <dt>Current academic year</dt>
                <dd>{school.current_academic_year?.name ?? 'Not set'}</dd>
              </div>
              <div>
                <dt>Current term</dt>
                <dd>{school.current_term?.name ?? 'Not set'}</dd>
              </div>
            </dl>
          </section>

          {(school.motto || school.vision || school.mission) && (
            <section className="superadmin-school__section">
              <h2>Vision and mission</h2>
              {school.motto && <p><strong>Motto:</strong> {school.motto}</p>}
              {school.vision && <p><strong>Vision:</strong> {school.vision}</p>}
              {school.mission && <p><strong>Mission:</strong> {school.mission}</p>}
            </section>
          )}

          {(school.report_header || school.report_footer || school.grading_system_description) && (
            <section className="superadmin-school__section">
              <h2>Report settings</h2>
              {school.report_header && (
                <p><strong>Report header:</strong> {school.report_header}</p>
              )}
              {school.report_footer && (
                <p><strong>Report footer:</strong> {school.report_footer}</p>
              )}
              {school.grading_system_description && (
                <p>
                  <strong>Grading system:</strong> {school.grading_system_description}
                </p>
              )}
            </section>
          )}

          {(school.logo_url || school.school_stamp_url) && (
            <section className="superadmin-school__section">
              <h2>Visual elements</h2>
              <div className="superadmin-school__images">
                {school.logo_url && <img src={school.logo_url} alt={`${school.name} logo`} />}
                {school.school_stamp_url && (
                  <img src={school.school_stamp_url} alt={`${school.name} stamp`} />
                )}
              </div>
            </section>
          )}

          <section className="superadmin-school__section">
            <h2>Metadata</h2>
            <dl className="superadmin-school__details">
              <div><dt>Created</dt><dd>{formatDate(school.created_at)}</dd></div>
              <div><dt>Last updated</dt><dd>{formatDate(school.updated_at)}</dd></div>
              {school.created_by_name && (
                <div><dt>Created by</dt><dd>{school.created_by_name}</dd></div>
              )}
            </dl>
          </section>
        </>
      )}
    </main>
  );
};
