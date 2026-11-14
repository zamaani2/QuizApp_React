import { useEffect, useId, type FC, type ReactNode } from 'react';
import './SideDrawer.css';

export interface SideDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  closeDisabled?: boolean;
  closeLabel?: string;
}

export const SideDrawer: FC<SideDrawerProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  closeDisabled = false,
  closeLabel = 'Close panel',
}) => {
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return;
    document.body.classList.add('core-modal-open');
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !closeDisabled) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.classList.remove('core-modal-open');
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeDisabled, isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="side-drawer-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !closeDisabled) onClose();
      }}
    >
      <section className="side-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="side-drawer__header">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="side-drawer__close"
            aria-label={closeLabel}
            onClick={onClose}
            disabled={closeDisabled}
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </header>
        <div className="side-drawer__body">{children}</div>
        {footer && <footer className="side-drawer__footer">{footer}</footer>}
      </section>
    </div>
  );
};
