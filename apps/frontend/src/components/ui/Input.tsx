import { useId, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className = '', id: externalId, ...props }: InputProps) {
  const generatedId = useId();
  const inputId = externalId || generatedId;

  return (
    <div>
      {label && (
        <label htmlFor={inputId} className="block text-sm text-white/50 mb-1.5">{label}</label>
      )}
      <input
        id={inputId}
        className={`input ${error ? '!border-red-500/50' : ''} ${className}`}
        {...props}
      />
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}
