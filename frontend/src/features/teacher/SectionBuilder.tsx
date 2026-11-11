import React, { useState } from 'react';
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

interface SectionBuilderProps {
  quiz: QuizDetailData;
  onUpdated: () => Promise<void>;
}

function positiveNumberOrNull(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? '').trim();
  return text ? Number(text) : null;
}

export const SectionBuilder: React.FC<SectionBuilderProps> = ({ quiz, onUpdated }) => {
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [questionDrafts, setQuestionDrafts] = useState<Record<number, number[]>>({});

  async function run(action: () => Promise<unknown>): Promise<boolean> {
    setWorking(true);
    setError(null);
    try {
      await action();
      await onUpdated();
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
    }))) form.reset();
  }

  async function saveSection(event: React.FormEvent<HTMLFormElement>, section: QuizSectionData) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await run(() => updateQuizSection(quiz.id, section.id, {
      title: String(formData.get('title') || ''),
      instructions: String(formData.get('instructions') || ''),
      time_limit_minutes: positiveNumberOrNull(formData.get('time_limit_minutes')),
      choose_n: positiveNumberOrNull(formData.get('choose_n')),
    }));
  }

  async function addStimulus(event: React.FormEvent<HTMLFormElement>, sectionId: number) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    if (await run(() => createQuizQuestionGroup(quiz.id, {
      section_id: sectionId,
      title: String(formData.get('title') || ''),
      stimulus_text: String(formData.get('stimulus_text') || ''),
    }))) form.reset();
  }

  async function saveStimulus(event: React.FormEvent<HTMLFormElement>, groupId: number, sectionId: number) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await run(() => updateQuizQuestionGroup(quiz.id, groupId, {
      section_id: sectionId,
      title: String(formData.get('title') || ''),
      stimulus_text: String(formData.get('stimulus_text') || ''),
    }));
  }

  async function moveSection(index: number, delta: number) {
    const sections = [...(quiz.sections ?? [])];
    const target = index + delta;
    if (target < 0 || target >= sections.length) return;
    [sections[index], sections[target]] = [sections[target], sections[index]];
    await run(() => reorderQuizSections(quiz.id, sections.map((section) => section.id)));
  }

  async function moveGroup(section: QuizSectionData, index: number, delta: number) {
    const groups = [...section.groups];
    const target = index + delta;
    if (target < 0 || target >= groups.length) return;
    [groups[index], groups[target]] = [groups[target], groups[index]];
    await run(() => reorderQuizQuestionGroups(quiz.id, section.id, groups.map((group) => group.id)));
  }

  async function assignSectionQuestions(section: QuizSectionData, event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const groupId = String(formData.get('group_id') || '');
    await run(() => assignQuizQuestions(quiz.id, {
      question_ids: questionDrafts[section.id] ?? section.question_ids,
      section_id: section.id,
      group_id: groupId ? Number(groupId) : null,
      replace: true,
    }));
  }

  const sections = quiz.sections ?? [];

  return (
    <section className="core-card core-shadow--sm core-border--none core-space--margin-bottom-4" aria-label="Exam section builder">
      <div className="core-card__header">
        <h3 className="core-type--heading-5 core-space--margin-bottom-0">Exam sections</h3>
      </div>
      <div className="core-card__body">
        <p className="core-text--muted">
          Organize questions, instructions, timed sections, Choose-N rules, and shared stimulus text.
        </p>
        {error && <Alert variant="danger" dismissible onDismiss={() => setError(null)}>{error}</Alert>}
        <form className="core-grid core-grid--gap-2 core-space--padding-3 core-surface--light core-space--margin-bottom-3" onSubmit={addSection}>
          <label className="core-grid__span-md-4">
            <span className="core-field__label">Section title</span>
            <input className="core-field__input" name="title" required maxLength={200} />
          </label>
          <label className="core-grid__span-md-4">
            <span className="core-field__label">Instructions</span>
            <input className="core-field__input" name="instructions" />
          </label>
          <label className="core-grid__span-md-2">
            <span className="core-field__label">Time limit (minutes)</span>
            <input className="core-field__input" name="time_limit_minutes" type="number" min="1" />
          </label>
          <div className="core-grid__span-12">
            <Button type="submit" size="sm" disabled={working}>Add section</Button>
          </div>
        </form>

        {sections.length === 0 && (
          <p className="core-text--muted core-space--margin-bottom-0">This quiz currently uses its original single-section behavior.</p>
        )}
        <div className="core-display-flex core-layout--column core-layout--gap-3">
          {sections.map((section, index) => (
            <article key={section.id} className="core-border core-radius core-space--padding-3">
              <div className="core-display-flex core-layout--justify-between core-layout--align-center core-space--margin-bottom-2">
                <h4 className="core-type--heading-6 core-space--margin-bottom-0">
                  {index + 1}. {section.title}
                </h4>
                <div className="core-display-flex core-layout--gap-1">
                  <Button size="sm" variant="outline-secondary" disabled={working || index === 0} onClick={() => void moveSection(index, -1)} aria-label={`Move ${section.title} up`}>↑</Button>
                  <Button size="sm" variant="outline-secondary" disabled={working || index === sections.length - 1} onClick={() => void moveSection(index, 1)} aria-label={`Move ${section.title} down`}>↓</Button>
                  <Button size="sm" variant="outline-danger" disabled={working} onClick={() => {
                    if (window.confirm(`Delete section "${section.title}"? Its questions will become unsectioned.`)) {
                      void run(() => deleteQuizSection(quiz.id, section.id));
                    }
                  }}>Delete</Button>
                </div>
              </div>
              <form className="core-grid core-grid--gap-2 core-space--margin-bottom-3" onSubmit={(event) => void saveSection(event, section)}>
                <label className="core-grid__span-md-4">
                  <span className="core-field__label">Title</span>
                  <input className="core-field__input" name="title" required defaultValue={section.title} />
                </label>
                <label className="core-grid__span-md-4">
                  <span className="core-field__label">Instructions</span>
                  <input className="core-field__input" name="instructions" defaultValue={section.instructions} />
                </label>
                <label className="core-grid__span-md-2">
                  <span className="core-field__label">Time limit (minutes)</span>
                  <input className="core-field__input" name="time_limit_minutes" type="number" min="1" defaultValue={section.time_limit_minutes ?? ''} />
                </label>
                <label className="core-grid__span-md-2">
                  <span className="core-field__label">Choose N</span>
                  <input className="core-field__input" name="choose_n" type="number" min="1" defaultValue={section.choose_n ?? ''} />
                </label>
                <div className="core-grid__span-12">
                  <Button size="sm" type="submit" variant="secondary" disabled={working}>Save section</Button>
                </div>
              </form>

              <form className="core-grid core-grid--gap-2 core-space--margin-bottom-3" onSubmit={(event) => void assignSectionQuestions(section, event)}>
                <label className="core-grid__span-md-7">
                  <span className="core-field__label">Questions in this section</span>
                  <select
                    className="core-field__select"
                    multiple
                    size={Math.min(6, Math.max(3, quiz.questions.length))}
                    value={(questionDrafts[section.id] ?? section.question_ids).map(String)}
                    onChange={(event) => {
                      const selectedQuestionIds = Array.from(
                        event.currentTarget.selectedOptions,
                        (option) => Number(option.value)
                      );
                      setQuestionDrafts((drafts) => ({
                        ...drafts,
                        [section.id]: selectedQuestionIds,
                      }));
                    }}
                  >
                    {quiz.questions.map((question) => (
                      <option key={question.id} value={question.id}>
                        Q{question.order}: {question.question_text}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="core-grid__span-md-3">
                  <span className="core-field__label">Shared stimulus group</span>
                  <select className="core-field__select" name="group_id" defaultValue="">
                    <option value="">No shared stimulus</option>
                    {section.groups.map((group) => <option key={group.id} value={group.id}>{group.title}</option>)}
                  </select>
                </label>
                <div className="core-grid__span-md-2 core-display-flex core-layout--align-end">
                  <Button size="sm" type="submit" disabled={working}>Assign</Button>
                </div>
              </form>

              {section.groups.map((group, groupIndex) => (
                <form key={group.id} className="core-grid core-grid--gap-2 core-border-top core-space--padding-top-2 core-space--margin-top-2" onSubmit={(event) => void saveStimulus(event, group.id, section.id)}>
                  <label className="core-grid__span-md-3">
                    <span className="core-field__label">Stimulus title</span>
                    <input className="core-field__input" name="title" required defaultValue={group.title} />
                  </label>
                  <label className="core-grid__span-md-7">
                    <span className="core-field__label">Pinned stimulus text</span>
                    <textarea className="core-field__input" name="stimulus_text" rows={2} defaultValue={group.stimulus_text} />
                  </label>
                  <div className="core-grid__span-md-2 core-display-flex core-layout--align-end core-layout--gap-1">
                    <Button size="sm" type="button" variant="outline-secondary" disabled={working || groupIndex === 0} onClick={() => void moveGroup(section, groupIndex, -1)} aria-label={`Move ${group.title} up`}>↑</Button>
                    <Button size="sm" type="button" variant="outline-secondary" disabled={working || groupIndex === section.groups.length - 1} onClick={() => void moveGroup(section, groupIndex, 1)} aria-label={`Move ${group.title} down`}>↓</Button>
                    <Button size="sm" type="submit" variant="secondary" disabled={working}>Save stimulus</Button>
                    <Button size="sm" type="button" variant="outline-danger" disabled={working} onClick={() => void run(() => deleteQuizQuestionGroup(quiz.id, group.id))}>Delete</Button>
                  </div>
                </form>
              ))}
              <form className="core-grid core-grid--gap-2 core-border-top core-space--padding-top-2 core-space--margin-top-2" onSubmit={(event) => void addStimulus(event, section.id)}>
                <label className="core-grid__span-md-3">
                  <span className="core-field__label">New stimulus title</span>
                  <input className="core-field__input" name="title" required defaultValue="Shared passage" />
                </label>
                <label className="core-grid__span-md-7">
                  <span className="core-field__label">Stimulus text</span>
                  <textarea className="core-field__input" name="stimulus_text" rows={2} required />
                </label>
                <div className="core-grid__span-md-2 core-display-flex core-layout--align-end">
                  <Button size="sm" type="submit" disabled={working}>Add stimulus</Button>
                </div>
              </form>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
