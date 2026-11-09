import { AppIcon } from '../../components/common/AppIcon';
import React, { useEffect, useState, useCallback } from 'react';
import { academicApi } from '../../api/academic';
import type { SchoolSettingsData, SchoolSettingsInput, StructureLookups } from '../../types';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';

export const SchoolSettingsView: React.FC = () => {
  const [data, setData] = useState<SchoolSettingsData | null>(null);
  const [lookups, setLookups] = useState<StructureLookups | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [stampFile, setStampFile] = useState<File | null>(null);

  const [formData, setFormData] = useState<SchoolSettingsInput>({
    name: '',
    school_code: '',
    short_name: '',
    address: '',
    postal_code: '',
    phone_number: '',
    email: '',
    website: '',
    motto: '',
    vision: '',
    mission: '',
    report_header: '',
    report_footer: '',
    grading_system_description: '',
    is_active: true,
    current_academic_year_id: null,
    current_term_id: null,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [settingsRes, lookupsRes] = await Promise.all([
        academicApi.getSchoolSettings(),
        academicApi.getStructureLookups(),
      ]);
      setData(settingsRes);
      setLookups(lookupsRes);
      setFormData({
        name: settingsRes.school.name || '',
        school_code: settingsRes.school.school_code || '',
        short_name: settingsRes.school.short_name || '',
        address: settingsRes.school.address || '',
        postal_code: settingsRes.school.postal_code || '',
        phone_number: settingsRes.school.phone_number || '',
        email: settingsRes.school.email || '',
        website: settingsRes.school.website || '',
        motto: settingsRes.school.motto || '',
        vision: settingsRes.school.vision || '',
        mission: settingsRes.school.mission || '',
        report_header: settingsRes.school.report_header || '',
        report_footer: settingsRes.school.report_footer || '',
        grading_system_description: settingsRes.school.grading_system_description || '',
        is_active: settingsRes.school.is_active,
        current_academic_year_id: settingsRes.school.current_academic_year_id,
        current_term_id: settingsRes.school.current_term_id,
      });
      setLogoFile(null);
      setStampFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load school profile.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.short_name?.trim()) {
      setError('School name and short name are required.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await academicApi.updateSchoolSettings({
        ...formData,
        logo: logoFile,
        school_stamp: stampFile,
      });
      setSuccessMessage(res.message);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save school settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="core-container core-space--padding-y-5 core-text--center">
        <LoadingSpinner size="lg" message="Loading school settings..." />
      </div>
    );
  }

  const sch = data?.school;
  const stats = data?.stats;
  const terms = (lookups?.terms ?? []).filter(
    (term) =>
      !formData.current_academic_year_id ||
      term.academic_year_id === formData.current_academic_year_id
  );

  return (
    <div className="core-container core-space--padding-y-4">
      {/* Header */}
      <div className="core-display-flex core-layout--column core-layout--md-row core-layout--justify-between core-layout--align-md-center core-layout--gap-3 core-space--margin-bottom-4">
        <div>
          <div className="core-display-flex core-layout--align-center core-layout--gap-2">
            <h1 className="core-type--heading-3 core-type--weight-bold core-space--margin-bottom-0 core-text--dark">School Settings & Profile</h1>
            <code className="core-text--muted core-type--weight-bold">{sch?.school_code}</code>
            <span className={`core-badge ${sch?.is_active ? 'core-surface--success' : 'core-surface--secondary'}`}>
              {sch?.is_active ? 'Active Institution' : 'Suspended'}
            </span>
          </div>
          <p className="core-text--muted core-type--small core-space--margin-bottom-0 core-space--margin-top-1">
            Manage institutional identity, campus contact details, and default academic calendar terms.
          </p>
        </div>

        <div className="core-display-flex core-layout--align-center core-layout--gap-2">
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={loadData}
            loading={loading}
          >
            <AppIcon name="refresh" className="core-space--margin-end-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <Alert
          variant="success"
          dismissible
          onDismiss={() => setSuccessMessage(null)}
          className="core-space--margin-bottom-4"
        >
          {successMessage}
        </Alert>
      )}

      {error && (
        <Alert
          variant="danger"
          dismissible
          onDismiss={() => setError(null)}
          className="core-space--margin-bottom-4"
        >
          {error}
        </Alert>
      )}

      {/* Overview Stat Cards */}
      <div className="core-grid core-grid--gap-3 core-space--margin-bottom-4">
        <div className="core-grid__span-12 core-grid__span-sm-6 core-grid__span-md-4 core-grid__column-xl">
          <div className="core-card core-shadow--sm core-border--none core-border--start core-border--primary core-border--width-4 core-size--height-full">
            <div className="core-card__body">
              <div className="core-text--muted core-type--small core-text--uppercase core-type--weight-bold">Active Students</div>
              <div className="core-type--heading-3 core-type--weight-bold core-text--dark core-space--margin-top-2 core-space--margin-bottom-0">{stats?.total_students ?? 0}</div>
            </div>
          </div>
        </div>

        <div className="core-grid__span-12 core-grid__span-sm-6 core-grid__span-md-4 core-grid__column-xl">
          <div className="core-card core-shadow--sm core-border--none core-border--start core-border--success core-border--width-4 core-size--height-full">
            <div className="core-card__body">
              <div className="core-text--muted core-type--small core-text--uppercase core-type--weight-bold">Active Faculty</div>
              <div className="core-type--heading-3 core-type--weight-bold core-text--dark core-space--margin-top-2 core-space--margin-bottom-0">{stats?.total_teachers ?? 0}</div>
            </div>
          </div>
        </div>

        <div className="core-grid__span-12 core-grid__span-sm-6 core-grid__span-md-4 core-grid__column-xl">
          <div className="core-card core-shadow--sm core-border--none core-border--start core-border--warning core-border--width-4 core-size--height-full">
            <div className="core-card__body">
              <div className="core-text--muted core-type--small core-text--uppercase core-type--weight-bold">Active Classes</div>
              <div className="core-type--heading-3 core-type--weight-bold core-text--dark core-space--margin-top-2 core-space--margin-bottom-0">{stats?.total_classes ?? 0}</div>
            </div>
          </div>
        </div>

        <div className="core-grid__span-12 core-grid__span-sm-6 core-grid__span-md-4 core-grid__column-xl">
          <div className="core-card core-shadow--sm core-border--none core-border--start core-border--info core-border--width-4 core-size--height-full">
            <div className="core-card__body">
              <div className="core-text--muted core-type--small core-text--uppercase core-type--weight-bold">Subjects</div>
              <div className="core-type--heading-3 core-type--weight-bold core-text--dark core-space--margin-top-2 core-space--margin-bottom-0">{stats?.total_subjects ?? 0}</div>
            </div>
          </div>
        </div>

        <div className="core-grid__span-12 core-grid__span-sm-6 core-grid__span-md-4 core-grid__column-xl">
          <div className="core-card core-shadow--sm core-border--none core-border--start core-border--danger core-border--width-4 core-size--height-full">
            <div className="core-card__body">
              <div className="core-text--muted core-type--small core-text--uppercase core-type--weight-bold">Quizzes</div>
              <div className="core-type--heading-3 core-type--weight-bold core-text--dark core-space--margin-top-2 core-space--margin-bottom-0">{stats?.total_quizzes ?? 0}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Settings Form */}
      <form onSubmit={handleSubmit}>
        <div className="core-grid core-grid--gap-4">
          {/* Identity & Basic Information */}
          <div className="core-grid__span-lg-6">
            <div className="core-card core-shadow--sm core-border--none core-size--height-full">
              <div className="core-card__header core-surface--white core-border--bottom core-space--padding-y-3">
                <h5 className="core-type--heading-6 core-type--weight-bold core-space--margin-bottom-0 core-text--dark">
                  <AppIcon name="graduationCap" className="core-space--margin-end-2 core-text--primary" />
                  Institutional Information
                </h5>
              </div>
              <div className="core-card__body">
                <div className="core-space--margin-bottom-3">
                  <label htmlFor="school-name" className="core-field__label core-type--small core-type--weight-semibold">
                    Full School Name <span className="core-text--danger">*</span>
                  </label>
                  <input
                    id="school-name"
                    type="text"
                    className="core-field__input"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div className="core-grid core-grid--gap-3 core-space--margin-bottom-3">
                  <div className="core-grid__span-sm-6">
                    <label htmlFor="school-short-name" className="core-field__label core-type--small core-type--weight-semibold">
                      Short / Display Name <span className="core-text--danger">*</span>
                    </label>
                    <input
                      id="school-short-name"
                      type="text"
                      className="core-field__input"
                      value={formData.short_name || ''}
                      onChange={(e) => setFormData({ ...formData, short_name: e.target.value })}
                      required
                    />
                  </div>

                  <div className="core-grid__span-sm-6">
                    <label htmlFor="school-code" className="core-field__label core-type--small core-type--weight-semibold">
                      School Code (Assigned)
                    </label>
                    <input
                      id="school-code"
                      type="text"
                      className="core-field__input core-surface--light"
                      value={formData.school_code || ''}
                      onChange={(e) => setFormData({ ...formData, school_code: e.target.value })}
                    />
                  </div>
                </div>

                <div className="core-space--margin-bottom-3">
                  <label htmlFor="school-motto" className="core-field__label core-type--small core-type--weight-semibold">
                    School Motto
                  </label>
                  <input
                    id="school-motto"
                    type="text"
                    className="core-field__input"
                    placeholder="e.g. Excellence in Character and Learning"
                    value={formData.motto || ''}
                    onChange={(e) => setFormData({ ...formData, motto: e.target.value })}
                  />
                </div>

                <div className="core-space--margin-bottom-3">
                  <label htmlFor="school-vision" className="core-field__label core-type--small core-type--weight-semibold">
                    Vision Statement
                  </label>
                  <textarea
                    id="school-vision"
                    rows={2}
                    className="core-field__input"
                    value={formData.vision || ''}
                    onChange={(e) => setFormData({ ...formData, vision: e.target.value })}
                  />
                </div>

                <div className="core-space--margin-bottom-3">
                  <label htmlFor="school-mission" className="core-field__label core-type--small core-type--weight-semibold">
                    Mission Statement
                  </label>
                  <textarea
                    id="school-mission"
                    rows={2}
                    className="core-field__input"
                    value={formData.mission || ''}
                    onChange={(e) => setFormData({ ...formData, mission: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Contact Details & Academic Calendar Scope */}
          <div className="core-grid__span-lg-6">
            <div className="core-card core-shadow--sm core-border--none core-space--margin-bottom-4">
              <div className="core-card__header core-surface--white core-border--bottom core-space--padding-y-3">
                <h5 className="core-type--heading-6 core-type--weight-bold core-space--margin-bottom-0 core-text--dark">
                  <AppIcon name="mapPin" className="core-space--margin-end-2 core-text--danger" />
                  Campus & Contact Details
                </h5>
              </div>
              <div className="core-card__body">
                <div className="core-space--margin-bottom-3">
                  <label htmlFor="school-address" className="core-field__label core-type--small core-type--weight-semibold">
                    Physical Address
                  </label>
                  <input
                    id="school-address"
                    type="text"
                    className="core-field__input"
                    placeholder="Street / Campus Location"
                    value={formData.address || ''}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    required
                  />
                </div>

                <div className="core-grid core-grid--gap-3 core-space--margin-bottom-3">
                  <div className="core-grid__span-sm-6">
                    <label htmlFor="school-postal" className="core-field__label core-type--small core-type--weight-semibold">
                      Postal Code / P.O. Box
                    </label>
                    <input
                      id="school-postal"
                      type="text"
                      className="core-field__input"
                      value={formData.postal_code || ''}
                      onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                    />
                  </div>

                  <div className="core-grid__span-sm-6">
                    <label htmlFor="school-phone" className="core-field__label core-type--small core-type--weight-semibold">
                      Phone Number
                    </label>
                    <input
                      id="school-phone"
                      type="text"
                      className="core-field__input"
                      value={formData.phone_number || ''}
                      onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="core-grid core-grid--gap-3">
                  <div className="core-grid__span-sm-6">
                    <label htmlFor="school-email" className="core-field__label core-type--small core-type--weight-semibold">
                      Official Email
                    </label>
                    <input
                      id="school-email"
                      type="email"
                      className="core-field__input"
                      value={formData.email || ''}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>

                  <div className="core-grid__span-sm-6">
                    <label htmlFor="school-website" className="core-field__label core-type--small core-type--weight-semibold">
                      Website URL
                    </label>
                    <input
                      id="school-website"
                      type="url"
                      className="core-field__input"
                      placeholder="https://..."
                      value={formData.website || ''}
                      onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Active Academic Calendar Controls */}
            <div className="core-card core-shadow--sm core-border--none">
              <div className="core-card__header core-surface--white core-border--bottom core-space--padding-y-3">
                <h5 className="core-type--heading-6 core-type--weight-bold core-space--margin-bottom-0 core-text--dark">
                  <AppIcon name="calendarCheck" className="core-space--margin-end-2 core-text--success" />
                  Default Active Calendar Scope
                </h5>
              </div>
              <div className="core-card__body">
                <p className="core-text--muted core-type--small core-space--margin-bottom-3">
                  Select which academic session and term serve as the default focus for reporting and quiz creation.
                </p>

                <div className="core-grid core-grid--gap-3 core-space--margin-bottom-2">
                  <div className="core-grid__span-sm-6">
                    <label htmlFor="school-current-year" className="core-field__label core-type--small core-type--weight-semibold">
                      Current Academic Year
                    </label>
                    <select
                      id="school-current-year"
                      className="core-field__select"
                      value={formData.current_academic_year_id ?? ''}
                      onChange={(e) =>
                        {
                          const yearId = e.target.value ? Number(e.target.value) : null;
                          const selectedTerm = lookups?.terms.find(
                            (term) => term.id === formData.current_term_id
                          );
                          setFormData({
                            ...formData,
                            current_academic_year_id: yearId,
                            current_term_id:
                              selectedTerm &&
                              yearId !== null &&
                              selectedTerm.academic_year_id !== yearId
                                ? null
                                : formData.current_term_id,
                          });
                        }
                      }
                    >
                      <option value="">No Active Year</option>
                      {lookups?.academic_years.map((y) => (
                        <option key={y.id} value={y.id}>
                          {y.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="core-grid__span-sm-6">
                    <label htmlFor="school-current-term" className="core-field__label core-type--small core-type--weight-semibold">
                      Current Active Term
                    </label>
                    <select
                      id="school-current-term"
                      className="core-field__select"
                      value={formData.current_term_id ?? ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          current_term_id: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    >
                      <option value="">No Active Term</option>
                      {terms.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.term_display}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="core-card core-shadow--sm core-border--none core-space--margin-top-4">
              <div className="core-card__header core-surface--white core-border--bottom core-space--padding-y-3">
                <h5 className="core-type--heading-6 core-type--weight-bold core-space--margin-bottom-0 core-text--dark">School Status</h5>
              </div>
              <div className="core-card__body">
                <div className="core-field__check core-field__switch">
                  <input
                    id="school-active"
                    className="core-field__check-input"
                    type="checkbox"
                    checked={Boolean(formData.is_active)}
                    onChange={(event) =>
                      setFormData({ ...formData, is_active: event.target.checked })
                    }
                  />
                  <label className="core-field__check-label" htmlFor="school-active">
                    Institution is active
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="core-grid core-grid--gap-4 core-space--margin-top-1">
          <div className="core-grid__span-12 core-grid__span-lg-6">
            <div className="core-card core-shadow--sm core-border--none core-size--height-full">
              <div className="core-card__header core-surface--white core-border--bottom core-space--padding-y-3">
                <h5 className="core-type--heading-6 core-type--weight-bold core-space--margin-bottom-0 core-text--dark">Visual Elements</h5>
              </div>
              <div className="core-card__body">
                <div className="core-space--margin-bottom-3">
                  <label htmlFor="school-logo" className="core-field__label">School Logo</label>
                  {sch?.logo_url && (
                    <div className="core-space--margin-bottom-2">
                      <img src={sch.logo_url} alt="Current school logo" className="img-thumbnail" style={{ maxHeight: 120 }} />
                    </div>
                  )}
                  <input
                    id="school-logo"
                    className="core-field__input"
                    type="file"
                    accept="image/*"
                    onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)}
                  />
                </div>
                <div>
                  <label htmlFor="school-stamp" className="core-field__label">School Stamp</label>
                  {sch?.school_stamp_url && (
                    <div className="core-space--margin-bottom-2">
                      <img src={sch.school_stamp_url} alt="Current school stamp" className="img-thumbnail" style={{ maxHeight: 120 }} />
                    </div>
                  )}
                  <input
                    id="school-stamp"
                    className="core-field__input"
                    type="file"
                    accept="image/*"
                    onChange={(event) => setStampFile(event.target.files?.[0] ?? null)}
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="core-grid__span-12 core-grid__span-lg-6">
            <div className="core-card core-shadow--sm core-border--none core-size--height-full">
              <div className="core-card__header core-surface--white core-border--bottom core-space--padding-y-3">
                <h5 className="core-type--heading-6 core-type--weight-bold core-space--margin-bottom-0 core-text--dark">Report Settings</h5>
              </div>
              <div className="core-card__body">
                <div className="core-space--margin-bottom-3">
                  <label htmlFor="school-report-header" className="core-field__label">Report Header</label>
                  <textarea
                    id="school-report-header"
                    className="core-field__input"
                    rows={3}
                    value={formData.report_header || ''}
                    onChange={(event) =>
                      setFormData({ ...formData, report_header: event.target.value })
                    }
                  />
                </div>
                <div className="core-space--margin-bottom-3">
                  <label htmlFor="school-report-footer" className="core-field__label">Report Footer</label>
                  <textarea
                    id="school-report-footer"
                    className="core-field__input"
                    rows={3}
                    value={formData.report_footer || ''}
                    onChange={(event) =>
                      setFormData({ ...formData, report_footer: event.target.value })
                    }
                  />
                </div>
                <div>
                  <label htmlFor="school-grading-description" className="core-field__label">
                    Grading System Description
                  </label>
                  <textarea
                    id="school-grading-description"
                    className="core-field__input"
                    rows={4}
                    value={formData.grading_system_description || ''}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        grading_system_description: event.target.value,
                      })
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Submit Actions Bar */}
        <div className="core-card core-shadow--sm core-border--none core-space--margin-top-4">
          <div className="core-card__body core-display-flex core-layout--justify-end core-layout--gap-2 core-space--padding-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={loadData}
              disabled={saving}
            >
              Reset Changes
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              loading={saving}
            >
              <AppIcon name="check" className="core-space--margin-end-1" />
              Save School Settings
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
};
