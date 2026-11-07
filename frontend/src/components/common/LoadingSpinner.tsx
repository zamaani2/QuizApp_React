import type { FC } from 'react';

export interface LoadingSpinnerProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
  fullPage?: boolean;
}

export const LoadingSpinner: FC<LoadingSpinnerProps> = ({
  message = 'Loading...',
  size = 'md',
  fullPage = false,
}) => {
  const sizeClass = size === 'md' ? '' : `core-spinner--${size}`;

  const spinner = (
    <div className="core-loading" role="status" aria-live="polite">
      <div className={`core-spinner ${sizeClass}`} aria-hidden="true">
        <span className="core-visually-hidden">{message}</span>
      </div>
      {message && <p className="core-loading__message">{message}</p>}
    </div>
  );

  if (fullPage) {
    return (
      <div
        className="core-loading--full"
        style={{ minHeight: '300px' }}
      >
        {spinner}
      </div>
    );
  }

  return spinner;
};
