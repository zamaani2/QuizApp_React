import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QuizAssignments } from './QuizAssignments';

const quizList = {
  count: 2,
  results: [
    {
      id: 10,
      title: 'Potion Safety',
      subject_name: 'Potions',
      academic_year: '2026/2027',
      term: 'Term 1',
      status: 'published',
      duration_minutes: 30,
      total_questions: 5,
      total_marks: 10,
      total_attempts: 2,
      avg_score: 80,
      created_at: null,
      classes: [{ id: 1, name: 'North Form' }],
      available_from: '2026-11-12T08:00:00Z',
      available_until: '2026-11-14T17:00:00Z',
    },
    {
      id: 11,
      title: 'Draft Review',
      subject_name: 'Potions',
      academic_year: '2026/2027',
      term: 'Term 1',
      status: 'draft',
      duration_minutes: 20,
      total_questions: 3,
      total_marks: 5,
      total_attempts: 0,
      avg_score: 0,
      created_at: null,
      classes: [],
    },
  ],
};

const assignmentData = {
  quiz_id: 10,
  quiz_title: 'Potion Safety',
  assigned_classes: [{ id: 1, name: 'North Form' }],
  available_classes: [
    { id: 1, name: 'North Form' },
    { id: 2, name: 'South Form' },
  ],
};

function installFetchMock() {
  const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/v1/teacher/quizzes/') {
      return Promise.resolve({ ok: true, status: 200, json: async () => quizList });
    }
    if (url.endsWith('/assignments/set/')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ success: true, added_count: 1, removed_count: 0, message: 'Class assignments updated successfully.' }),
      });
    }
    if (url.includes('/assignments/')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => assignmentData });
    }
    throw new Error(`Unexpected request: ${url} ${init?.method ?? ''}`);
  });
  global.fetch = fetchMock as typeof fetch;
  return fetchMock;
}

describe('QuizAssignments', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('searches and filters quizzes, then opens the drawer with assigned classes checked', async () => {
    installFetchMock();
    render(
      <MemoryRouter initialEntries={['/teacher/assignments']}>
        <QuizAssignments />
      </MemoryRouter>
    );

    expect(await screen.findAllByText('Potion Safety')).not.toHaveLength(0);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search quizzes' }), {
      target: { value: 'Draft' },
    });
    expect(screen.getAllByText('Draft Review')).not.toHaveLength(0);
    expect(screen.queryAllByText('Potion Safety')).toHaveLength(0);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search quizzes' }), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Draft$/ }));
    expect(screen.getAllByText('Draft Review')).not.toHaveLength(0);
    expect(screen.queryAllByText('Potion Safety')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: /^All$/ }));
    fireEvent.click(screen.getAllByRole('button', { name: /^Assign$/ })[0]);
    const drawer = await screen.findByRole('dialog', { name: 'Potion Safety' });
    expect(await screen.findByLabelText('North Form')).toBeChecked();
    expect(screen.getByText('Assigned')).toBeInTheDocument();
    expect(screen.getByText(/Visible to 1 class from/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('South Form'));
    expect(within(drawer).getByText('Assign to 1 class, remove from 0')).toBeInTheDocument();
  });

  it('saves the complete class selection in one request', async () => {
    const fetchMock = installFetchMock();
    render(
      <MemoryRouter initialEntries={['/teacher/assignments?quiz=10']}>
        <QuizAssignments />
      </MemoryRouter>
    );

    const drawer = await screen.findByRole('dialog', { name: 'Potion Safety' });
    fireEvent.click(await screen.findByLabelText('North Form'));
    fireEvent.click(await screen.findByLabelText('South Form'));
    expect(within(drawer).getByText('Assign to 1 class, remove from 1')).toBeInTheDocument();
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove class assignment' }));

    await waitFor(() => {
      const request = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/assignments/set/'));
      expect(request).toBeDefined();
      expect(JSON.parse(String((request?.[1] as RequestInit).body))).toEqual({ class_ids: [2] });
    });
    expect(await screen.findByText('Class assignments updated successfully.')).toBeInTheDocument();
  });

  it('requires confirmation before removing a class when attempts exist', async () => {
    const fetchMock = installFetchMock();
    render(
      <MemoryRouter initialEntries={['/teacher/assignments?quiz=10']}>
        <QuizAssignments />
      </MemoryRouter>
    );

    const drawer = await screen.findByRole('dialog', { name: 'Potion Safety' });
    fireEvent.click(await screen.findByLabelText('North Form'));
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/This quiz has 2 existing student attempts/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/assignments/set/'))).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Remove class assignment' }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/assignments/set/'))).toBe(true);
    });
  });

  it('warns that draft quizzes are not visible to students', async () => {
    installFetchMock();
    render(
      <MemoryRouter initialEntries={['/teacher/assignments?quiz=11']}>
        <QuizAssignments />
      </MemoryRouter>
    );

    expect(await screen.findByText('This quiz is a draft. Students cannot see it until it is published.')).toBeInTheDocument();
  });
});
