import type { MouseEventHandler, ReactNode } from 'react';
import { getCsrfToken } from '../api/csrf';

interface SignOutFormProps {
  action?: string;
  ariaLabel?: string;
  children: ReactNode;
  className?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  title?: string;
}

export function SignOutForm({
  action = '/logout/',
  ariaLabel,
  children,
  className,
  onClick,
  title,
}: SignOutFormProps) {
  return (
    <form method="post" action={action}>
      <input type="hidden" name="csrfmiddlewaretoken" value={getCsrfToken() ?? ''} />
      <button
        type="submit"
        className={className}
        aria-label={ariaLabel}
        title={title}
        onClick={onClick}
      >
        {children}
      </button>
    </form>
  );
}
