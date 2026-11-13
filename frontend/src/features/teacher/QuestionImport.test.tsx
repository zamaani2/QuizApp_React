import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QuestionImport } from './QuestionImport';

const previewData = {
  rows: [
    { row: 2, status: 'valid', type: 'essay', text_preview: 'A valid question', errors: [] },
    {
      row: 3,
      status: 'invalid',
      type: 'unknown',
      text_preview: 'Broken question',
      errors: [{ field: 'question_type', message: 'Unsupported question type.' }],
    },
  ],
  summary: { total: 2, valid: 1, invalid: 1 },
};

function mountImport() {
  return render(
    <MemoryRouter initialEntries={['/teacher/questions/8/import']}>
      <Routes>
        <Route path="/teacher/questions/:quizId/import" element={<QuestionImport />} />
      </Routes>
    </MemoryRouter>
  );
}

function apiResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => data,
  } as Response;
}

beforeEach(() => {
  global.fetch = vi.fn(async (_input, init) => {
    const body = init?.body;
    if (body instanceof FormData && body.get('dry_run') === 'true') {
      return apiResponse(previewData);
    }
    return apiResponse({
      success: true,
      imported: 1,
      skipped: 1,
      message: 'Imported',
      rows: previewData.rows,
      summary: previewData.summary,
    });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('QuestionImport', () => {
  it('shows all import steps, formatting guidance, and authenticated template links', () => {
    mountImport();

    expect(screen.getByRole('list', { name: 'Import steps' })).toBeInTheDocument();
    expect(screen.getByText('Matching')).toBeInTheDocument();
    expect(screen.getByText('Ordering')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download CSV template' }))
      .toHaveAttribute('href', '/quizzes/8/questions/import-template/csv/');
  });

  it('previews without creating questions and confirms an explicit skip-invalid import', async () => {
    mountImport();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to upload' }));
    expect(screen.getByRole('button', { name: /Drop your file here/ })).toBeInTheDocument();
    const file = new File(['question_text,question_type\nA valid question,essay'], 'questions.csv', { type: 'text/csv' });
    fireEvent.change(document.getElementById('question-import-file') as HTMLInputElement, {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Upload and check file' }));

    expect(await screen.findByText('Unsupported question type.')).toBeInTheDocument();
    const previewCall = vi.mocked(global.fetch).mock.calls[0];
    expect(previewCall[0]).toBe('/api/v1/teacher/quizzes/8/questions/import/');
    expect((previewCall[1]?.body as FormData).get('dry_run')).toBe('true');
    expect(screen.getByText(/1 valid · 1 invalid/)).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Errors only' }));
    expect(screen.queryByText('A valid question')).not.toBeInTheDocument();
    expect(screen.getByText('Broken question')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Continue to confirm/ }));
    expect(screen.getByRole('button', { name: /Import 1 valid question/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /Skip 1 invalid row/ }));
    fireEvent.click(screen.getByRole('button', { name: /Import 1 valid question/ }));
    expect(await screen.findByRole('heading', { name: 'Import complete' })).toBeInTheDocument();

    await waitFor(() => expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(2));
    const importBody = vi.mocked(global.fetch).mock.calls[1][1]?.body as FormData;
    expect(importBody.get('skip_invalid')).toBe('true');
    expect(importBody.get('dry_run')).toBeNull();
    expect(screen.getByRole('link', { name: 'View questions' }))
      .toHaveAttribute('href', '/teacher/questions/8');
  });

  it('filters invalid preview rows and rejects unsupported or oversized files before upload', async () => {
    mountImport();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to upload' }));
    const input = document.getElementById('question-import-file') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['bad'], 'questions.xls', { type: 'application/vnd.ms-excel' })] },
    });
    expect(await screen.findByText('Choose a CSV or XLSX file.')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();

    const oversized = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [oversized] } });
    expect(await screen.findByText('Files must be 5 MB or smaller.')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
