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
          <Link to={`/teacher/quizzes/${row.id}`} className="core-type--weight-bold core-text--dark core-text--decoration-none">
            {row.title}
          </Link>
          <div className="core-type--small core-text--muted">{row.subject_name || 'General Subject'}</div>
        </div>
      ),
    },
    {
      id: 'academic',
      header: 'Academic Term',
      sortable: true,
      accessor: (row) => (
        <div className="core-type--small">
          <div>{row.academic_year || '—'}</div>
          {row.term && <span className="core-text--muted">{row.term}</span>}
        </div>
      ),
    },
    {
      id: 'duration',
      header: 'Timing & Marks',
      sortable: true,
      accessor: (row) => (
        <div className="core-type--small">
          <div>{row.duration_minutes ? `${row.duration_minutes} mins` : 'No limit'}</div>
          <span className="core-text--muted">{row.total_questions} Qs · {row.total_marks} Marks</span>
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
          <span className="core-badge core-surface--primary-subtle core-text--primary core-border">
            {row.total_attempts} attempts
          </span>
          {row.total_attempts > 0 && (
            <div className="core-type--small core-text--muted core-space--margin-top-1">Avg: {row.avg_score}%</div>
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
          className={`core-badge ${
            row.status === 'published'
              ? 'core-surface--success'
              : row.status === 'draft'
              ? 'core-surface--warning core-text--dark'
              : 'core-surface--secondary'
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
        <div className="core-display-flex core-layout--justify-center core-layout--gap-1">
          <Link to={`/teacher/quizzes/${row.id}`} className="core-button core-button--sm core-button--outline-primary core-space--padding-y-0 core-space--padding-x-2">
            Details
          </Link>
          <Link to={`/teacher/quizzes/${row.id}/edit`} className="core-button core-button--sm core-button--outline-secondary core-space--padding-y-0 core-space--padding-x-2">
            Edit
          </Link>
        </div>
      ),
    },
  ];

  return (
    <div className="assessment-page core-container core-space--padding-y-4" data-testid="teacher-quiz-list">
      <div className="core-display-flex core-layout--wrap core-layout--justify-between core-layout--align-center core-space--margin-bottom-4 core-layout--gap-3">
        <div>
          <h2 className="core-type--heading-3 core-type--weight-bold core-text--dark core-space--margin-bottom-1">Quiz Catalog</h2>
          <p className="core-text--muted core-space--margin-bottom-0">
            View, search, and inspect your quizzes and assessments
          </p>
        </div>
        <div className="core-display-flex core-layout--gap-2">
          <Button variant="secondary" size="sm" onClick={loadQuizzes} disabled={loading}>
            Refresh
          </Button>
          <Link to="/teacher/quizzes/new" className="core-button core-button--sm core-button--primary">Create Quiz</Link>
        </div>
      </div>

      {error && (
        <Alert variant="danger" dismissible onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Filter Tabs */}
      <div className="core-button-group core-space--margin-bottom-4" role="group" aria-label="Status filters">
        {['all', 'published', 'draft', 'archived'].map((status) => (
          <button
            key={status}
            type="button"
            className={`core-button core-button--sm ${
              statusFilter === status ? 'core-button--primary' : 'core-button--outline-secondary'
            } core-text--capitalize`}
            onClick={() => setStatusFilter(status)}
          >
            {status}
          </button>
        ))}
      </div>

      <div className="core-card core-shadow--sm core-border--none">
        <div className="core-card__body core-space--padding-0">
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
