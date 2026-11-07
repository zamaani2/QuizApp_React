import { useEffect, type FC, type ReactNode } from 'react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  closeOnBackdrop?: boolean;
}

export const Modal: FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.body.classList.add('core-modal-open');
      document.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.classList.remove('core-modal-open');
    }
    return () => {
      document.body.classList.remove('core-modal-open');
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const sizeClass = size === 'md' ? '' : `core-modal__dialog--${size}`;

  return (
    <>
      <div
        className="core-modal"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(e) => {
          if (closeOnBackdrop && e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        <div className={`core-modal__dialog ${sizeClass}`} role="document">
          <div className="core-modal__panel">
            <header className="core-modal__header">
              <h2 id="modal-title">
                {title}
              </h2>
              <button
                type="button"
                className="core-modal__close"
                aria-label="Close"
                onClick={onClose}
              ><span aria-hidden="true">&times;</span></button>
            </header>
            <div className="core-modal__body">{children}</div>
            {footer && <footer className="core-modal__footer">{footer}</footer>}
          </div>
        </div>
      </div>
    </>
  );
};
