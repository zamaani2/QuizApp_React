import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataTable, type Column } from './DataTable';

interface StudentItem {
  id: number;
  name: string;
  grade: string;
  score: number;
}

const TEST_DATA: StudentItem[] = [
  { id: 1, name: 'Alice Smith', grade: 'Grade 10', score: 95 },
  { id: 2, name: 'Bob Jones', grade: 'Grade 10', score: 82 },
  { id: 3, name: 'Charlie Brown', grade: 'Grade 11', score: 74 },
  { id: 4, name: 'Diana Prince', grade: 'Grade 11', score: 88 },
];

const COLUMNS: Column<StudentItem>[] = [
  { id: 'name', header: 'Name', accessor: 'name', sortable: true },
  { id: 'grade', header: 'Grade', accessor: 'grade', sortable: true },
  { id: 'score', header: 'Score', accessor: 'score', sortable: true, align: 'right' },
];

describe('DataTable Primitive', () => {
  it('renders table headers and rows', () => {
    render(
      <DataTable
        columns={COLUMNS}
        data={TEST_DATA}
        keyExtractor={(item) => item.id}
      />
    );
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Grade')).toBeInTheDocument();
    expect(screen.getByText('Score')).toBeInTheDocument();
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
  });

  it('filters rows based on search input', () => {
    render(
      <DataTable
        columns={COLUMNS}
        data={TEST_DATA}
        keyExtractor={(item) => item.id}
      />
    );
    const searchInput = screen.getByLabelText(/search records/i);
    fireEvent.change(searchInput, { target: { value: 'Diana' } });

    expect(screen.getByText('Diana Prince')).toBeInTheDocument();
    expect(screen.queryByText('Alice Smith')).not.toBeInTheDocument();
  });

  it('shows empty state when search matches nothing', () => {
    render(
      <DataTable
        columns={COLUMNS}
        data={TEST_DATA}
        keyExtractor={(item) => item.id}
        emptyTitle="No students found"
      />
    );
    const searchInput = screen.getByLabelText(/search records/i);
    fireEvent.change(searchInput, { target: { value: 'Nonexistent' } });

    expect(screen.getByText('No students found')).toBeInTheDocument();
  });

  it('sorts rows when clicking a sortable column header', () => {
    render(
      <DataTable
        columns={COLUMNS}
        data={TEST_DATA}
        keyExtractor={(item) => item.id}
      />
    );

    const nameHeader = screen.getByText('Name');
    // First click: Sort ascending
    fireEvent.click(nameHeader);
    const rowsAsc = screen.getAllByRole('row');
    // Row 0 is the header, Row 1 should be Alice
    expect(rowsAsc[1]).toHaveTextContent('Alice Smith');

    // Second click: Sort descending
    fireEvent.click(nameHeader);
    const rowsDesc = screen.getAllByRole('row');
    // Row 1 should now be Diana
    expect(rowsDesc[1]).toHaveTextContent('Diana Prince');
  });
});
