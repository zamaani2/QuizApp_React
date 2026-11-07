import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { fetchTeacherQuizzes } from '../../api/teacher';
import type { QuizListItem } from '../../types';
import { DataTable, type Column } from '../../components/table/DataTable';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';

export const QuizList: React.FC = () => {
  const [quizzes, setQuizzes] = useState<QuizListItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const loadQuizzes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchTeacherQuizzes({
        status: statusFilter === 'all' ? undefined : statusFilter,
      });
      setQuizzes(response.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quizzes.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadQuizzes();
  }, [loadQuizzes]);

  const columns: Column<QuizListItem>[] = [
    {
      id: 'title',
      header: 'Quiz Title & Subject',
      sortable: true,
      accessor: (row) => (
        <div>
          <Link to={`/teacher/quizzes/${row.id}`} className="fw-bold text-dark text-decoration-none">
            {row.title}
          </Link>
          <div className="small text-muted">{row.subject_name || 'General Subject'}</div>
        </div>
      ),
    },
    {
      id: 'academic',
      header: 'Academic Term',
      sortable: true,
      accessor: (row) => (
        <div className="small">
          <div>{row.academic_year || '—'}</div>
          {row.term && <span className="text-muted">{row.term}</span>}
        </div>
      ),
    },
    {
      id: 'duration',
      header: 'Timing & Marks',
      sortable: true,
      accessor: (row) => (
        <div className="small">
          <div>{row.duration_minutes ? `${row.duration_minutes} mins` : 'No limit'}</div>
          <span className="text-muted">{row.total_questions} Qs · {row.total_marks} Marks</span>
        </div>
      ),
    },
    {
      id: 'attempts',
      header: 'Submissions',
      sortable: true,
      align: 'center',
      accessor: (row) => (
        <div>
          <span className="badge bg-primary-subtle text-primary border">
            {row.total_attempts} attempts
          </span>
          {row.total_attempts > 0 && (
            <div className="small text-muted mt-1">Avg: {row.avg_score}%</div>
          )}
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      sortable: true,
      align: 'center',
      accessor: (row) => (
        <span
          className={`badge ${
            row.status === 'published'
              ? 'bg-success'
              : row.status === 'draft'
              ? 'bg-warning text-dark'
              : 'bg-secondary'
          }`}
        >
          {row.status}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'center',
      accessor: (row) => (
        <div className="d-flex justify-content-center gap-1">
          <Link to={`/teacher/quizzes/${row.id}`} className="btn btn-sm btn-outline-primary py-0 px-2">
            Details
          </Link>
          <Link to={`/teacher/quizzes/${row.id}/edit`} className="btn btn-sm btn-outline-secondary py-0 px-2">
            Edit
          </Link>
        </div>
      ),
    },
  ];

  return (
    <div className="assessment-page container-fluid py-4" data-testid="teacher-quiz-list">
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
        <div>
          <h2 className="h3 fw-bold text-dark mb-1">Quiz Catalog</h2>
          <p className="text-muted mb-0">
            View, search, and inspect your quizzes and assessments
          </p>
        </div>
        <div className="d-flex gap-2">
          <Button variant="secondary" size="sm" onClick={loadQuizzes} disabled={loading}>
            Refresh
          </Button>
          <Link to="/teacher/quizzes/new" className="btn btn-sm btn-primary">Create Quiz</Link>
        </div>
      </div>

      {error && (
        <Alert variant="danger" dismissible onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Filter Tabs */}
      <div className="btn-group mb-4" role="group" aria-label="Status filters">
        {['all', 'published', 'draft', 'archived'].map((status) => (
          <button
            key={status}
            type="button"
            className={`btn btn-sm ${
              statusFilter === status ? 'btn-primary' : 'btn-outline-secondary'
            } text-capitalize`}
            onClick={() => setStatusFilter(status)}
          >
            {status}
          </button>
        ))}
      </div>

      <div className="card shadow-sm border-0">
        <div className="card-body p-0">
          <DataTable<QuizListItem>
            columns={columns}
            data={quizzes}
            keyExtractor={(row) => row.id}
            loading={loading}
            searchable={true}
            searchPlaceholder="Search by quiz title or subject..."
            emptyTitle="No Quizzes Found"
            emptyDescription="There are no quizzes matching your selected filter."
          />
        </div>
      </div>
    </div>
  );
};
