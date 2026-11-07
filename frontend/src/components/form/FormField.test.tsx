import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormField, TextInput } from './FormField';

describe('FormField Primitive', () => {
  it('renders label, input, and helper text', () => {
    render(
      <FormField id="quiz-title" label="Quiz Title" helperText="Enter a descriptive title">
        <TextInput id="quiz-title" placeholder="e.g. Midterm Physics" />
      </FormField>
    );

    expect(screen.getByLabelText(/quiz title/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. Midterm Physics')).toBeInTheDocument();
    expect(screen.getByText('Enter a descriptive title')).toBeInTheDocument();
  });

  it('renders required asterisk when required is true', () => {
    render(
      <FormField id="required-field" label="Subject Name" required>
        <TextInput id="required-field" />
      </FormField>
    );
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('renders error message and invalid styling when error is provided', () => {
    render(
      <FormField id="err-field" label="Email" error="Invalid email address">
        <TextInput id="err-field" error="Invalid email address" />
      </FormField>
    );

    const errorEl = screen.getByRole('alert');
    expect(errorEl).toHaveTextContent('Invalid email address');
    expect(screen.getByRole('textbox')).toHaveClass('core-input--invalid');
  });
});
