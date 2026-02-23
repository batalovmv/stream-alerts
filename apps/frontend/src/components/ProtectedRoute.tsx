import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Button, Card, Spinner } from '@memelabui/ui';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, isError } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  // Network error — don't redirect to login, show error state
  if (isError) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <Card variant="glass" className="p-12 text-center max-w-md">
          <div className="text-4xl mb-4">&#x26A0;&#xFE0F;</div>
          <h2 className="text-xl font-semibold mb-2">Ошибка соединения</h2>
          <p className="text-white/40 mb-6">
            Не удалось проверить авторизацию. Проверьте подключение к интернету.
          </p>
          <Button variant="primary" onClick={() => window.location.reload()}>
            Повторить
          </Button>
        </Card>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
