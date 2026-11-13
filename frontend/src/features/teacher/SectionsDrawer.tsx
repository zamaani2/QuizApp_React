import React, { useEffect, useState } from 'react';
import {
  assignQuizQuestions,
  createQuizQuestionGroup,
  createQuizSection,
  deleteQuizQuestionGroup,
  deleteQuizSection,
  reorderQuizQuestionGroups,
  reorderQuizSections,
  updateQuizQuestionGroup,
  updateQuizSection,
} from '../../api/teacher';
import type { QuizDetailData, QuizSectionData } from '../../types';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import './SectionBuilder.css';

interface SectionsDrawerProps {
  quiz: QuizDetailData;
  selectedQuestionIds: number[];
  onUpdated: () => Promise<void>;
  onClose: () => void;
}

function positiveNumberOrNull(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? '').trim();
  return text ? Number(text) : null;
}

export const SectionsDrawer: React.FC<SectionsDrawerProps> = ({
  quiz,
  selectedQuestionIds,
  onUpdated,
  onClose,
}) => {
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [targetSectionId, setTargetSectionId] = useState('choose');
  const [targetGroupId, setTargetGroupId] = useState('');
  const [formRevision, setFormRevision] = useState(0);
  const sections = quiz.sections ?? [];
  const destinationSection = sections.find((section) => String(section.id) === targetSectionId);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !working) onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, working]);

  useEffect(() => {
    if (
      targetSectionId
      && targetSectionId !== 'choose'
      && !sections.some((section) => String(section.id) === targetSectionId)
    ) {
      setTargetSectionId('choose');
      setTargetGroupId('');
    }
  }, [sections, targetSectionId]);

  async function run(action: () => Promise<unknown>, successMessage: string): Promise<boolean> {
    setWorking(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      await onUpdated();
      setFormRevision((revision) => revision + 1);
      setMessage(successMessage);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update quiz sections.');
      return false;
    } finally {
      setWorking(false);
    }
  }

  async function addSection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    if (await run(() => createQuizSection(quiz.id, {
      title: String(formData.get('title') || ''),
      instructions: String(formData.get('instructions') || ''),
      time_limit_minutes: positiveNumberOrNull(formData.get('time_limit_minutes')),
    }), 'Section added.')) form.reset();
  }

  async function saveSection(event: React.FormEvent<HTMLFormElement>, section: QuizSectionData) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await run(() => updateQuizSection(quiz.id, section.id, {
      title: String(formData.get('title') || ''),
      instructions: String(formData.get('instructions') || ''),
      time_limit_minutes: positiveNumberOrNull(formData.get('time_limit_minutes')),
      choose_n: positiveNumberOrNull(formData.get('choose_n')),
    }), 'Section settings saved.');
  }

  async function addStimulus(event: React.FormEvent<HTMLFormElement>, sectionId: number) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    if (await run(() => createQuizQuestionGroup(quiz.id, {
      section_id: sectionId,
      title: String(formData.get('title') || ''),
      stimulus_text: String(formData.get('stimulus_text') || ''),
    }), 'Shared passage added.')) form.reset();
  }

  async function saveStimulus(event: React.FormEvent<HTMLFormElement>, groupId: number, sectionId: number) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await run(() => updateQuizQuestionGroup(quiz.id, groupId, {
      section_id: sectionId,
      title: String(formData.get('title') || ''),
      stimulus_text: String(formData.get('stimulus_text') || ''),
    }), 'Shared passage saved.');
  }

  async function assignSelectedQuestions() {
    if (!selectedQuestionIds.length || targetSectionId === 'choose') return;
    await run(() => assignQuizQuestions(quiz.id, {
      question_ids: selectedQuestionIds,
      section_id: targetSectionId ? Number(targetSectionId) : null,
      group_id: targetGroupId ? Number(targetGroupId) : null,
    }), targetSectionId ? 'Questions assigned to the selected section.' : 'Questions moved out of their sections.');
  }

  async function moveSection(index: number, delta: number) {
    const reordered = [...sections];
    const target = index + delta;
    if (target < 0 || target >= reordered.length) return;
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    await run(() => reorderQuizSections(quiz.id, reordered.map((section) => section.id)), 'Section order saved.');
  }

  async function moveGroup(section: QuizSectionData, index: number, delta: number) {
    const reordered = [...section.groups];
    const target = index + delta;
    if (target < 0 || target >= reordered.length) return;
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    await run(
      () => reorderQuizQuestionGroups(quiz.id, section.id, reordered.map((group) => group.id)),
      'Passage order saved.'
    );
  }

  return (
    <div
      className="quiz-section-drawer-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !working) onClose();
      }}
    >
      <section
        id="quiz-section-drawer"
        className="quiz-section-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quiz-section-drawer-title"
      >
        <header className="quiz-section-drawer__header">
          <div>
            <p>Question organization</p>
            <h2 id="quiz-section-drawer-title">Sections</h2>
          </div>
          <button
            type="button"
            className="quiz-section-drawer__close"
            aria-label="Close sections"
            onClick={onClose}
            disabled={working}
          >
            ×
          </button>
        </header>

        <div className="quiz-section-drawer__body">
          {error && <Alert variant="danger" dismissible onDismiss={() => setError(null)}>{error}</Alert>}
          {message && <Alert variant="success" dismissible onDismiss={() => setMessage(null)}>{message}</Alert>}

          <section className="quiz-section-drawer__assignment" aria-labelledby="section-assignment-title">
            <div className="quiz-section-drawer__block-heading">
              <h3 id="section-assignment-title">Assign questions</h3>
              <span>{selectedQuestionIds.length} selected</span>
            </div>
            <p>
              Select questions in the list, then choose where they belong.
            </p>
            <label htmlFor="section-assignment-target">Destination section</label>
            <select
              id="section-assignment-target"
              className="core-field__select"
              value={targetSectionId}
              disabled={working}
              onChange={(event) => {
                setTargetSectionId(event.currentTarget.value);
                setTargetGroupId('');
              }}
            >
              <option value="choose">Choose a section...</option>
              <option value="">No section</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>{section.title}</option>
              ))}
            </select>
            {destinationSection?.groups.length ? (
              <>
                <label htmlFor="section-assignment-group">Shared passage (optional)</label>
                <select
                  id="section-assignment-group"
                  className="core-field__select"
                  value={targetGroupId}
                  disabled={working}
                  onChange={(event) => setTargetGroupId(event.currentTarget.value)}
                >
                  <option value="">No shared passage</option>
                  {destinationSection.groups.map((group) => (
                    <option key={group.id} value={group.id}>{group.title}</option>
                  ))}
                </select>
              </>
            ) : null}
            <Button
              size="sm"
              variant="primary"
              disabled={working || selectedQuestionIds.length === 0 || targetSectionId === 'choose'}
              onClick={() => void assignSelectedQuestions()}
              loading={working}
            >
              Assign selected questions
            </Button>
          </section>

          <details className="quiz-section-drawer__add">
            <summary>Add a section</summary>
            <form className="core-grid core-grid--gap-2" onSubmit={(event) => void addSection(event)}>
              <label className="core-grid__span-12">
                <span className="core-field__label">Section title</span>
                <input className="core-field__input" name="title" required maxLength={200} disabled={working} />
              </label>
              <label className="core-grid__span-12">
                <span className="core-field__label">Instructions (optional)</span>
                <textarea className="core-field__input" name="instructions" rows={2} disabled={working} />
              </label>
              <label className="core-grid__span-12">
                <span className="core-field__label">Time limit in minutes (optional)</span>
                <input className="core-field__input" name="time_limit_minutes" type="number" min="1" disabled={working} />
              </label>
              <div className="core-grid__span-12">
                <Button type="submit" size="sm" disabled={working}>Add section</Button>
              </div>
            </form>
          </details>

          <div className="quiz-section-drawer__section-list" aria-label="Section settings">
            <h3>Sections{sections.length ? ` (${sections.length})` : ''}</h3>
            {sections.length === 0 ? (
              <p className="core-text--muted">Add a section to organize questions for this quiz.</p>
            ) : sections.map((section, index) => (
              <article className="quiz-section-drawer__section" key={`${section.id}-${formRevision}`}>
                <div className="quiz-section-drawer__section-row">
                  <details>
                    <summary className="quiz-section-drawer__section-summary">
                      <strong>{section.title}</strong>
                      <span>
                        {section.question_ids.length} question{section.question_ids.length === 1 ? '' : 's'}
                        {section.time_limit_minutes ? ` · ${section.time_limit_minutes} min` : ''}
                        {section.choose_n ? ` · Choose ${section.choose_n}` : ''}
                      </span>
                    </summary>
                    <form
                      className="core-grid core-grid--gap-2 quiz-section-drawer__section-form"
                      onSubmit={(event) => void saveSection(event, section)}
                    >
                      <label className="core-grid__span-12">
                        <span className="core-field__label">Title</span>
                        <input className="core-field__input" name="title" required defaultValue={section.title} disabled={working} />
                      </label>
                      <label className="core-grid__span-12">
                        <span className="core-field__label">Instructions</span>
                        <textarea className="core-field__input" name="instructions" rows={2} defaultValue={section.instructions} disabled={working} />
                      </label>
                      <label className="core-grid__span-6">
                        <span className="core-field__label">Time limit (minutes)</span>
                        <input className="core-field__input" name="time_limit_minutes" type="number" min="1" defaultValue={section.time_limit_minutes ?? ''} disabled={working} />
                      </label>
                      <label className="core-grid__span-6">
                        <span className="core-field__label">Choose N</span>
                        <input className="core-field__input" name="choose_n" type="number" min="1" defaultValue={section.choose_n ?? ''} disabled={working} />
                      </label>
                      <div className="core-grid__span-12">
                        <Button size="sm" type="submit" variant="secondary" disabled={working}>Save section</Button>
                      </div>
                    </form>

                    <details className="quiz-section-drawer__stimuli">
                      <summary>Shared passages ({section.groups.length})</summary>
                      {section.groups.map((group, groupIndex) => (
                        <details className="quiz-section-drawer__stimulus" key={group.id}>
                          <summary>{group.title}</summary>
                          <form
                            className="core-grid core-grid--gap-2"
                            onSubmit={(event) => void saveStimulus(event, group.id, section.id)}
                          >
                            <label className="core-grid__span-12">
                              <span className="core-field__label">Passage title</span>
                              <input className="core-field__input" name="title" required defaultValue={group.title} disabled={working} />
                            </label>
                            <label className="core-grid__span-12">
                              <span className="core-field__label">Passage text</span>
                              <textarea className="core-field__input" name="stimulus_text" rows={4} defaultValue={group.stimulus_text} disabled={working} />
                            </label>
                            <div className="quiz-section-drawer__form-actions">
                              <Button type="button" size="sm" variant="outline-secondary" disabled={working || groupIndex === 0} onClick={() => void moveGroup(section, groupIndex, -1)} aria-label={`Move ${group.title} up`}>Move up</Button>
                              <Button type="button" size="sm" variant="outline-secondary" disabled={working || groupIndex === section.groups.length - 1} onClick={() => void moveGroup(section, groupIndex, 1)} aria-label={`Move ${group.title} down`}>Move down</Button>
                              <Button size="sm" type="submit" variant="secondary" disabled={working}>Save passage</Button>
                              <Button size="sm" type="button" variant="outline-danger" disabled={working} onClick={() => void run(() => deleteQuizQuestionGroup(quiz.id, group.id), 'Shared passage deleted.')}>Delete</Button>
                            </div>
                          </form>
                        </details>
                      ))}
                      <details className="quiz-section-drawer__add-stimulus">
                        <summary>Add a shared passage</summary>
                        <form className="core-grid core-grid--gap-2" onSubmit={(event) => void addStimulus(event, section.id)}>
                          <label className="core-grid__span-12">
                            <span className="core-field__label">Passage title</span>
                            <input className="core-field__input" name="title" required defaultValue="Shared passage" disabled={working} />
                          </label>
                          <label className="core-grid__span-12">
                            <span className="core-field__label">Passage text</span>
                            <textarea className="core-field__input" name="stimulus_text" rows={4} required disabled={working} />
                          </label>
                          <div className="core-grid__span-12">
                            <Button size="sm" type="submit" disabled={working}>Add passage</Button>
                          </div>
                        </form>
                      </details>
                    </details>
                  </details>
                  <div className="quiz-section-drawer__section-actions">
                    <Button size="sm" variant="outline-secondary" disabled={working || index === 0} onClick={() => void moveSection(index, -1)} aria-label={`Move ${section.title} up`}>↑</Button>
                    <Button size="sm" variant="outline-secondary" disabled={working || index === sections.length - 1} onClick={() => void moveSection(index, 1)} aria-label={`Move ${section.title} down`}>↓</Button>
                    <Button
                      size="sm"
                      variant="outline-danger"
                      disabled={working}
                      onClick={() => {
                        if (window.confirm(`Delete section "${section.title}"? Its questions will become unassigned.`)) {
                          void run(() => deleteQuizSection(quiz.id, section.id), 'Section deleted.');
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        <footer className="quiz-section-drawer__footer">
          <span>{selectedQuestionIds.length ? `${selectedQuestionIds.length} question${selectedQuestionIds.length === 1 ? '' : 's'} selected on the page` : 'Select questions on the page to assign them.'}</span>
          <Button variant="primary" onClick={onClose} disabled={working}>Done</Button>
        </footer>
      </section>
    </div>
  );
};
