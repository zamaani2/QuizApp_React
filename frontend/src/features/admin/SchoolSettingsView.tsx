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
      <div className="container-fluid py-5 text-center">
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
    <div className="container-fluid py-4">
      {/* Header */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4">
        <div>
          <div className="d-flex align-items-center gap-2">
            <h1 className="h3 fw-bold mb-0 text-dark">School Settings & Profile</h1>
            <code className="text-muted fw-bold">{sch?.school_code}</code>
            <span className={`badge ${sch?.is_active ? 'bg-success' : 'bg-secondary'}`}>
              {sch?.is_active ? 'Active Institution' : 'Suspended'}
            </span>
          </div>
          <p className="text-muted small mb-0 mt-1">
            Manage institutional identity, campus contact details, and default academic calendar terms.
          </p>
        </div>

        <div className="d-flex align-items-center gap-2">
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={loadData}
            loading={loading}
          >
            <i className="bi bi-arrow-repeat me-1" />
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
          className="mb-4"
        >
          {successMessage}
        </Alert>
      )}

      {error && (
        <Alert
          variant="danger"
          dismissible
          onDismiss={() => setError(null)}
          className="mb-4"
        >
          {error}
        </Alert>
      )}

      {/* Overview Stat Cards */}
      <div className="row g-3 mb-4">
        <div className="col-12 col-sm-6 col-md-4 col-xl">
          <div className="card shadow-sm border-0 border-start border-primary border-4 h-100">
            <div className="card-body">
              <div className="text-muted small text-uppercase fw-bold">Active Students</div>
              <div className="h3 fw-bold text-dark mt-2 mb-0">{stats?.total_students ?? 0}</div>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-md-4 col-xl">
          <div className="card shadow-sm border-0 border-start border-success border-4 h-100">
            <div className="card-body">
              <div className="text-muted small text-uppercase fw-bold">Active Faculty</div>
              <div className="h3 fw-bold text-dark mt-2 mb-0">{stats?.total_teachers ?? 0}</div>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-md-4 col-xl">
          <div className="card shadow-sm border-0 border-start border-warning border-4 h-100">
            <div className="card-body">
              <div className="text-muted small text-uppercase fw-bold">Active Classes</div>
              <div className="h3 fw-bold text-dark mt-2 mb-0">{stats?.total_classes ?? 0}</div>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-md-4 col-xl">
          <div className="card shadow-sm border-0 border-start border-info border-4 h-100">
            <div className="card-body">
              <div className="text-muted small text-uppercase fw-bold">Subjects</div>
              <div className="h3 fw-bold text-dark mt-2 mb-0">{stats?.total_subjects ?? 0}</div>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-md-4 col-xl">
          <div className="card shadow-sm border-0 border-start border-danger border-4 h-100">
            <div className="card-body">
              <div className="text-muted small text-uppercase fw-bold">Quizzes</div>
              <div className="h3 fw-bold text-dark mt-2 mb-0">{stats?.total_quizzes ?? 0}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Settings Form */}
      <form onSubmit={handleSubmit}>
        <div className="row g-4">
          {/* Identity & Basic Information */}
          <div className="col-lg-6">
            <div className="card shadow-sm border-0 h-100">
              <div className="card-header bg-white border-bottom py-3">
                <h5 className="h6 fw-bold mb-0 text-dark">
                  <i className="bi bi-mortarboard me-2 text-primary" />
                  Institutional Information
                </h5>
              </div>
              <div className="card-body">
                <div className="mb-3">
                  <label htmlFor="school-name" className="form-label small fw-semibold">
                    Full School Name <span className="text-danger">*</span>
                  </label>
                  <input
                    id="school-name"
                    type="text"
                    className="form-control"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div className="row g-3 mb-3">
                  <div className="col-sm-6">
                    <label htmlFor="school-short-name" className="form-label small fw-semibold">
                      Short / Display Name <span className="text-danger">*</span>
                    </label>
                    <input
                      id="school-short-name"
                      type="text"
                      className="form-control"
                      value={formData.short_name || ''}
                      onChange={(e) => setFormData({ ...formData, short_name: e.target.value })}
                      required
                    />
                  </div>

                  <div className="col-sm-6">
                    <label htmlFor="school-code" className="form-label small fw-semibold">
                      School Code (Assigned)
                    </label>
                    <input
                      id="school-code"
                      type="text"
                      className="form-control bg-light"
                      value={formData.school_code || ''}
                      onChange={(e) => setFormData({ ...formData, school_code: e.target.value })}
                    />
                  </div>
                </div>

                <div className="mb-3">
                  <label htmlFor="school-motto" className="form-label small fw-semibold">
                    School Motto
                  </label>
                  <input
                    id="school-motto"
                    type="text"
                    className="form-control"
                    placeholder="e.g. Excellence in Character and Learning"
                    value={formData.motto || ''}
                    onChange={(e) => setFormData({ ...formData, motto: e.target.value })}
                  />
                </div>

                <div className="mb-3">
                  <label htmlFor="school-vision" className="form-label small fw-semibold">
                    Vision Statement
                  </label>
                  <textarea
                    id="school-vision"
                    rows={2}
                    className="form-control"
                    value={formData.vision || ''}
                    onChange={(e) => setFormData({ ...formData, vision: e.target.value })}
                  />
                </div>

                <div className="mb-3">
                  <label htmlFor="school-mission" className="form-label small fw-semibold">
                    Mission Statement
                  </label>
                  <textarea
                    id="school-mission"
                    rows={2}
                    className="form-control"
                    value={formData.mission || ''}
                    onChange={(e) => setFormData({ ...formData, mission: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Contact Details & Academic Calendar Scope */}
          <div className="col-lg-6">
            <div className="card shadow-sm border-0 mb-4">
              <div className="card-header bg-white border-bottom py-3">
                <h5 className="h6 fw-bold mb-0 text-dark">
                  <i className="bi bi-geo-alt me-2 text-danger" />
                  Campus & Contact Details
                </h5>
              </div>
              <div className="card-body">
                <div className="mb-3">
                  <label htmlFor="school-address" className="form-label small fw-semibold">
                    Physical Address
                  </label>
                  <input
                    id="school-address"
                    type="text"
                    className="form-control"
                    placeholder="Street / Campus Location"
                    value={formData.address || ''}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    required
                  />
                </div>

                <div className="row g-3 mb-3">
                  <div className="col-sm-6">
                    <label htmlFor="school-postal" className="form-label small fw-semibold">
                      Postal Code / P.O. Box
                    </label>
                    <input
                      id="school-postal"
                      type="text"
                      className="form-control"
                      value={formData.postal_code || ''}
                      onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                    />
                  </div>

                  <div className="col-sm-6">
                    <label htmlFor="school-phone" className="form-label small fw-semibold">
                      Phone Number
                    </label>
                    <input
                      id="school-phone"
                      type="text"
                      className="form-control"
                      value={formData.phone_number || ''}
                      onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="row g-3">
                  <div className="col-sm-6">
                    <label htmlFor="school-email" className="form-label small fw-semibold">
                      Official Email
                    </label>
                    <input
                      id="school-email"
                      type="email"
                      className="form-control"
                      value={formData.email || ''}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>

                  <div className="col-sm-6">
                    <label htmlFor="school-website" className="form-label small fw-semibold">
                      Website URL
                    </label>
                    <input
                      id="school-website"
                      type="url"
                      className="form-control"
                      placeholder="https://..."
                      value={formData.website || ''}
                      onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Active Academic Calendar Controls */}
            <div className="card shadow-sm border-0">
              <div className="card-header bg-white border-bottom py-3">
                <h5 className="h6 fw-bold mb-0 text-dark">
                  <i className="bi bi-calendar-check me-2 text-success" />
                  Default Active Calendar Scope
                </h5>
              </div>
              <div className="card-body">
                <p className="text-muted small mb-3">
                  Select which academic session and term serve as the default focus for reporting and quiz creation.
                </p>

                <div className="row g-3 mb-2">
                  <div className="col-sm-6">
                    <label htmlFor="school-current-year" className="form-label small fw-semibold">
                      Current Academic Year
                    </label>
                    <select
                      id="school-current-year"
                      className="form-select"
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

                  <div className="col-sm-6">
                    <label htmlFor="school-current-term" className="form-label small fw-semibold">
                      Current Active Term
                    </label>
                    <select
                      id="school-current-term"
                      className="form-select"
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

            <div className="card shadow-sm border-0 mt-4">
              <div className="card-header bg-white border-bottom py-3">
                <h5 className="h6 fw-bold mb-0 text-dark">School Status</h5>
              </div>
              <div className="card-body">
                <div className="form-check form-switch">
                  <input
                    id="school-active"
                    className="form-check-input"
                    type="checkbox"
                    checked={Boolean(formData.is_active)}
                    onChange={(event) =>
                      setFormData({ ...formData, is_active: event.target.checked })
                    }
                  />
                  <label className="form-check-label" htmlFor="school-active">
                    Institution is active
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="row g-4 mt-1">
          <div className="col-12 col-lg-6">
            <div className="card shadow-sm border-0 h-100">
              <div className="card-header bg-white border-bottom py-3">
                <h5 className="h6 fw-bold mb-0 text-dark">Visual Elements</h5>
              </div>
              <div className="card-body">
                <div className="mb-3">
                  <label htmlFor="school-logo" className="form-label">School Logo</label>
                  {sch?.logo_url && (
                    <div className="mb-2">
                      <img src={sch.logo_url} alt="Current school logo" className="img-thumbnail" style={{ maxHeight: 120 }} />
                    </div>
                  )}
                  <input
                    id="school-logo"
                    className="form-control"
                    type="file"
                    accept="image/*"
                    onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)}
                  />
                </div>
                <div>
                  <label htmlFor="school-stamp" className="form-label">School Stamp</label>
                  {sch?.school_stamp_url && (
                    <div className="mb-2">
                      <img src={sch.school_stamp_url} alt="Current school stamp" className="img-thumbnail" style={{ maxHeight: 120 }} />
                    </div>
                  )}
                  <input
                    id="school-stamp"
                    className="form-control"
                    type="file"
                    accept="image/*"
                    onChange={(event) => setStampFile(event.target.files?.[0] ?? null)}
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="col-12 col-lg-6">
            <div className="card shadow-sm border-0 h-100">
              <div className="card-header bg-white border-bottom py-3">
                <h5 className="h6 fw-bold mb-0 text-dark">Report Settings</h5>
              </div>
              <div className="card-body">
                <div className="mb-3">
                  <label htmlFor="school-report-header" className="form-label">Report Header</label>
                  <textarea
                    id="school-report-header"
                    className="form-control"
                    rows={3}
                    value={formData.report_header || ''}
                    onChange={(event) =>
                      setFormData({ ...formData, report_header: event.target.value })
                    }
                  />
                </div>
                <div className="mb-3">
                  <label htmlFor="school-report-footer" className="form-label">Report Footer</label>
                  <textarea
                    id="school-report-footer"
                    className="form-control"
                    rows={3}
                    value={formData.report_footer || ''}
                    onChange={(event) =>
                      setFormData({ ...formData, report_footer: event.target.value })
                    }
                  />
                </div>
                <div>
                  <label htmlFor="school-grading-description" className="form-label">
                    Grading System Description
                  </label>
                  <textarea
                    id="school-grading-description"
                    className="form-control"
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
        <div className="card shadow-sm border-0 mt-4">
          <div className="card-body d-flex justify-content-end gap-2 p-3">
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
              <i className="bi bi-check-lg me-1" />
              Save School Settings
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
};
