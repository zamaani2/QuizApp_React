import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { assignQuizClasses, fetchQuizAssignments, unassignQuizClass } from '../../api/teacher';
import type { QuizAssignmentsData } from '../../types';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';

export const QuizAssignments: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const quizId = Number(id);
  const [data, setData] = useState<QuizAssignmentsData | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [unassignClassId, setUnassignClassId] = useState<number | null>(null);
  const [unassignLoading, setUnassignLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchQuizAssignments(quizId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load quiz assignments.');
    } finally {
      setLoading(false);
    }
  }, [quizId]);

  useEffect(() => { void load(); }, [load]);

  async function addSelected() {
    if (!selected.length) return;
    setSaving(true);
    setError(null);
    try {
      const result = await assignQuizClasses(quizId, selected);
      setMessage(result.message);
      setSelected([]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to assign selected classes.');
    } finally {
      setSaving(false);
    }
  }

  async function removeClass(classId: number) {
    setUnassignLoading(true);
    setError(null);
    try {
      const result = await unassignQuizClass(quizId, classId);
      setMessage(result.message);
      setUnassignClassId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to unassign class.');
    } finally {
      setUnassignLoading(false);
    }
  }

  if (loading && !data) return <LoadingSpinner size="lg" message="Loading class assignments..." />;
  return (
    <div className="assessment-page container-fluid py-4">
      <div className="mb-3"><Link to={`/teacher/quizzes/${quizId}`}>&larr; Back to quiz</Link></div>
      <h1 className="h3 mb-4">Class Assignments {data && <small className="text-muted">· {data.quiz_title}</small>}</h1>
      {error && <Alert variant="danger" dismissible onDismiss={() => setError(null)}>{error}</Alert>}
      {message && <Alert variant="success" dismissible onDismiss={() => setMessage(null)}>{message}</Alert>}
      {data && (
        <div className="row g-4">
          <div className="col-lg-6">
            <section className="card shadow-sm border-0 h-100">
              <div className="card-header bg-white"><h2 className="h5 mb-0">Assigned classes ({data.assigned_classes.length})</h2></div>
              <div className="list-group list-group-flush">
                {data.assigned_classes.length ? data.assigned_classes.map((item) => (
                  <div className="list-group-item d-flex justify-content-between align-items-center" key={item.id}>
                    <span>{item.name}</span>
                    <Button variant="outline-danger" size="sm" disabled={saving || unassignLoading} onClick={() => setUnassignClassId(item.id)}>Unassign</Button>
                  </div>
                )) : <div className="list-group-item text-muted">No classes are assigned.</div>}
              </div>
            </section>
          </div>
          <div className="col-lg-6">
            <section className="card shadow-sm border-0 h-100">
              <div className="card-header bg-white"><h2 className="h5 mb-0">Available classes</h2></div>
              <div className="card-body">
                {data.available_classes.length ? (
                  <>
                    <div className="d-flex flex-column gap-2 mb-3">
                      {data.available_classes.map((item) => (
                        <label key={item.id} className="form-check">
                          <input
                            type="checkbox"
                            className="form-check-input"
                            checked={selected.includes(item.id)}
                            onChange={(e) => setSelected(e.target.checked ? [...selected, item.id] : selected.filter((x) => x !== item.id))}
                          />
                          <span className="form-check-label">{item.name}</span>
                        </label>
                      ))}
                    </div>
                    <Button variant="primary" size="sm" disabled={saving || !selected.length} loading={saving} onClick={() => void addSelected()}>
                      Assign selected classes
                    </Button>
                  </>
                ) : <p className="text-muted mb-0">All available classes are already assigned.</p>}
              </div>
            </section>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={unassignClassId !== null}
        onClose={() => setUnassignClassId(null)}
        onConfirm={() => {
          if (unassignClassId !== null) void removeClass(unassignClassId);
        }}
        title="Unassign Class"
        message="Are you sure you want to unassign this class from the quiz?"
        confirmLabel="Unassign Class"
        confirmVariant="danger"
        loading={unassignLoading}
      />
    </div>
  );
};
