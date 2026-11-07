import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { studentApi } from '../../api/student';
import type { StudentQuiz, StudentQuizStatus } from '../../types/student';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { DataTable, type Column } from '../../components/table/DataTable';

const STATUS_OPTIONS: { label: string; value: string }[] = [
  { label: 'All', value: 'all' },
  { label: 'Available', value: 'available' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Completed', value: 'completed' },
  { label: 'Upcoming', value: 'upcoming' },
  { label: 'Expired', value: 'expired' },
];

export const StudentQuizList: React.FC = () => {
  const [quizzes, setQuizzes] = useState<StudentQuiz[]>([]);
  const [className, setClassName] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const loadQuizzes = async (status: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await studentApi.getStudentQuizzes({
        status: status === 'all' ? undefined : status,
      });
      setQuizzes(res.quizzes);
      setClassName(res.class_name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch quizzes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuizzes(statusFilter);
  }, [statusFilter]);

  const getStatusBadge = (status: StudentQuizStatus) => {
    switch (status) {
      case 'available':
        return <span className="badge bg-success">Available</span>;
      case 'in_progress':
        return <span className="badge bg-warning text-dark">In Progress</span>;
      case 'completed':
        return <span className="badge bg-secondary">Completed</span>;
      case 'upcoming':
        return <span className="badge bg-info text-dark">Upcoming</span>;
      case 'expired':
        return <span className="badge bg-danger">Expired</span>;
      default:
        return <span className="badge bg-light text-dark">Unavailable</span>;
    }
  };

  const columns: Column<StudentQuiz>[] = [
    {
      id: 'title',
      header: 'Quiz Title & Subject',
      sortable: true,
      accessor: (item) => (
        <div>
          <div className="fw-semibold text-dark">{item.title}</div>
          <div className="small text-muted">
            <span className="badge bg-light text-dark border me-2">{item.subject_name}</span>
            <span>By {item.teacher_name}</span>
          </div>
        </div>
      ),
    },
    {
      id: 'duration_minutes',
      header: 'Duration & Questions',
      sortable: true,
      accessor: (item) => (
        <div>
          <div>
            <i className="bi bi-clock me-1 text-muted"></i>
            {item.duration_minutes > 0 ? `${item.duration_minutes} mins` : 'Untimed'}
          </div>
          <div className="small text-muted">{item.total_questions} questions • {item.total_marks} marks</div>
        </div>
      ),
    },
    {
      id: 'attempts_count',
      header: 'Attempts & Score',
      sortable: true,
      accessor: (item) => (
        <div>
          <div>
            {item.attempts_count} of {item.max_attempts} attempts
          </div>
          {item.attempts_count > 0 && (
            <div className="small text-muted">
              Best: <strong>{item.best_percentage}%</strong>
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      sortable: true,
      accessor: (item) => getStatusBadge(item.status),
    },
    {
      id: 'action',
      header: 'Action',
      sortable: false,
      accessor: (item) => {
        if (item.status === 'in_progress' && item.in_progress_attempt_id) {
          return (
            <Link
              to={`/student/take/${item.in_progress_attempt_id}`}
              className="btn btn-sm btn-warning fw-bold text-dark text-nowrap"
            >
              Resume Quiz
            </Link>
          );
        }
        if (item.can_attempt) {
          return (
            <Link
              to={`/student/quizzes/${item.id}`}
              className="btn btn-sm btn-primary text-nowrap"
            >
              Take Quiz
            </Link>
          );
        }
        return (
          <Link
            to={`/student/quizzes/${item.id}`}
            className="btn btn-sm btn-outline-secondary text-nowrap"
          >
            Details
          </Link>
        );
      },
    },
  ];

  return (
    <div className="assessment-page container-fluid py-4" data-testid="student-quiz-list">
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
        <div>
          <h2 className="h3 fw-bold text-dark mb-1">Available Quizzes</h2>
          <p className="text-muted mb-0">
            {className
              ? `Assessments assigned to your class (${className})`
              : 'Assessments assigned to your current class enrollment'}
          </p>
        </div>
        <div className="d-flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => loadQuizzes(statusFilter)}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="btn-group mb-4" role="group" aria-label="Status filters">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`btn btn-sm text-capitalize ${
              statusFilter === opt.value ? 'btn-primary' : 'btn-outline-secondary'
            }`}
            onClick={() => setStatusFilter(opt.value)}
          >
            {opt.label}
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
            data={quizzes}
            columns={columns}
            keyExtractor={(row) => row.id}
            loading={loading}
            searchable={true}
            searchPlaceholder="Search quizzes by title or subject..."
            emptyTitle="No quizzes found matching your criteria."
          />
        </div>
      </div>
    </div>
  );
};
