import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeacherImportDialog } from './TeacherImportDialog';

const previewTeacherImport = vi.fn();
const bulkImportTeachers = vi.fn();

vi.mock('../../api/admin', () => ({
  previewTeacherImport: (...args: unknown[]) => previewTeacherImport(...args),
  bulkImportTeachers: (...args: unknown[]) => bulkImportTeachers(...args),
}));

describe('TeacherImportDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('previews columns, requires mappings, and submits mapped teacher data', async () => {
    previewTeacherImport.mockResolvedValue({
      headers: ['Name', 'Phone'],
      preview_rows: [{ Name: 'A Teacher', Phone: '5550100' }],
    });
    bulkImportTeachers.mockResolvedValue({
      imported: 1,
      errors: [],
      message: 'Imported 1 teacher.',
      partial_success: false,
    });
    const onImported = vi.fn();

    render(
      <TeacherImportDialog
        isOpen
        onClose={vi.fn()}
        onImported={onImported}
        lookups={null}
        schoolId={8}
      />
    );

    fireEvent.change(screen.getByLabelText(/Teacher data file/), {
      target: { files: [new File(['Name,Phone\\nA Teacher,5550100'], 'teachers.csv', { type: 'text/csv' })] },
    });
    await waitFor(() => expect(screen.getByText('Map file columns')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Full name *'), { target: { value: 'Name' } });
    fireEvent.change(screen.getByLabelText('Contact number *'), { target: { value: 'Phone' } });
    fireEvent.click(screen.getByRole('button', { name: 'Import teachers' }));

    await waitFor(() => {
      expect(bulkImportTeachers).toHaveBeenCalledWith(
        expect.any(File),
        expect.objectContaining({ full_name: 'Name', contact_number: 'Phone' }),
        8,
        undefined
      );
    });
    expect(onImported).toHaveBeenCalledWith(expect.objectContaining({ imported: 1 }));
  });
});
