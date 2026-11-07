import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  createSuperadminSchool,
  fetchSuperadminSchool,
  updateSuperadminSchool,
} from '../../api/admin';
import type { SuperadminSchoolDetail } from '../../types';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import './schoolManagement.css';

export const SchoolForm = () => {
  const { schoolId } = useParams<{ schoolId?: string }>();
  const id = schoolId ? Number(schoolId) : null;
  const isEditing = id !== null;
  const navigate = useNavigate();
  const [school, setSchool] = useState<SuperadminSchoolDetail | null>(null);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSchool = useCallback(async () => {
    if (id === null) return;
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

  const saveSchool = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      if (isEditing) {
        const activeInput = event.currentTarget.querySelector<HTMLInputElement>(
          'input[name="is_active"]'
        );
        formData.set('is_active', String(activeInput?.checked ?? false));
      }
      const response = isEditing && id !== null
        ? await updateSuperadminSchool(id, formData)
        : await createSuperadminSchool(formData);
      navigate(`/superadmin/schools/${response.school_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save school information.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="superadmin-school__loading">
        <LoadingSpinner size="lg" message="Loading school information..." />
      </div>
    );
  }

  return (
    <main className="superadmin-school" data-testid="superadmin-school-form">
      <header className="superadmin-school__header">
        <div>
          <p className="superadmin-school__eyebrow">School registry</p>
          <h1>{isEditing ? 'Edit school' : 'Add a school'}</h1>
          <p>Manage school contact details, visual assets, and reporting settings.</p>
        </div>
        <Link className="superadmin-school__back" to="/superadmin/schools">
          Back to schools
        </Link>
      </header>

      {error && (
        <Alert variant="danger" dismissible onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {(!isEditing || school) && (
        <form className="superadmin-school__form" onSubmit={saveSchool}>
          <section className="superadmin-school__section">
            <h2>Basic information</h2>
            <div className="superadmin-school__grid">
              <label>
                School name <span aria-hidden="true">*</span>
                <input name="name" required defaultValue={school?.name ?? ''} />
              </label>
              <label>
                Short name <span aria-hidden="true">*</span>
                <input
                  name="short_name"
                  required
                  maxLength={20}
                  defaultValue={school?.short_name ?? ''}
                />
              </label>
              <label>
                School code
                <input name="school_code" maxLength={20} defaultValue={school?.school_code ?? ''} />
              </label>
              <label>
                Phone number <span aria-hidden="true">*</span>
                <input
                  name="phone_number"
                  required
                  defaultValue={school?.phone_number ?? ''}
                />
              </label>
              <label>
                Email
                <input name="email" type="email" defaultValue={school?.email ?? ''} />
              </label>
              <label>
                Website
                <input
                  name="website"
                  type="url"
                  placeholder="https://example.com"
                  defaultValue={school?.website ?? ''}
                />
              </label>
              <label className="superadmin-school__wide">
                Address <span aria-hidden="true">*</span>
                <textarea name="address" required rows={3} defaultValue={school?.address ?? ''} />
              </label>
              <label>
                Postal code
                <input
                  name="postal_code"
                  maxLength={20}
                  defaultValue={school?.postal_code ?? ''}
                />
              </label>
              {isEditing && (
                <label className="superadmin-school__checkbox">
                  <input
                    type="checkbox"
                    name="is_active"
                    value="true"
                    defaultChecked={school?.is_active ?? false}
                  />
                  School is active
                </label>
              )}
            </div>
          </section>

          <section className="superadmin-school__section">
            <h2>Visual elements</h2>
            <div className="superadmin-school__grid">
              <label>
                School logo
                <input name="logo" type="file" accept="image/*" />
                {school?.logo_url && (
                  <a href={school.logo_url} target="_blank" rel="noreferrer">View current logo</a>
                )}
              </label>
              <label>
                School stamp
                <input name="school_stamp" type="file" accept="image/*" />
                {school?.school_stamp_url && (
                  <a href={school.school_stamp_url} target="_blank" rel="noreferrer">
                    View current stamp
                  </a>
                )}
              </label>
            </div>
          </section>

          <section className="superadmin-school__section">
            <h2>Vision and mission</h2>
            <div className="superadmin-school__grid">
              <label className="superadmin-school__wide">
                Motto
                <input name="motto" maxLength={200} defaultValue={school?.motto ?? ''} />
              </label>
              <label>
                Vision
                <textarea name="vision" rows={4} defaultValue={school?.vision ?? ''} />
              </label>
              <label>
                Mission
                <textarea name="mission" rows={4} defaultValue={school?.mission ?? ''} />
              </label>
            </div>
          </section>

          <section className="superadmin-school__section">
            <h2>Report settings</h2>
            <div className="superadmin-school__grid">
              <label>
                Report header
                <textarea name="report_header" rows={3} defaultValue={school?.report_header ?? ''} />
              </label>
              <label>
                Report footer
                <textarea name="report_footer" rows={3} defaultValue={school?.report_footer ?? ''} />
              </label>
              <label className="superadmin-school__wide">
                Grading system description
                <textarea
                  name="grading_system_description"
                  rows={4}
                  defaultValue={school?.grading_system_description ?? ''}
                />
              </label>
            </div>
          </section>

          <section className="superadmin-school__section">
            <h2>Academic settings</h2>
            {school ? (
              <div className="superadmin-school__grid">
                <label>
                  Current academic year
                  <select
                    name="current_academic_year"
                    defaultValue={school.current_academic_year?.id ?? ''}
                  >
                    <option value="">Select academic year</option>
                    {school.academic_years.map((year) => (
                      <option key={year.id} value={year.id}>{year.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Current term
                  <select name="current_term" defaultValue={school.current_term?.id ?? ''}>
                    <option value="">Select term</option>
                    {school.terms.map((term) => (
                      <option key={term.id} value={term.id}>
                        {term.name} ({term.academic_year_name})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : (
              <p>Academic settings can be configured after the school is created.</p>
            )}
          </section>

          <div className="superadmin-school__form-actions">
            <Link to="/superadmin/schools">Cancel</Link>
            <Button type="submit" loading={saving}>
              {isEditing ? 'Save changes' : 'Create school'}
            </Button>
          </div>
        </form>
      )}
    </main>
  );
};
