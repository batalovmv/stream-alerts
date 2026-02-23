import { Component, type ReactNode, type ErrorInfo } from 'react';
import { Card, Button } from '@memelabui/ui';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-surface">
          <Card variant="glass" className="p-8 max-w-md text-center">
            <h2 className="text-xl font-semibold mb-2">Что-то пошло не так</h2>
            <p className="text-white/50 mb-4">Произошла неожиданная ошибка.</p>
            <Button
              variant="primary"
              onClick={() => {
                window.location.href = '/';
              }}
            >
              На главную
            </Button>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}
