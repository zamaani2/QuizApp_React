import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Alert } from './Alert';

describe('Alert Primitive', () => {
  it('renders alert with variant and title', () => {
    render(
      <Alert variant="warning" title="Notice Title">
        Warning message body
      </Alert>
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('core-notice--warning');
    expect(screen.getByText('Notice Title')).toBeInTheDocument();
    expect(screen.getByText('Warning message body')).toBeInTheDocument();
  });

  it('renders close button when dismissible is true and calls onDismiss', () => {
    const handleDismiss = vi.fn();
    render(
      <Alert variant="success" dismissible onDismiss={handleDismiss}>
        Operation successful
      </Alert>
    );
    const closeBtn = screen.getByLabelText(/close/i);
    expect(closeBtn).toBeInTheDocument();
    fireEvent.click(closeBtn);
    expect(handleDismiss).toHaveBeenCalledTimes(1);
  });
});
