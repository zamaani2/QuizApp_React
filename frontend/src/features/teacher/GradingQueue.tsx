import React, { useEffect, useState, useCallback } from 'react';
import { fetchTeacherGradingQueue } from '../../api/teacher';
import { Link } from 'react-router-dom';
import type { GradingQueueItem } from '../../types';
import { DataTable, type Column } from '../../components/table/DataTable';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';

export const GradingQueue: React.FC = () => {
  const [items, setItems] = useState<GradingQueueItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchTeacherGradingQueue(showCompleted);
      setItems(response.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load grading queue.');
    } finally {
      setLoading(false);
    }
  }, [showCompleted]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const uniqueQuizzesCount = new Set(items.map((i) => i.quiz_id)).size;

  const columns: Column<GradingQueueItem>[] = [
    {
      id: 'student',
      header: 'Student',
      sortable: true,
      accessor: (row) => (
        <div>
          <span className="core-type--weight-semibold core-text--dark">{row.student_name}</span>
          <div className="core-type--small core-text--muted">{row.admission_number} · {row.class_name}</div>
        </div>
      ),
    },
    {
      id: 'quiz',
      header: 'Quiz',
      sortable: true,
      accessor: (row) => <span className="core-type--weight-medium core-text--dark">{row.quiz_title}</span>,
    },
    {
      id: 'ungraded',
      header: showCompleted ? 'Grading status' : 'Pending Responses',
      sortable: true,
      align: 'center',
      accessor: (row) => (
        <span className={`core-badge core-border ${row.is_graded
          ? 'core-surface--success-subtle core-text--success-emphasis'
          : 'core-surface--warning-subtle core-text--warning-emphasis'}`}>
          {row.is_graded
            ? 'All graded'
            : `${row.ungraded_responses_count} response${row.ungraded_responses_count === 1 ? '' : 's'}`}
        </span>
      ),
    },
    {
      id: 'submitted_at',
      header: 'Submitted',
      sortable: true,
      accessor: (row) => {
        if (!row.submitted_at) return '—';
        return <small className="core-text--muted">{row.submitted_at.split('T')[0]}</small>;
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'center',
      accessor: (row) => (
        <Link to={`/teacher/grading/${row.id}`} className="core-button core-button--sm core-button--primary core-space--padding-y-0 core-space--padding-x-2">
          {row.is_graded ? 'Edit grade' : 'Grade'} &rarr;
        </Link>
      ),
    },
  ];

  return (
    <div className="assessment-page core-container core-space--padding-y-4" data-testid="teacher-grading-queue">
      <div className="core-display-flex core-layout--wrap core-layout--justify-between core-layout--align-center core-space--margin-bottom-4 core-layout--gap-3">
        <div>
          <h2 className="core-type--heading-3 core-type--weight-bold core-text--dark core-space--margin-bottom-1">
            {showCompleted ? 'Completed Manual Grades' : 'Manual Grading Queue'}
          </h2>
          <p className="core-text--muted core-space--margin-bottom-0">
            {showCompleted
              ? 'Reopen a completed submission to adjust marks or feedback.'
              : 'Submitted answers that need instructor evaluation'}
          </p>
        </div>
        <div className="core-display-flex core-layout--gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowCompleted((current) => !current)}
            disabled={loading}
          >
            {showCompleted ? 'Show pending' : 'Show completed'}
          </Button>
          <Button variant="secondary" size="sm" onClick={loadQueue} disabled={loading}>
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="danger" dismissible onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Metrics */}
      <div className="core-grid core-grid--gap-3 core-space--margin-bottom-4">
        <div className="core-grid__span-12 core-grid__span-sm-6">
          <div className="core-card core-shadow--sm core-border--none core-border--start core-border--warning core-border--width-4">
            <div className="core-card__body">
              <div className="core-text--muted core-type--small core-text--uppercase core-type--weight-bold">
                {showCompleted ? 'Completed Attempts' : 'Attempts to Grade'}
              </div>
              <div className="core-type--heading-3 core-type--weight-bold core-text--dark core-space--margin-top-2 core-space--margin-bottom-0">{items.length}</div>
            </div>
          </div>
        </div>
        <div className="core-grid__span-12 core-grid__span-sm-6">
          <div className="core-card core-shadow--sm core-border--none core-border--start core-border--primary core-border--width-4">
            <div className="core-card__body">
              <div className="core-text--muted core-type--small core-text--uppercase core-type--weight-bold">Affected Quizzes</div>
              <div className="core-type--heading-3 core-type--weight-bold core-text--dark core-space--margin-top-2 core-space--margin-bottom-0">{uniqueQuizzesCount}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="core-card core-shadow--sm core-border--none">
        <div className="core-card__body core-space--padding-0">
          <DataTable<GradingQueueItem>
            columns={columns}
            data={items}
            keyExtractor={(row) => row.id}
            loading={loading}
            searchable={true}
            searchPlaceholder="Search by student name or quiz title..."
            emptyTitle={showCompleted ? 'No completed grades yet' : 'All Caught Up!'}
            emptyDescription={showCompleted
              ? 'Completed submissions with manual grades will appear here.'
              : 'There are currently no student responses awaiting manual evaluation.'}
          />
        </div>
      </div>
    </div>
  );
};
