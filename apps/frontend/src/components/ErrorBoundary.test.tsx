import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock @sentry/react before importing ErrorBoundary
vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
}));

// Mock @memelabui/ui
vi.mock('@memelabui/ui', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card" className={className}>{children}</div>
  ),
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

import * as Sentry from '@sentry/react';
import { ErrorBoundary } from './ErrorBoundary';

function ThrowingChild({ error }: { error?: Error }) {
  if (error) throw error;
  return <div>Child content</div>;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Suppress console.error from React error boundary
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div>Hello</div>
      </ErrorBoundary>,
    );

    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('renders fallback UI when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild error={new Error('Test error')} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Что-то пошло не так')).toBeInTheDocument();
    expect(screen.getByText('На главную')).toBeInTheDocument();
  });

  it('captures exception with Sentry', () => {
    const testError = new Error('Sentry test');

    render(
      <ErrorBoundary>
        <ThrowingChild error={testError} />
      </ErrorBoundary>,
    );

    expect(Sentry.captureException).toHaveBeenCalledWith(
      testError,
      expect.objectContaining({
        contexts: expect.objectContaining({
          react: expect.objectContaining({
            componentStack: expect.any(String),
          }),
        }),
      }),
    );
  });

  it('renders custom fallback when provided', () => {
    const fallback = (reset: () => void) => (
      <div>
        <span>Custom error</span>
        <button onClick={reset}>Retry</button>
      </div>
    );

    render(
      <ErrorBoundary fallback={fallback}>
        <ThrowingChild error={new Error('Test')} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Custom error')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });
});
