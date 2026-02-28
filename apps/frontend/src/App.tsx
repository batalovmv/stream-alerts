import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Landing } from './pages/Landing';
import { ChannelsPage } from './pages/ChannelsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Card, Button } from '@memelabui/ui';

function RouteErrorFallback({ reset }: { reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <Card variant="glass" className="p-8 max-w-md text-center">
        <h2 className="text-xl font-semibold mb-2">Ошибка на странице</h2>
        <p className="text-white/50 mb-4">
          Произошла ошибка при отображении страницы.
        </p>
        <Button variant="primary" onClick={reset}>
          Попробовать снова
        </Button>
      </Card>
    </div>
  );
}

export function App() {
  const { pathname } = useLocation();

  return (
    <ErrorBoundary
      resetKey={pathname}
      fallback={(reset) => <RouteErrorFallback reset={reset} />}
    >
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/dashboard" element={<Navigate to="/dashboard/channels" replace />} />
        <Route
          path="/dashboard/channels"
          element={
            <ProtectedRoute>
              <ChannelsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}
