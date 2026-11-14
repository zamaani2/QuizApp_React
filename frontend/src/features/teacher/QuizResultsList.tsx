import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import {
  exportTeacherResults,
  fetchQuizFormOptions,
  fetchTeacherQuizzes,
  fetchTeacherResults,
} from '../../api/teacher';
import type { QuizFormOptions, QuizListItem, QuizResultItem } from '../../types';
import { DataTable, type Column } from '../../components/table/DataTable';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';

export const QuizResultsList: React.FC = () => {
  const [searchParams] = useSearchParams();
  const quizIdParam = searchParams.get('quiz_id');

  const [results, setResults] = useState<QuizResultItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [tableSearch, setTableSearch] = useState('');
  const [exportQuizzes, setExportQuizzes] = useState<QuizListItem[]>([]);
  const [exportOptions, setExportOptions] = useState<QuizFormOptions | null>(null);
  const [exportOptionsLoading, setExportOptionsLoading] = useState(true);
  const [exportOptionsError, setExportOptionsError] = useState<string | null>(null);
  const [exportQuizId, setExportQuizId] = useState(quizIdParam || '');
  const [exportClassId, setExportClassId] = useState('');
  const [exportYearId, setExportYearId] = useState('');
  const [exportTermId, setExportTermId] = useState('');
  const [exportAttempt, setExportAttempt] = useState<'best' | 'latest' | 'all'>('best');
  const [exportFormat, setExportFormat] = useState<'csv' | 'xlsx' | 'print'>('xlsx');
  const [exportIncludePending, setExportIncludePending] = useState(false);
  const [exportIncludePercentage, setExportIncludePercentage] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [skippedPendingCount, setSkippedPendingCount] = useState<number | null>(null);
  const resultsRequestId = useRef(0);

  const loadResults = useCallback(async () => {
    const requestId = ++resultsRequestId.current;
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      const response = await fetchTeacherResults({
        quiz_id: exportQuizId ? Number(exportQuizId) : undefined,
        class_id: exportClassId ? Number(exportClassId) : undefined,
        academic_year_id: exportYearId ? Number(exportYearId) : undefined,
        term_id: exportTermId ? Number(exportTermId) : undefined,
        attempt: exportAttempt,
        include_pending: exportIncludePending,
      });
      if (requestId === resultsRequestId.current) setResults(response.results);
    } catch (err) {
      if (requestId === resultsRequestId.current) {
        setError(err instanceof Error ? err.message : 'Failed to load quiz results.');
      }
    } finally {
      if (requestId === resultsRequestId.current) setLoading(false);
    }
  }, [
    exportQuizId,
    exportClassId,
    exportYearId,
    exportTermId,
    exportAttempt,
    exportIncludePending,
  ]);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  useEffect(() => {
    setExportQuizId(quizIdParam || '');
  }, [quizIdParam]);

  useEffect(() => {
    let active = true;
    Promise.all([fetchTeacherQuizzes(), fetchQuizFormOptions()])
      .then(([quizResponse, options]) => {
        if (!active) return;
        setExportQuizzes(quizResponse.results);
        setExportOptions(options);
      })
      .catch((err: unknown) => {
        if (active) {
          setExportOptionsError(err instanceof Error ? err.message : 'Unable to load export filters.');
        }
      })
      .finally(() => {
        if (active) setExportOptionsLoading(false);
      });
    return () => { active = false; };
  }, []);

  const gradedResults = results.filter((row) => !row.has_pending_essay);
  const passedCount = gradedResults.filter((row) => row.is_passed).length;
  const passRate = gradedResults.length > 0
    ? Math.round((passedCount / gradedResults.length) * 100)
    : 0;
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

  const openPrintPage = (attemptIds: number[]) => {
    if (!attemptIds.length) return;
    const params = new URLSearchParams();
    attemptIds.forEach((attemptId) => params.append('attempt_ids', String(attemptId)));
    window.open(`/app/teacher/results/print/?${params.toString()}`, '_blank', 'noopener,noreferrer');
  };

  const selectedExportQuiz = exportQuizzes.find((quiz) => String(quiz.id) === exportQuizId);

  const clearExportNotice = () => {
    setExportError(null);
    setSkippedPendingCount(null);
  };

  const downloadExport = async () => {
    if (exportFormat === 'print') {
      setExportError(null);
      setSkippedPendingCount(null);
      if (!filteredResults.length) {
        setExportError('There are no results matching the current filters to print.');
        return;
      }
      openPrintPage(filteredResults.map((row) => row.id));
      return;
    }

    if (!selectedExportQuiz) {
      setExportError('Select one quiz before exporting results.');
      return;
    }

    setExportLoading(true);
    setExportError(null);
    setSkippedPendingCount(null);
    try {
      const file = await exportTeacherResults({
        quiz_id: Number(exportQuizId),
        format: exportFormat,
        class_id: exportClassId ? Number(exportClassId) : undefined,
        academic_year_id: exportYearId ? Number(exportYearId) : undefined,
        term_id: exportTermId ? Number(exportTermId) : undefined,
        attempt: exportAttempt,
        include_pending: exportIncludePending,
        include_percentage: exportIncludePercentage,
      });
      const objectUrl = URL.createObjectURL(file.blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = file.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      setSkippedPendingCount(file.skippedPendingCount);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Unable to export quiz results.');
    } finally {
      setExportLoading(false);
    }
  };

  const exportTerms = (exportOptions?.terms || []).filter(
    (item) => !exportYearId || String(item.academic_year_id) === exportYearId
  );

  const columns: Column<QuizResultItem>[] = [
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
      id: 'attempt_number',
      header: 'Attempt',
      sortable: true,
      align: 'center',
      accessor: (row) => row.attempt_number,
    },
    {
      id: 'status',
      header: 'Outcome',
      sortable: true,
      align: 'center',
      accessor: (row) => (
        <span className={`core-badge ${
          row.has_pending_essay
            ? 'core-surface--warning-subtle core-text--warning-emphasis core-border'
            : row.is_passed
              ? 'core-surface--success'
              : 'core-surface--danger'
        }`}>
          {row.has_pending_essay ? 'Pending grading' : row.is_passed ? 'Passed' : 'Failed'}
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
            row.is_graded && !row.has_pending_essay
              ? 'core-surface--light core-text--dark core-border'
              : 'core-surface--warning-subtle core-text--warning-emphasis core-border'
          }`}
        >
          {row.is_graded && !row.has_pending_essay ? 'Completed' : 'Needs Review'}
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
      header: 'Action',
      width: '100px',
      align: 'center',
      accessor: (row) => (
        <Button
          variant="outline-primary"
          size="sm"
          aria-label={`Print result for ${row.student_name}`}
          onClick={() => openPrintPage([row.id])}
        >
          Print
        </Button>
      ),
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
        </div>
      </div>

      <div className="core-grid core-grid--gap-3 core-space--margin-bottom-3 results-summary">
        <div className="core-grid__span-12 core-grid__span-sm-4">
          <div className="core-card core-shadow--sm core-border--none core-border--start core-border--primary core-border--width-4 results-summary__card">
            <div className="core-card__body">
              <div className="core-text--muted core-type--small core-text--uppercase core-type--weight-bold">Visible attempts</div>
              <div className="core-type--heading-4 core-type--weight-bold core-text--dark results-summary__value">{results.length}</div>
            </div>
          </div>
        </div>
        <div className="core-grid__span-12 core-grid__span-sm-4">
          <div className="core-card core-shadow--sm core-border--none core-border--start core-border--success core-border--width-4 results-summary__card">
            <div className="core-card__body">
              <div className="core-text--muted core-type--small core-text--uppercase core-type--weight-bold">Passed attempts</div>
              <div className="core-type--heading-4 core-type--weight-bold core-text--dark results-summary__value">{passedCount}</div>
            </div>
          </div>
        </div>
        <div className="core-grid__span-12 core-grid__span-sm-4">
          <div className="core-card core-shadow--sm core-border--none core-border--start core-border--info core-border--width-4 results-summary__card">
            <div className="core-card__body">
              <div className="core-text--muted core-type--small core-text--uppercase core-type--weight-bold">Pass rate</div>
              <div className="core-type--heading-4 core-type--weight-bold core-text--dark results-summary__value">{passRate}%</div>
            </div>
          </div>
        </div>
      </div>

      <details open className="core-card core-shadow--sm core-border--none core-space--margin-bottom-4 results-export">
        <summary className="results-export__toggle">
          <span className="results-export__toggle-content">
            <strong>Filters and export</strong>
            <span>Selections update the table, downloads, and printed results.</span>
          </span>
        </summary>
        <div className="core-card__body results-export__body">
          {exportOptionsError && (
            <Alert variant="danger">{exportOptionsError}</Alert>
          )}
          {exportOptionsLoading ? (
            <p role="status" className="core-text--muted">Loading export options...</p>
          ) : (
            <>
              {exportQuizzes.length === 0 && (
                <Alert variant="warning">No quizzes are available to export.</Alert>
              )}
              <div className="core-grid core-grid--gap-3">
                <label className="core-grid__span-12 core-grid__span-md-4 results-export__field">
                  <span className="core-field__label">Quiz (required for CSV/Excel)</span>
                  <select
                    className="core-field__select"
                    aria-label="Export quiz"
                    value={exportQuizId}
                    onChange={(event) => {
                      setExportQuizId(event.target.value);
                      clearExportNotice();
                    }}
                  >
                    <option value="">Select one quiz</option>
                    {exportQuizzes.map((quiz) => (
                      <option key={quiz.id} value={quiz.id}>{quiz.title}</option>
                    ))}
                  </select>
                </label>
                <label className="core-grid__span-12 core-grid__span-md-4 results-export__field">
                  <span className="core-field__label">Class</span>
                  <select
                    className="core-field__select"
                    aria-label="Export class"
                    value={exportClassId}
                    onChange={(event) => {
                      setExportClassId(event.target.value);
                      clearExportNotice();
                    }}
                  >
                    <option value="">All accessible classes</option>
                    {(exportOptions?.classes || []).map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </label>
                <label className="core-grid__span-12 core-grid__span-md-4 results-export__field">
                  <span className="core-field__label">Academic year</span>
                  <select
                    className="core-field__select"
                    aria-label="Export academic year"
                    value={exportYearId}
                    onChange={(event) => {
                      setExportYearId(event.target.value);
                      setExportTermId('');
                      clearExportNotice();
                    }}
                  >
                    <option value="">All academic years</option>
                    {(exportOptions?.academic_years || []).map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </label>
                <label className="core-grid__span-12 core-grid__span-md-4 results-export__field">
                  <span className="core-field__label">Term</span>
                  <select
                    className="core-field__select"
                    aria-label="Export term"
                    value={exportTermId}
                    onChange={(event) => {
                      setExportTermId(event.target.value);
                      clearExportNotice();
                    }}
                  >
                    <option value="">All terms</option>
                    {exportTerms.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </label>
                <label className="core-grid__span-12 core-grid__span-md-4 results-export__field">
                  <span className="core-field__label">Attempt rule</span>
                  <select
                    className="core-field__select"
                    aria-label="Export attempt rule"
                    value={exportAttempt}
                    onChange={(event) => {
                      setExportAttempt(event.target.value as 'best' | 'latest' | 'all');
                      clearExportNotice();
                    }}
                  >
                    <option value="best">Best</option>
                    <option value="latest">Latest</option>
                    <option value="all">All attempts</option>
                  </select>
                </label>
                <label className="core-grid__span-12 core-grid__span-md-4 results-export__field">
                  <span className="core-field__label">Format</span>
                  <select
                    className="core-field__select"
                    aria-label="Export format"
                    value={exportFormat}
                    onChange={(event) => {
                      setExportFormat(event.target.value as 'csv' | 'xlsx' | 'print');
                      clearExportNotice();
                    }}
                  >
                    <option value="xlsx">Excel (.xlsx)</option>
                    <option value="csv">CSV (.csv)</option>
                    <option value="print">Print filtered results</option>
                  </select>
                </label>
              </div>
              <div className="results-export__toggles">
                <label className="core-field__check results-export__check">
                  <input
                    type="checkbox"
                    className="core-field__check-input"
                    checked={exportIncludePending}
                    onChange={(event) => {
                      setExportIncludePending(event.target.checked);
                      clearExportNotice();
                    }}
                  />
                  Include pending grading
                </label>
                <label className="core-field__check results-export__check">
                  <input
                    type="checkbox"
                    className="core-field__check-input"
                    checked={exportIncludePercentage}
                    onChange={(event) => {
                      setExportIncludePercentage(event.target.checked);
                      clearExportNotice();
                    }}
                  />
                  Include percentage column
                </label>
              </div>
              {exportError && <Alert variant="danger">{exportError}</Alert>}
              {skippedPendingCount !== null && skippedPendingCount > 0 && !exportIncludePending && (
                <Alert variant="warning">
                  {skippedPendingCount} attempt{skippedPendingCount === 1 ? '' : 's'} with ungraded essays were skipped.
                </Alert>
              )}
              <Button
                className="core-space--margin-top-3"
                size="sm"
                onClick={downloadExport}
                loading={exportLoading}
                disabled={
                  exportOptionsLoading ||
                  (exportFormat === 'print' ? filteredResults.length === 0 : !selectedExportQuiz)
                }
              >
                {exportFormat === 'print' ? 'Print filtered results' : `Download ${exportFormat.toUpperCase()}`}
              </Button>
            </>
          )}
        </div>
      </details>

      {error && (
        <Alert variant="danger" dismissible onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

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
