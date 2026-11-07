import { useState, useEffect, type FC } from 'react';
import { apiClient } from '../../api/client';
import { ConfirmDialog } from '../common/ConfirmDialog';

interface SessionTimerProps {
  initialSeconds?: number;
}

export const SessionTimer: FC<SessionTimerProps> = ({ initialSeconds = 28800 }) => {
  const [secondsRemaining, setSecondsRemaining] = useState(initialSeconds);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [extending, setExtending] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        if (prev === 61) {
          setShowWarningModal(true);
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleExtend = async () => {
    setExtending(true);
    try {
      const res = await apiClient<{ success: boolean; expiry_seconds: number }>(
        '/api/v1/extend-session/',
        { method: 'POST' }
      );
      if (res.expiry_seconds) {
        setSecondsRemaining(res.expiry_seconds);
      } else {
        setSecondsRemaining(28800);
      }
      setShowWarningModal(false);
    } catch {
      // Fallback: reset timer locally if endpoint is unavailable
      setSecondsRemaining(28800);
      setShowWarningModal(false);
    } finally {
      setExtending(false);
    }
  };

  const hours = Math.floor(secondsRemaining / 3600);
  const minutes = Math.floor((secondsRemaining % 3600) / 60);
  const seconds = secondsRemaining % 60;
  const formattedTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const isLow = secondsRemaining <= 300 && secondsRemaining > 60;
  const isCritical = secondsRemaining <= 60;
  const timerState = isCritical
    ? 'core-session--critical'
    : isLow
      ? 'core-session--low'
      : '';

  return (
    <>
      <div
        className={`core-session ${timerState}`}
        title="Session time remaining"
        aria-live="off"
      >
        <i className="bi bi-clock-history" aria-hidden="true" />
        <span className="core-session__label">Session</span>
        <span>{formattedTime}</span>
      </div>

      <ConfirmDialog
        isOpen={showWarningModal}
        onClose={() => setShowWarningModal(false)}
        onConfirm={handleExtend}
        title="Session Expiring"
        message="Your session will expire in 1 minute. Would you like to extend it now to keep your work?"
        confirmLabel="Extend Session"
        cancelLabel="Let it expire"
        confirmVariant="primary"
        loading={extending}
      />
    </>
  );
};
