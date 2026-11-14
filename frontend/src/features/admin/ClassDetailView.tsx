import { AppIcon } from '../../components/common/AppIcon';
import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { academicApi } from '../../api/academic';
import type { ClassDetailData, AssignedSubject, EnrolledStudent } from '../../types';
import { DataTable, type Column } from '../../components/table/DataTable';
import { Alert } from '../../components/common/Alert';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';

export const ClassDetailView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const classId = Number(id);

  const [detail, setDetail] = useState<ClassDetailData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<'subjects' | 'students'>('subjects');

  const loadClassDetail = useCallback(async () => {
    if (!classId || isNaN(classId)) {
      setError('Invalid Class ID.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setDetail(await academicApi.getClassDetail(classId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load class details.');
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    loadClassDetail();
  }, [loadClassDetail]);

  const subjectColumns: Column<AssignedSubject>[] = [
    {
      id: 'subject_code',
      header: 'Code',
      sortable: true,
      accessor: (row) => <code className="core-type--weight-bold core-text--primary">{row.subject_code}</code>,
    },
    {
      id: 'subject_name',
      header: 'Subject Name',
      sortable: true,
      accessor: (row) => <span className="core-type--weight-semibold core-text--dark">{row.subject_name}</span>,
    },
    {
      id: 'department',
      header: 'Department',
      sortable: true,
      accessor: (row) => (
        <span className="core-badge core-surface--light core-text--dark core-border">{row.department_name}</span>
      ),
    },
    {
      id: 'learning_area',
      header: 'Learning Area',
      sortable: true,
      accessor: (row) => (
        <span className="core-type--small core-text--secondary">{row.learning_area_name}</span>
      ),
    },
  ];

  const studentColumns: Column<EnrolledStudent>[] = [
    {
      id: 'admission_number',
      header: 'Admission No',
      sortable: true,
      accessor: (row) => <code className="core-type--weight-bold core-text--dark">{row.admission_number}</code>,
    },
    {
      id: 'full_name',
      header: 'Student Name',
      sortable: true,
      accessor: (row) => <span className="core-type--weight-semibold core-text--dark">{row.full_name}</span>,
    },
    {
      id: 'gender',
      header: 'Gender',
      sortable: true,
      align: 'center',
      accessor: (row) => (
        <span className="core-badge core-surface--light core-text--dark core-border">
          {row.gender === 'M' ? 'Male' : row.gender === 'F' ? 'Female' : row.gender || '—'}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      sortable: true,
      align: 'center',
      accessor: (row) => (
        <span className={`core-badge ${row.is_active ? 'core-surface--success' : 'core-surface--secondary'}`}>
          {row.is_active ? 'Active' : 'Archived'}
        </span>
      ),
    },
  ];

  if (loading && !detail) {
    return (
      <div className="core-container core-space--padding-y-5 core-text--center">
        <LoadingSpinner size="lg" message="Loading class details..." />
      </div>
    );
  }

  if (error && !detail) {
    return (
      <div className="core-container core-space--padding-y-5 core-text--center">
        <Alert variant="danger" className="core-display-inline-block core-text--start">
          {error}
        </Alert>
        <div className="core-space--margin-top-3">
          <Link to="/admin/classes" className="core-button core-button--secondary core-button--sm">
            &larr; Back to Classes
          </Link>
        </div>
      </div>
    );
  }

  const cls = detail?.class;

  return (
    <div className="core-container core-space--padding-y-4">
      {/* Breadcrumb Navigation */}
      <nav aria-label="breadcrumb" className="core-space--margin-bottom-3">
        <ol className="core-breadcrumbs core-type--small">
          <li className="core-breadcrumbs__item">
            <Link to="/admin/classes" className="core-text--decoration-none">
              Classes
            </Link>
          </li>
          <li className="core-breadcrumbs__item active" aria-current="page">
            {cls?.name}
          </li>
        </ol>
      </nav>

      {/* Header */}
      <div className="core-display-flex core-layout--column core-layout--md-row core-layout--justify-between core-layout--align-md-center core-layout--gap-3 core-space--margin-bottom-4">
        <div>
          <div className="core-display-flex core-layout--align-center core-layout--gap-2">
            <h1 className="core-type--heading-3 core-type--weight-bold core-space--margin-bottom-0 core-text--dark">{cls?.name}</h1>
            <code className="core-text--muted core-type--weight-bold">{cls?.class_id}</code>
            <span className={`core-badge ${cls?.is_active ? 'core-surface--success' : 'core-surface--secondary'}`}>
              {cls?.is_active ? 'Active' : 'Archived'}
            </span>
          </div>
          <p className="core-text--muted core-type--small core-space--margin-bottom-0 core-space--margin-top-1">
            Form: <strong>{cls?.form_name || 'None'}</strong> &bull; Program:{' '}
            <strong>{cls?.learning_area_name || 'General'}</strong> &bull; Session:{' '}
            <strong>{cls?.academic_year_name || 'None'}</strong>
          </p>
        </div>

        <div className="core-display-flex core-layout--align-center core-layout--gap-2">
          <Link to="/admin/classes" className="core-button core-button--outline-secondary core-button--sm">
            <AppIcon name="arrowLeft" className="core-space--margin-end-1" />
            Back to Classes
          </Link>
        </div>
      </div>

      {/* Notifications */}
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

      {/* Overview Metric Cards */}
      <div className="core-grid core-grid--gap-3 core-space--margin-bottom-4">
        <div className="core-grid__span-12 core-grid__span-sm-6 core-grid__span-lg-3">
          <div className="core-card core-shadow--sm core-border--none core-border--start core-border--primary core-border--width-4 core-size--height-full">
            <div className="core-card__body">
              <div className="core-text--muted core-type--small core-text--uppercase core-type--weight-bold">Enrollment</div>
              <div className="core-type--heading-3 core-type--weight-bold core-text--dark core-space--margin-top-2 core-space--margin-bottom-0">
                {detail?.students.length ?? 0}{' '}
                <span className="core-type--small core-type--size-6 core-type--weight-normal core-text--muted">/ {cls?.maximum_students} cap</span>
              </div>
            </div>
          </div>
        </div>

        <div className="core-grid__span-12 core-grid__span-sm-6 core-grid__span-lg-3">
          <div className="core-card core-shadow--sm core-border--none core-border--start core-border--info core-border--width-4 core-size--height-full">
            <div className="core-card__body">
              <div className="core-text--muted core-type--small core-text--uppercase core-type--weight-bold">Assigned Subjects</div>
              <div className="core-type--heading-3 core-type--weight-bold core-text--dark core-space--margin-top-2 core-space--margin-bottom-0">
                {detail?.subjects.length ?? 0}
              </div>
            </div>
          </div>
        </div>

        <div className="core-grid__span-12 core-grid__span-sm-6 core-grid__span-lg-3">
          <div className="core-card core-shadow--sm core-border--none core-border--start core-border--success core-border--width-4 core-size--height-full">
            <div className="core-card__body">
              <div className="core-text--muted core-type--small core-text--uppercase core-type--weight-bold">Academic Session</div>
              <div className="core-type--heading-5 core-type--weight-bold core-text--dark core-space--margin-top-2 core-space--margin-bottom-0 core-text--truncate">
                {cls?.academic_year_name || 'Unassigned'}
              </div>
            </div>
          </div>
        </div>

        <div className="core-grid__span-12 core-grid__span-sm-6 core-grid__span-lg-3">
          <div className="core-card core-shadow--sm core-border--none core-border--start core-border--warning core-border--width-4 core-size--height-full">
            <div className="core-card__body">
              <div className="core-text--muted core-type--small core-text--uppercase core-type--weight-bold">Learning Track</div>
              <div className="core-type--heading-5 core-type--weight-bold core-text--dark core-space--margin-top-2 core-space--margin-bottom-0 core-text--truncate">
                {cls?.learning_area_name || 'General Studies'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="core-card core-shadow--sm core-border--none">
        <div className="core-card__header core-surface--white core-border--bottom core-space--padding-0">
          <ul className="nav nav-tabs core-space--padding-x-3 core-space--padding-top-2 core-border--none">
            <li className="nav-item">
              <button
                type="button"
                className={`nav-link core-type--weight-semibold ${activeTab === 'subjects' ? 'active' : ''}`}
                onClick={() => setActiveTab('subjects')}
              >
                <AppIcon name="bookMarked" className="core-space--margin-end-2" />
                Assigned Subjects ({detail?.subjects.length ?? 0})
              </button>
            </li>
            <li className="nav-item">
              <button
                type="button"
                className={`nav-link core-type--weight-semibold ${activeTab === 'students' ? 'active' : ''}`}
                onClick={() => setActiveTab('students')}
              >
                <AppIcon name="users" className="core-space--margin-end-2" />
                Enrolled Students ({detail?.students.length ?? 0})
              </button>
            </li>
          </ul>
        </div>

        <div className="core-card__body core-space--padding-0">
          {activeTab === 'subjects' && (
            <DataTable
              data={detail?.subjects || []}
              columns={subjectColumns}
              keyExtractor={(row) => row.id}
              loading={loading}
              emptyTitle="No subjects assigned to this class yet."
              searchPlaceholder="Filter assigned subjects..."
            />
          )}

          {activeTab === 'students' && (
            <DataTable
              data={detail?.students || []}
              columns={studentColumns}
              keyExtractor={(row) => row.id}
              loading={loading}
              emptyTitle="No students currently enrolled in this class."
              searchPlaceholder="Filter enrolled students..."
            />
          )}
        </div>
      </div>

    </div>
  );
};
