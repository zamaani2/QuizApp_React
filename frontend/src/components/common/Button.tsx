import type { ButtonHTMLAttributes, FC, ReactNode } from 'react';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'success'
  | 'danger'
  | 'warning'
  | 'info'
  | 'outline-primary'
  | 'outline-secondary'
  | 'outline-danger'
  | 'outline-light'
  | 'link';

export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

export const Button: FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  className = '',
  disabled,
  ...rest
}) => {
  const sizeClass = size === 'md' ? '' : `core-button--${size}`;

  return (
    <button
      className={`core-button core-button--${variant} ${sizeClass} ${className}`.trim()}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <>
          <span
            className="core-spinner core-spinner--small"
            role="status"
          >
            <span className="core-visually-hidden">Loading...</span>
          </span>
          <span>{children || 'Loading...'}</span>
        </>
      ) : (
        <>
          {icon && <span className="core-button__icon">{icon}</span>}
          {children}
        </>
      )}
    </button>
  );
};
