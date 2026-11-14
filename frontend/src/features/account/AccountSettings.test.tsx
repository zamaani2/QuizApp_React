import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountSettings } from './AccountSettings';

const changePassword = vi.fn();

vi.mock('../../api/me', () => ({
  changePassword: (...args: unknown[]) => changePassword(...args),
}));

describe('AccountSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits the current and new password and reports success', async () => {
    changePassword.mockResolvedValue({ success: true, message: 'Password changed successfully.' });
    render(<AccountSettings />);

    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'old-password' } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-password' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'new-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

    await waitFor(() => expect(changePassword).toHaveBeenCalledWith('old-password', 'new-password'));
    expect(await screen.findByText('Password changed successfully.')).toBeInTheDocument();
  });

  it('does not send mismatched password confirmation', () => {
    render(<AccountSettings />);

    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'old-password' } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-password' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'different' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

    expect(changePassword).not.toHaveBeenCalled();
    expect(screen.getByText('New password and confirmation do not match.')).toBeInTheDocument();
  });
});
