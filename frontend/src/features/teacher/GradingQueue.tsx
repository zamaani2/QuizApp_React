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

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchTeacherGradingQueue();
      setItems(response.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load grading queue.');
    } finally {
      setLoading(false);
    }
  }, []);

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
          <span className="fw-semibold text-dark">{row.student_name}</span>
          <div className="small text-muted">{row.admission_number} · {row.class_name}</div>
        </div>
      ),
    },
    {
      id: 'quiz',
      header: 'Quiz',
      sortable: true,
      accessor: (row) => <span className="fw-medium text-dark">{row.quiz_title}</span>,
    },
    {
      id: 'ungraded',
      header: 'Pending Responses',
      sortable: true,
      align: 'center',
      accessor: (row) => (
        <span className="badge bg-warning-subtle text-warning-emphasis border">
          {row.ungraded_responses_count} essay {row.ungraded_responses_count === 1 ? 'question' : 'questions'}
        </span>
      ),
    },
    {
      id: 'submitted_at',
      header: 'Submitted',
      sortable: true,
      accessor: (row) => {
        if (!row.submitted_at) return '—';
        return <small className="text-muted">{row.submitted_at.split('T')[0]}</small>;
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'center',
      accessor: (row) => (
        <Link to={`/teacher/grading/${row.id}`} className="btn btn-sm btn-primary py-0 px-2">
          Grade &rarr;
        </Link>
      ),
    },
  ];

  return (
    <div className="assessment-page container-fluid py-4" data-testid="teacher-grading-queue">
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
        <div>
          <h2 className="h3 fw-bold text-dark mb-1">Manual Grading Queue</h2>
          <p className="text-muted mb-0">
            Student submissions with essay questions awaiting instructor evaluation
          </p>
        </div>
        <div className="d-flex gap-2">
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
      <div className="row g-3 mb-4">
        <div className="col-12 col-sm-6">
          <div className="card shadow-sm border-0 border-start border-warning border-4">
            <div className="card-body">
              <div className="text-muted small text-uppercase fw-bold">Attempts to Grade</div>
              <div className="h3 fw-bold text-dark mt-2 mb-0">{items.length}</div>
            </div>
          </div>
        </div>
        <div className="col-12 col-sm-6">
          <div className="card shadow-sm border-0 border-start border-primary border-4">
            <div className="card-body">
              <div className="text-muted small text-uppercase fw-bold">Affected Quizzes</div>
              <div className="h3 fw-bold text-dark mt-2 mb-0">{uniqueQuizzesCount}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card shadow-sm border-0">
        <div className="card-body p-0">
          <DataTable<GradingQueueItem>
            columns={columns}
            data={items}
            keyExtractor={(row) => row.id}
            loading={loading}
            searchable={true}
            searchPlaceholder="Search by student name or quiz title..."
            emptyTitle="All Caught Up!"
            emptyDescription="There are currently no student essay submissions awaiting manual evaluation."
          />
        </div>
      </div>
    </div>
  );
};
