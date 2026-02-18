import { Component, type ReactNode, type ErrorInfo } from 'react';

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
        <div className="min-h-screen flex items-center justify-center bg-surface-900">
          <div className="glass-card p-8 max-w-md text-center">
            <h2 className="text-xl font-semibold mb-2">Что-то пошло не так</h2>
            <p className="text-white/50 mb-4">Произошла неожиданная ошибка.</p>
            <button
              className="btn-glow px-4 py-2 rounded-lg"
              onClick={() => {
                this.setState({ hasError: false });
                window.location.href = '/';
              }}
            >
              На главную
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
