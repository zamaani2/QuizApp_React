import type { FC, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react';

export interface FormFieldProps {
  id: string;
  label: string;
  error?: string | string[];
  helperText?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export const FormField: FC<FormFieldProps> = ({
  id,
  label,
  error,
  helperText,
  required = false,
  children,
  className = '',
}) => {
  const errorMsg = Array.isArray(error) ? error[0] : error;

  return (
    <div className={`core-field ${className}`.trim()}>
      <label htmlFor={id} className="core-field__label">
        {label}
        {required && <span className="core-field__required">*</span>}
      </label>
      {children}
      {helperText && !errorMsg && <div className="core-field__helper">{helperText}</div>}
      {errorMsg && (
        <div className="core-field__error" role="alert">
          {errorMsg}
        </div>
      )}
    </div>
  );
};

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean | string | string[];
}

export const TextInput: FC<TextInputProps> = ({ error, className = '', ...rest }) => {
  const isInvalid = Boolean(error);
  return (
    <input
      className={`core-input ${isInvalid ? 'core-input--invalid' : ''} ${className}`.trim()}
      {...rest}
    />
  );
};

export interface SelectInputProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean | string | string[];
}

export const SelectInput: FC<SelectInputProps> = ({ error, className = '', children, ...rest }) => {
  const isInvalid = Boolean(error);
  return (
    <select
      className={`core-select ${isInvalid ? 'core-input--invalid' : ''} ${className}`.trim()}
      {...rest}
    >
      {children}
    </select>
  );
};

export interface TextareaInputProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean | string | string[];
}

export const TextareaInput: FC<TextareaInputProps> = ({ error, className = '', ...rest }) => {
  const isInvalid = Boolean(error);
  return (
    <textarea
      className={`core-textarea ${isInvalid ? 'core-input--invalid' : ''} ${className}`.trim()}
      {...rest}
    />
  );
};
