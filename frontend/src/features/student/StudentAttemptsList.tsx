import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { studentApi } from '../../api/student';
import type { StudentAttemptHistoryItem, StudentAttemptsData } from '../../types/student';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { DataTable, type Column } from '../../components/table/DataTable';

const STATUS_FILTERS: { label: string; value: string }[] = [
  { label: 'All Attempts', value: 'all' },
  { label: 'Completed', value: 'completed' },
  { label: 'Passed', value: 'passed' },
  { label: 'Failed', value: 'failed' },
  { label: 'In Progress', value: 'in_progress' },
];

export const StudentAttemptsList: React.FC = () => {
  const [data, setData] = useState<StudentAttemptsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const loadAttempts = async (status: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await studentApi.getStudentAttempts({
        status: status === 'all' ? undefined : status,
      });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch attempts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAttempts(statusFilter);
  }, [statusFilter]);

  const columns: Column<StudentAttemptHistoryItem>[] = [
    {
      id: 'quiz_title',
      header: 'Quiz & Subject',
      sortable: true,
      accessor: (item) => (
        <div>
          <div className="fw-semibold text-dark">{item.quiz_title}</div>
          <span className="badge bg-light text-dark border">{item.subject_name}</span>
        </div>
      ),
    },
    {
      id: 'attempt_number',
      header: 'Attempt #',
      sortable: true,
      accessor: (item) => <span className="fw-bold">Attempt #{item.attempt_number}</span>,
    },
    {
      id: 'score',
      header: 'Score & Marks',
      sortable: true,
      accessor: (item) => (
        <div>
          {item.is_submitted ? (
            <>
              <strong>{item.score}</strong> / {item.total_marks}
            </>
          ) : (
            <span className="text-muted">—</span>
          )}
        </div>
      ),
    },
    {
      id: 'percentage',
      header: 'Percentage',
      sortable: true,
      accessor: (item) =>
        item.is_submitted ? (
          <span
            className={`badge ${item.is_passed ? 'bg-success' : 'bg-danger'} fs-6`}
          >
            {item.percentage}%
          </span>
        ) : (
          <span className="badge bg-warning text-dark">In Progress</span>
        ),
    },
    {
      id: 'submitted_at',
      header: 'Date & Time',
      sortable: true,
      accessor: (item) => (
        <span className="small text-muted">
          {item.submitted_at
            ? new Date(item.submitted_at).toLocaleString()
            : item.started_at
            ? `Started ${new Date(item.started_at).toLocaleString()}`
            : '—'}
        </span>
      ),
    },
    {
      id: 'action',
      header: 'Action',
      sortable: false,
      accessor: (item) => {
        if (!item.is_submitted) {
          return (
            <Link
              to={`/student/take/${item.id}`}
              className="btn btn-sm btn-warning fw-bold text-dark text-nowrap"
            >
              Resume
            </Link>
          );
        }
        return (
          <Link
            to={`/student/attempts/${item.id}/result`}
            className="btn btn-sm btn-outline-primary text-nowrap"
          >
            Review Result
          </Link>
        );
      },
    },
  ];

  return (
    <div className="assessment-page container-fluid py-4" data-testid="student-attempts-list">
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
        <div>
          <h2 className="h3 fw-bold text-dark mb-1">My Quiz Attempts</h2>
          <p className="text-muted mb-0">Track your past scores, percentages, and progress</p>
        </div>
        <div className="d-flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => loadAttempts(statusFilter)}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      {data && (
        <div className="row g-3 mb-4">
          <div className="col-sm-6 col-lg-3">
            <div className="card shadow-sm border-0">
              <div className="card-body">
                <span className="text-muted small text-uppercase fw-semibold">Total Attempts</span>
                <h3 className="fw-bold text-primary mt-2 mb-1">{data.total_attempts}</h3>
                <div className="small text-muted">{data.completed_attempts_count} completed</div>
              </div>
            </div>
          </div>
          <div className="col-sm-6 col-lg-3">
            <div className="card shadow-sm border-0">
              <div className="card-body">
                <span className="text-muted small text-uppercase fw-semibold">Average Percentage</span>
                <h3 className="fw-bold text-info mt-2 mb-1">{data.avg_percentage}%</h3>
                <div className="small text-muted">Across all completed quizzes</div>
              </div>
            </div>
          </div>
          <div className="col-sm-6 col-lg-3">
            <div className="card shadow-sm border-0">
              <div className="card-body">
                <span className="text-muted small text-uppercase fw-semibold">Average Marks</span>
                <h3 className="fw-bold text-secondary mt-2 mb-1">{data.avg_score}</h3>
                <div className="small text-muted">Points earned per attempt</div>
              </div>
            </div>
          </div>
          <div className="col-sm-6 col-lg-3">
            <div className="card shadow-sm border-0">
              <div className="card-body">
                <span className="text-muted small text-uppercase fw-semibold">Best Result</span>
                <h3 className="fw-bold text-success mt-2 mb-1">{data.best_percentage}%</h3>
                <div className="small text-muted">Highest score achieved</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status Filter Tabs */}
      <div className="btn-group mb-4" role="group" aria-label="Status filters">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={`btn btn-sm text-capitalize ${
              statusFilter === f.value ? 'btn-primary' : 'btn-outline-secondary'
            }`}
            onClick={() => setStatusFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <Alert variant="danger" dismissible onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      <div className="card shadow-sm border-0">
        <div className="card-body p-0">
          <DataTable
            data={data?.attempts || []}
            columns={columns}
            keyExtractor={(row) => row.id}
            loading={loading}
            searchable={true}
            searchPlaceholder="Search by quiz title or subject..."
            emptyTitle="No quiz attempts recorded yet."
          />
        </div>
      </div>
    </div>
  );
};
