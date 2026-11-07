import type { FC, ReactNode } from 'react';

export type AlertVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info';

export interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
}

export const Alert: FC<AlertProps> = ({
  variant = 'info',
  title,
  children,
  dismissible = false,
  onDismiss,
  className = '',
}) => {
  return (
    <div
      className={`core-notice core-notice--${variant} ${className}`.trim()}
      role="alert"
    >
      <div className="core-notice__content">
        {title && <h2 className="core-notice__title">{title}</h2>}
        <div>{children}</div>
      </div>
      {dismissible && (
        <button
          type="button"
          className="core-notice__close"
          aria-label="Close"
          onClick={onDismiss}
        >
          <span aria-hidden="true">&times;</span>
        </button>
      )}
    </div>
  );
};
