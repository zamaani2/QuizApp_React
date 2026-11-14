import { useState, type FormEvent } from 'react';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { changePassword } from '../../api/me';

export const AccountSettings = () => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setLoading(true);
    try {
      const response = await changePassword(currentPassword, newPassword);
      setSuccess(response.message);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not change password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="core-card" data-testid="account-settings">
      <div className="core-card__header">
        <h1 className="core-type--heading-5 core-type--weight-bold core-space--margin-bottom-0">Account settings</h1>
      </div>
      <div className="core-card__body">
        <p className="core-text--muted">Change the password you use to sign in.</p>
        {error && <Alert variant="danger">{error}</Alert>}
        {success && <Alert variant="success">{success}</Alert>}
        <form className="directory-form" onSubmit={(event) => void submit(event)}>
          <label className="core-field">
            <span className="core-field__label">Current password</span>
            <input
              className="core-input"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </label>
          <label className="core-field">
            <span className="core-field__label">New password</span>
            <input
              className="core-input"
              type="password"
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </label>
          <label className="core-field">
            <span className="core-field__label">Confirm new password</span>
            <input
              className="core-input"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </label>
          <Button type="submit" variant="primary" loading={loading}>Change password</Button>
        </form>
      </div>
    </section>
  );
};
