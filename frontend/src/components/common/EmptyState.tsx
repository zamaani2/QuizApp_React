import { AppIcon } from './AppIcon';
import type { FC, ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export const EmptyState: FC<EmptyStateProps> = ({
  title,
  description,
  icon,
  action,
  className = '',
}) => {
  return (
    <div className={`core-empty-state ${className}`.trim()}>
      <div className="core-empty-state__icon">
        {icon || <AppIcon name="inbox" aria-hidden="true" />}
      </div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div className="core-empty-state__action">{action}</div>}
    </div>
  );
};
