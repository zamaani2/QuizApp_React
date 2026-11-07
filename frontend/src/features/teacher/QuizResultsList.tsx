import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { fetchTeacherResults } from '../../api/teacher';
import type { QuizResultItem } from '../../types';
import { DataTable, type Column } from '../../components/table/DataTable';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';

export const QuizResultsList: React.FC = () => {
  const [searchParams] = useSearchParams();
  const quizIdParam = searchParams.get('quiz_id');

  const [results, setResults] = useState<QuizResultItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [tableSearch, setTableSearch] = useState('');

  const loadResults = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedIds([]);
    try {
      const response = await fetchTeacherResults({
        quiz_id: quizIdParam ? Number(quizIdParam) : undefined,
      });
      setResults(response.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quiz results.');
    } finally {
      setLoading(false);
    }
  }, [quizIdParam]);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  const passedCount = results.filter((r) => r.is_passed).length;
  const passRate = results.length > 0 ? Math.round((passedCount / results.length) * 100) : 0;
  const normalizedSearch = tableSearch.trim().toLowerCase();
  const filteredResults = normalizedSearch
    ? results.filter((row) =>
        Object.values(row).some((value) =>
          value !== null && value !== undefined
            ? String(value).toLowerCase().includes(normalizedSearch)
            : false
        )
      )
    : results;

  const toggleSelected = (id: number) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]
    );
  };

  const toggleFilteredSelection = () => {
    const filteredIds = filteredResults.map((row) => row.id);
    const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.includes(id));
    setSelectedIds((current) =>
      allSelected
        ? current.filter((id) => !filteredIds.includes(id))
        : [...new Set([...current, ...filteredIds])]
    );
  };

  const openPrintPage = (attemptIds: number[]) => {
    if (!attemptIds.length) return;
    const params = new URLSearchParams();
    attemptIds.forEach((id) => params.append('attempt_ids', String(id)));
    window.open(`/app/teacher/results/print/?${params.toString()}`, '_blank', 'noopener,noreferrer');
  };

  const columns: Column<QuizResultItem>[] = [
    {
      id: 'select',
      header: 'Select',
      width: '64px',
      align: 'center',
      accessor: (row) => (
        <input
          type="checkbox"
          aria-label={`Select result for ${row.student_name}`}
          checked={selectedIds.includes(row.id)}
          onChange={() => toggleSelected(row.id)}
          onClick={(event) => event.stopPropagation()}
        />
      ),
    },
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
      accessor: (row) => (
        <div>
          <Link to={`/teacher/results/${row.id}`} className="fw-medium text-dark text-decoration-none">{row.quiz_title}</Link>
          <div className="small text-muted">View submission details</div>
        </div>
      ),
    },
    {
      id: 'score',
      header: 'Score',
      sortable: true,
      align: 'center',
      accessor: (row) => (
        <div>
          <span className="fw-bold fs-6">
            {row.score}/{row.total_marks}
          </span>
          <div className="small text-muted">{row.percentage}%</div>
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Outcome',
      sortable: true,
      align: 'center',
      accessor: (row) => (
        <span className={`badge ${row.is_passed ? 'bg-success' : 'bg-danger'}`}>
          {row.is_passed ? 'Passed' : 'Failed'}
        </span>
      ),
    },
    {
      id: 'grading',
      header: 'Grading',
      sortable: true,
      align: 'center',
      accessor: (row) => (
        <span
          className={`badge ${
            row.is_graded
              ? 'bg-light text-dark border'
              : 'bg-warning-subtle text-warning-emphasis border'
          }`}
        >
          {row.is_graded ? 'Completed' : 'Needs Review'}
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
  ];

  return (
    <div className="assessment-page container-fluid py-4" data-testid="teacher-results-list">
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
        <div>
          <h2 className="h3 fw-bold text-dark mb-1">Quiz Results & Analytics</h2>
          <p className="text-muted mb-0">
            Review student attempts, scores, and performance records
          </p>
        </div>
        <div className="d-flex gap-2">
          <Button variant="secondary" size="sm" onClick={loadResults} disabled={loading}>
            Refresh
          </Button>
          <Button
            variant="outline-primary"
            size="sm"
            onClick={() => openPrintPage(selectedIds)}
            disabled={loading || selectedIds.length === 0}
          >
            Print Selected ({selectedIds.length})
          </Button>
          <Button
            variant="outline-primary"
            size="sm"
            onClick={() => openPrintPage(filteredResults.map((row) => row.id))}
            disabled={loading || filteredResults.length === 0}
          >
            Print All Filtered
          </Button>
          <a href={`/quizzes/results/export/${quizIdParam ? `?quiz=${encodeURIComponent(quizIdParam)}` : ''}`} className="btn btn-sm btn-outline-primary">
            Export Excel
          </a>
        </div>
      </div>

      {error && (
        <Alert variant="danger" dismissible onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      <div className="d-flex justify-content-end mb-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={toggleFilteredSelection}
          disabled={loading || filteredResults.length === 0}
        >
          {filteredResults.length > 0 && filteredResults.every((row) => selectedIds.includes(row.id))
            ? 'Clear filtered selection'
            : `Select all filtered (${filteredResults.length})`}
        </Button>
      </div>

      {/* Metrics */}
      <div className="row g-3 mb-4">
        <div className="col-12 col-sm-4">
          <div className="card shadow-sm border-0 border-start border-primary border-4">
            <div className="card-body">
              <div className="text-muted small text-uppercase fw-bold">Total Attempts</div>
              <div className="h3 fw-bold text-dark mt-2 mb-0">{results.length}</div>
            </div>
          </div>
        </div>
        <div className="col-12 col-sm-4">
          <div className="card shadow-sm border-0 border-start border-success border-4">
            <div className="card-body">
              <div className="text-muted small text-uppercase fw-bold">Passed Attempts</div>
              <div className="h3 fw-bold text-dark mt-2 mb-0">{passedCount}</div>
            </div>
          </div>
        </div>
        <div className="col-12 col-sm-4">
          <div className="card shadow-sm border-0 border-start border-info border-4">
            <div className="card-body">
              <div className="text-muted small text-uppercase fw-bold">Pass Rate</div>
              <div className="h3 fw-bold text-dark mt-2 mb-0">{passRate}%</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card shadow-sm border-0">
        <div className="card-body p-0">
          <DataTable<QuizResultItem>
            columns={columns}
            data={results}
            keyExtractor={(row) => row.id}
            loading={loading}
            searchable={true}
            onSearchChange={setTableSearch}
            searchPlaceholder="Search by student name, admission, or quiz title..."
            emptyTitle="No Results Found"
            emptyDescription="There are no student quiz submissions recorded yet."
          />
        </div>
      </div>
    </div>
  );
};
