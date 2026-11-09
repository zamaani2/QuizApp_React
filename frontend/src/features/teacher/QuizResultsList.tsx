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
          <span className="core-type--weight-semibold core-text--dark">{row.student_name}</span>
          <div className="core-type--small core-text--muted">{row.admission_number} · {row.class_name}</div>
        </div>
      ),
    },
    {
      id: 'quiz',
      header: 'Quiz',
      sortable: true,
      accessor: (row) => (
        <div>
          <Link to={`/teacher/results/${row.id}`} className="core-type--weight-medium core-text--dark core-text--decoration-none">{row.quiz_title}</Link>
          <div className="core-type--small core-text--muted">View submission details</div>
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
          <span className="core-type--weight-bold core-type--size-6">
            {row.score}/{row.total_marks}
          </span>
          <div className="core-type--small core-text--muted">{row.percentage}%</div>
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Outcome',
      sortable: true,
      align: 'center',
      accessor: (row) => (
        <span className={`core-badge ${row.is_passed ? 'core-surface--success' : 'core-surface--danger'}`}>
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
          className={`core-badge ${
            row.is_graded
              ? 'core-surface--light core-text--dark core-border'
              : 'core-surface--warning-subtle core-text--warning-emphasis core-border'
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
        return <small className="core-text--muted">{row.submitted_at.split('T')[0]}</small>;
      },
    },
  ];

  return (
    <div className="assessment-page core-container core-space--padding-y-4" data-testid="teacher-results-list">
      <div className="core-display-flex core-layout--wrap core-layout--justify-between core-layout--align-center core-space--margin-bottom-4 core-layout--gap-3">
        <div>
          <h2 className="core-type--heading-3 core-type--weight-bold core-text--dark core-space--margin-bottom-1">Quiz Results & Analytics</h2>
          <p className="core-text--muted core-space--margin-bottom-0">
            Review student attempts, scores, and performance records
          </p>
        </div>
        <div className="core-display-flex core-layout--gap-2">
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
          <a href={`/quizzes/results/export/${quizIdParam ? `?quiz=${encodeURIComponent(quizIdParam)}` : ''}`} className="core-button core-button--sm core-button--outline-primary">
            Export Excel
          </a>
        </div>
      </div>

      {error && (
        <Alert variant="danger" dismissible onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      <div className="core-display-flex core-layout--justify-end core-space--margin-bottom-3">
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
      <div className="core-grid core-grid--gap-3 core-space--margin-bottom-4">
        <div className="core-grid__span-12 core-grid__span-sm-4">
          <div className="core-card core-shadow--sm core-border--none core-border--start core-border--primary core-border--width-4">
            <div className="core-card__body">
              <div className="core-text--muted core-type--small core-text--uppercase core-type--weight-bold">Total Attempts</div>
              <div className="core-type--heading-3 core-type--weight-bold core-text--dark core-space--margin-top-2 core-space--margin-bottom-0">{results.length}</div>
            </div>
          </div>
        </div>
        <div className="core-grid__span-12 core-grid__span-sm-4">
          <div className="core-card core-shadow--sm core-border--none core-border--start core-border--success core-border--width-4">
            <div className="core-card__body">
              <div className="core-text--muted core-type--small core-text--uppercase core-type--weight-bold">Passed Attempts</div>
              <div className="core-type--heading-3 core-type--weight-bold core-text--dark core-space--margin-top-2 core-space--margin-bottom-0">{passedCount}</div>
            </div>
          </div>
        </div>
        <div className="core-grid__span-12 core-grid__span-sm-4">
          <div className="core-card core-shadow--sm core-border--none core-border--start core-border--info core-border--width-4">
            <div className="core-card__body">
              <div className="core-text--muted core-type--small core-text--uppercase core-type--weight-bold">Pass Rate</div>
              <div className="core-type--heading-3 core-type--weight-bold core-text--dark core-space--margin-top-2 core-space--margin-bottom-0">{passRate}%</div>
            </div>
          </div>
        </div>
      </div>

      <div className="core-card core-shadow--sm core-border--none">
        <div className="core-card__body core-space--padding-0">
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
