import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { StructureManager } from './admin/StructureManager';

describe('School structure management', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a form and refreshes the forms table', async () => {
    let createdForm: Record<string, unknown> | null = null;
    global.fetch = vi.fn().mockImplementation(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
          createdForm = {
            id: 2,
            form_number: payload.form_number,
            name: payload.name,
            description: payload.description,
            school_id: 1,
            school_name: 'Alpha High',
            student_count: 0,
          };
          return {
            ok: true,
            status: 201,
            json: async () => ({
              success: true,
              message: 'Form Form 2 created successfully.',
              item: createdForm,
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            forms: createdForm ? [createdForm] : [],
          }),
        };
      },
    );

    render(
      <BrowserRouter>
        <StructureManager resource="forms" />
      </BrowserRouter>,
    );

    await waitFor(() => expect(screen.getByText('No forms & grade levels found.')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Add Form' }));
    fireEvent.change(screen.getByLabelText(/Form Number/i), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/Form Name/i), { target: { value: 'Form 2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Form' }));

    await waitFor(() => {
      expect(screen.getByText('Form Form 2 created successfully.')).toBeInTheDocument();
      expect(screen.getByText('Form 2')).toBeInTheDocument();
    });
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/school-structure/forms/',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
