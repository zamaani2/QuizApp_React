import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { DataTable, type Column } from '../../components/table/DataTable';
import {
  bulkResetUserPasswords,
  createUser,
  deleteUser,
  fetchSuperadminSchools,
  fetchUsers,
  type UserRole,
  type UserAdminInput,
  type UserAdminRecord,
  updateUser,
} from '../../api/admin';
import { useAuth } from '../../auth';
import '../admin/AdminDirectory.css';

const emptyForm = () => ({
  username: '',
  email: '',
  full_name: '',
  role: 'admin' as UserRole,
  school: '',
});

interface UserFormValues extends Omit<UserAdminInput, 'school'> {
  school: string;
}

export const UserList: React.FC = () => {
  const { data: currentUser } = useAuth();
  const isSuperadmin = currentUser?.user.role === 'superadmin';
  const [users, setUsers] = useState<UserAdminRecord[]>([]);
  const [schools, setSchools] = useState<Array<{ id: number; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAdminRecord | null>(null);
  const [formData, setFormData] = useState<UserFormValues>(emptyForm());
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserAdminRecord | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [bulkResetOpen, setBulkResetOpen] = useState(false);
  const [bulkResetLoading, setBulkResetLoading] = useState(false);
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | ''>('');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchUsers({
        search: search || undefined,
        role: roleFilter !== 'all' ? roleFilter : undefined,
        page,
      });
      setUsers(response.results);
      setTotalUsers(response.count);
      setTotalPages(response.total_pages || 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, [page, roleFilter, search]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (!isSuperadmin) return;
    void fetchSuperadminSchools()
      .then((response) => setSchools(response.results.filter((school) => school.is_active)))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load schools.');
      });
  }, [isSuperadmin]);

  const openCreateModal = useCallback(() => {
    setEditingUser(null);
    setFormData(emptyForm());
    setFormError(null);
    setIsModalOpen(true);
  }, []);

  const openEditModal = useCallback((user: UserAdminRecord) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      school: user.school?.id ? String(user.school.id) : '',
    });
    setFormError(null);
    setIsModalOpen(true);
  }, []);

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormSubmitting(true);
    setFormError(null);
    try {
      const payload: UserAdminInput = {
        ...formData,
        school: formData.school ? Number(formData.school) : '',
        ...(editingUser && formData.password ? { password: formData.password } : {}),
      };
      const response = editingUser
        ? await updateUser(editingUser.id, payload)
        : await createUser(payload);
      setSuccessMessage(response.message || 'User saved successfully.');
      setIsModalOpen(false);
      await loadUsers();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save user.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const response = await deleteUser(deleteTarget.id);
      setSuccessMessage(response.message || 'User deleted.');
      setDeleteTarget(null);
      setSelectedUserIds((userIds) => userIds.filter((id) => id !== deleteTarget.id));
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete user.');
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleBulkReset = async () => {
    if (selectedUserIds.length === 0) return;
    setBulkResetLoading(true);
    try {
      const response = await bulkResetUserPasswords(
        selectedUserIds,
        isSuperadmin ? selectedSchoolId || undefined : currentUser?.school?.id
      );
      setSuccessMessage(response.message || 'Password reset links queued.');
      setSelectedUserIds([]);
      setBulkResetOpen(false);
      setSelectedSchoolId('');
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send reset links.');
    } finally {
      setBulkResetLoading(false);
    }
  };

  const canResetUser = (user: UserAdminRecord) =>
    user.id !== currentUser?.user.id && (isSuperadmin || user.role !== 'superadmin');

  const columns: Column<UserAdminRecord>[] = useMemo(() => [
    {
      id: 'select',
      header: 'Select',
      align: 'center',
      accessor: (row) => (
        <input
          type="checkbox"
          checked={selectedUserIds.includes(row.id)}
          disabled={!canResetUser(row)}
          onChange={() => setSelectedUserIds((prev) => prev.includes(row.id) ? prev.filter((id) => id !== row.id) : [...prev, row.id])}
          aria-label={`Select ${row.full_name}`}
        />
      ),
    },
    {
      id: 'username',
      header: 'Username',
      sortable: true,
      accessor: (row) => <span className="directory-name">{row.username}</span>,
    },
    {
      id: 'full_name',
      header: 'Full name',
      sortable: true,
      accessor: (row) => row.full_name,
    },
    {
      id: 'email',
      header: 'Email',
      sortable: true,
      accessor: (row) => row.email || '—',
    },
    {
      id: 'role',
      header: 'Role',
      sortable: true,
      accessor: (row) => (
        <span className="directory-tag directory-tag--department">
          {row.role}
        </span>
      ),
    },
    {
      id: 'school',
      header: 'School',
      sortable: true,
      accessor: (row) => row.school?.name || '—',
    },
    {
      id: 'last_login',
      header: 'Last login',
      sortable: true,
      accessor: (row) => row.last_login ? new Date(row.last_login).toLocaleString() : 'Never',
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      accessor: (row) => (
        <div className="directory-row-actions">
          <Button variant="outline-primary" size="sm" onClick={() => void openEditModal(row)} title="Edit user" aria-label={`Edit ${row.full_name}`}>
            <i className="bi bi-pencil" aria-hidden="true" />
          </Button>
          {row.id !== currentUser?.user.id && (isSuperadmin || row.role !== 'superadmin') && (
            <Button variant="outline-danger" size="sm" onClick={() => setDeleteTarget(row)} title="Delete user" aria-label={`Delete ${row.full_name}`}>
              <i className="bi bi-trash" aria-hidden="true" />
            </Button>
          )}
        </div>
      ),
    },
  ], [currentUser?.user.id, isSuperadmin, openEditModal, selectedUserIds]);

  return (
    <div className="directory-page" data-testid="admin-user-list">
      <header className="directory-page__heading">
        <div>
          <p className="directory-page__eyebrow">SETTINGS</p>
          <h2>Users & Passwords</h2>
          <p>{isSuperadmin ? 'Account and access management across schools' : 'Account and access management for this school'}</p>
        </div>
        <div className="directory-page__actions">
          <button className="directory-page__action" type="button" onClick={() => void loadUsers()} disabled={loading}>
            <i className="bi bi-arrow-clockwise" aria-hidden="true" /> Refresh
          </button>
          {selectedUserIds.length > 0 && (
            <Button variant="warning" size="sm" onClick={() => setBulkResetOpen(true)}>
              Reset selected ({selectedUserIds.length})
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={() => void openCreateModal()}>
            <i className="bi bi-person-plus" aria-hidden="true" /> Add User
          </Button>
        </div>
      </header>

      {successMessage && <Alert variant="success" dismissible onDismiss={() => setSuccessMessage(null)}>{successMessage}</Alert>}
      {error && <Alert variant="danger" dismissible onDismiss={() => setError(null)}>{error}</Alert>}

      <div className="directory-controls">
        <div className="directory-segmented" role="group" aria-label="Filter users by role">
          <button type="button" className={roleFilter === 'all' ? 'is-selected' : ''} aria-pressed={roleFilter === 'all'} onClick={() => { setPage(1); setRoleFilter('all'); }}>All</button>
          {isSuperadmin && <button type="button" className={roleFilter === 'superadmin' ? 'is-selected' : ''} aria-pressed={roleFilter === 'superadmin'} onClick={() => { setPage(1); setRoleFilter('superadmin'); }}>Superadmin</button>}
          <button type="button" className={roleFilter === 'admin' ? 'is-selected' : ''} aria-pressed={roleFilter === 'admin'} onClick={() => { setPage(1); setRoleFilter('admin'); }}>Admin</button>
          <button type="button" className={roleFilter === 'teacher' ? 'is-selected' : ''} aria-pressed={roleFilter === 'teacher'} onClick={() => { setPage(1); setRoleFilter('teacher'); }}>Teacher</button>
          <button type="button" className={roleFilter === 'student' ? 'is-selected' : ''} aria-pressed={roleFilter === 'student'} onClick={() => { setPage(1); setRoleFilter('student'); }}>Student</button>
        </div>
        <div className="directory-filter-inline">
          <input className="core-input" value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} placeholder="Search users..." />
        </div>
      </div>

      <DataTable<UserAdminRecord>
        className="directory-table"
        columns={columns}
        data={users}
        keyExtractor={(row) => row.id}
        loading={loading}
        searchable={false}
        defaultPageSize={50}
        emptyTitle="No users found"
        emptyDescription="No user accounts match the current filter selection."
      />
      {totalPages > 1 && (
        <nav className="data-table__pagination-bar" aria-label="User list pagination">
          <span>Showing page {page} of {totalPages} ({totalUsers} users)</span>
          <div className="data-table__pagination">
            <button type="button" className="data-table__page-button" onClick={() => setPage((current) => current - 1)} disabled={page <= 1} aria-label="Previous user page">&laquo;</button>
            <button type="button" className="data-table__page-button" onClick={() => setPage((current) => current + 1)} disabled={page >= totalPages} aria-label="Next user page">&raquo;</button>
          </div>
        </nav>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingUser ? `Edit ${editingUser.full_name}` : 'Add user'}
        footer={<div className="core-modal__actions"><Button variant="secondary" size="sm" onClick={() => setIsModalOpen(false)} disabled={formSubmitting}>Cancel</Button><Button variant="primary" size="sm" type="submit" form="user-admin-form" loading={formSubmitting}>{editingUser ? 'Save changes' : 'Create user'}</Button></div>}
      >
        <form id="user-admin-form" className="directory-form" onSubmit={handleFormSubmit}>
          {formError && <Alert variant="danger" className="directory-form__error">{formError}</Alert>}
          <div className="directory-form__grid">
            <label className="core-field"><span className="core-field__label">Username *</span><input className="core-input" required value={formData.username} onChange={(event) => setFormData({ ...formData, username: event.target.value })} /></label>
            <label className="core-field"><span className="core-field__label">Email *</span><input className="core-input" type="email" required value={formData.email} onChange={(event) => setFormData({ ...formData, email: event.target.value })} /></label>
            <label className="core-field"><span className="core-field__label">Full name *</span><input className="core-input" required value={formData.full_name} onChange={(event) => setFormData({ ...formData, full_name: event.target.value })} /></label>
            <label className="core-field"><span className="core-field__label">Role *</span><select className="core-select" value={formData.role} onChange={(event) => setFormData({ ...formData, role: event.target.value as UserRole })}>{isSuperadmin && <option value="superadmin">Superadmin</option>}<option value="admin">Admin</option><option value="teacher">Teacher</option><option value="student">Student</option></select></label>
            {editingUser && <label className="core-field"><span className="core-field__label">Set password</span><input className="core-input" type="password" value={formData.password || ''} onChange={(event) => setFormData({ ...formData, password: event.target.value })} placeholder="Leave blank to keep the current password" /></label>}
            {isSuperadmin && <label className="core-field"><span className="core-field__label">School</span><select className="core-select" value={formData.school} onChange={(event) => setFormData({ ...formData, school: event.target.value })} required={formData.role !== 'superadmin'} disabled={Boolean(editingUser?.school)}><option value="">No school</option>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select></label>}
          </div>
          {!editingUser && <p className="directory-form__help">A password setup link will be sent to the user&apos;s email address.</p>}
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete user"
        message={`Delete ${deleteTarget?.full_name || deleteTarget?.username}? This action cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deleteLoading}
      />

      <ConfirmDialog
        isOpen={bulkResetOpen}
        onClose={() => setBulkResetOpen(false)}
        onConfirm={handleBulkReset}
        title="Reset selected users"
        message={
          <div>
            <label className="core-field">
              <span className="core-field__label">School</span>
              {isSuperadmin && <select className="core-select" value={selectedSchoolId} onChange={(event) => setSelectedSchoolId(Number(event.target.value) || '')}>
                <option value="">Select target school</option>
                {schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
              </select>}
            </label>
            <div className="mt-2">Send a one-time password setup email to {selectedUserIds.length} selected account(s)?</div>
          </div>
        }
        confirmLabel="Send reset links"
        confirmVariant="warning"
        loading={bulkResetLoading}
      />
    </div>
  );
};
