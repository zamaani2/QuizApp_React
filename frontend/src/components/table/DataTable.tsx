import { Fragment, useState, useMemo, type ReactNode } from 'react';
import { EmptyState } from '../common/EmptyState';
import { LoadingSpinner } from '../common/LoadingSpinner';
import './DataTable.css';

export interface Column<T> {
  id: string;
  header: string;
  accessor?: keyof T | ((row: T) => ReactNode);
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string | number;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  searchPlaceholder?: string;
  searchable?: boolean;
  onSearchChange?: (query: string) => void;
  defaultPageSize?: number;
  onRowClick?: (row: T) => void;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  loading = false,
  emptyTitle = 'No records found',
  emptyDescription = 'There are no items to display matching the criteria.',
  searchPlaceholder = 'Search records...',
  searchable = true,
  onSearchChange,
  defaultPageSize = 10,
  onRowClick,
  className = '',
}: DataTableProps<T>) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortColumnId, setSortColumnId] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  // 1. Filter
  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) {
      return data;
    }
    const q = searchQuery.toLowerCase().trim();
    return data.filter((row) => {
      return Object.values(row as Record<string, unknown>).some((val) => {
        if (val === null || val === undefined) return false;
        return String(val).toLowerCase().includes(q);
      });
    });
  }, [data, searchQuery]);

  // 2. Sort
  const sortedData = useMemo(() => {
    if (!sortColumnId) return filteredData;
    const col = columns.find((c) => c.id === sortColumnId);
    if (!col) return filteredData;

    return [...filteredData].sort((a, b) => {
      let aVal: unknown = '';
      let bVal: unknown = '';

      if (typeof col.accessor === 'function') {
        aVal = col.accessor(a);
        bVal = col.accessor(b);
      } else if (col.accessor) {
        aVal = a[col.accessor];
        bVal = b[col.accessor];
      }

      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      const comp = aVal < bVal ? -1 : 1;
      return sortDirection === 'asc' ? comp : -comp;
    });
  }, [filteredData, sortColumnId, sortDirection, columns]);

  // 3. Paginate
  const totalItems = sortedData.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedData = sortedData.slice(startIndex, startIndex + pageSize);

  const handleSort = (colId: string, sortable?: boolean) => {
    if (!sortable) return;
    if (sortColumnId === colId) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortColumnId(null);
        setSortDirection('asc');
      }
    } else {
      setSortColumnId(colId);
      setSortDirection('asc');
    }
  };

  return (
    <div className={`data-table-container ${className}`.trim()}>
      {/* Top search & controls */}
      {searchable && (
        <div className="data-table__toolbar">
          <label className="data-table__search">
            <i className="bi bi-search" aria-hidden="true" />
            <input
              type="text"
              className="data-table__search-input"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => {
                const query = e.target.value;
                setSearchQuery(query);
                onSearchChange?.(query);
                setPage(1);
              }}
              aria-label="Search records"
            />
          </label>

          <label className="data-table__page-size">
            <span>Rows per page</span>
            <select
              className="data-table__select"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              aria-label="Rows per page"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
        </div>
      )}

      {/* Table presentation */}
      <div className="data-table__viewport">
        <table className="data-table__table">
          <thead>
            <tr>
              {columns.map((col) => {
                const isSorted = sortColumnId === col.id;
                return (
                  <th
                    key={col.id}
                    scope="col"
                    style={{ width: col.width, cursor: col.sortable ? 'pointer' : 'default' }}
                    data-align={col.align || 'left'}
                  >
                    {col.sortable ? (
                      <button className="data-table__sort" type="button" onClick={() => handleSort(col.id, col.sortable)}>
                        <span>{col.header}</span>
                        <i
                          className={`bi ${isSorted ? sortDirection === 'asc' ? 'bi-arrow-up' : 'bi-arrow-down' : 'bi-arrow-down-up'}`}
                          aria-label={isSorted ? `Sorted ${sortDirection === 'asc' ? 'ascending' : 'descending'}` : undefined}
                          aria-hidden={isSorted ? undefined : true}
                        />
                      </button>
                    ) : col.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="data-table__state">
                  <LoadingSpinner message="Loading records..." />
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="data-table__state">
                  <EmptyState title={emptyTitle} description={emptyDescription} />
                </td>
              </tr>
            ) : (
              paginatedData.map((row) => (
                <tr
                  key={keyExtractor(row)}
                  onClick={() => onRowClick && onRowClick(row)}
                  style={{ cursor: onRowClick ? 'pointer' : 'default' }}
                >
                  {columns.map((col) => {
                    let cellContent: ReactNode = null;
                    if (typeof col.accessor === 'function') {
                      cellContent = col.accessor(row);
                    } else if (col.accessor) {
                      cellContent = row[col.accessor] as ReactNode;
                    }

                    return (
                      <td key={col.id} data-align={col.align || 'left'}>
                        {cellContent ?? '-'}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {!loading && totalItems > 0 && (
        <div className="data-table__pagination-bar">
          <div className="data-table__range">
            Showing <strong>{startIndex + 1}</strong> to{' '}
            <strong>{Math.min(startIndex + pageSize, totalItems)}</strong> of{' '}
            <strong>{totalItems}</strong> entries
          </div>

          <nav aria-label="Table pagination" className="data-table__pagination">
            <ul>
              <li>
                <button
                  type="button"
                  className="data-table__page-button"
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  aria-label="Previous page"
                >
                  &laquo;
                </button>
              </li>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(
                  (p) =>
                    p === 1 ||
                    p === totalPages ||
                    Math.abs(p - currentPage) <= 1
                )
                .map((p, idx, arr) => {
                  const prev = arr[idx - 1];
                  const showEllipsis = prev && p - prev > 1;

                  return (
                    <Fragment key={p}>
                      {showEllipsis && <li className="data-table__ellipsis" aria-hidden="true">...</li>}
                      <li>
                        <button
                          type="button"
                          className={`data-table__page-button ${p === currentPage ? 'is-current' : ''}`}
                          onClick={() => setPage(p)}
                          aria-current={p === currentPage ? 'page' : undefined}
                        >
                          {p}
                        </button>
                      </li>
                    </Fragment>
                  );
                })}
              <li>
                <button
                  type="button"
                  className="data-table__page-button"
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  aria-label="Next page"
                >
                  &raquo;
                </button>
              </li>
            </ul>
          </nav>
        </div>
      )}
    </div>
  );
}
