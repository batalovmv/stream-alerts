import { useAuth } from '../../hooks/useAuth';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-surface relative overflow-hidden">
      {/* Background orbs */}
      <div className="orb orb-purple w-[400px] h-[400px] -top-[150px] -left-[150px] fixed opacity-15" />
      <div className="orb orb-blue w-[300px] h-[300px] top-[60%] -right-[100px] fixed opacity-10" />

      {/* Header */}
      <header className="fixed top-0 w-full z-50 glass">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl animated-gradient" />
            <span className="text-lg font-bold tracking-tight">MemeLab Notify</span>
          </a>

          {user && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.displayName}
                    className="w-8 h-8 rounded-full"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                ) : null}
                <div className={`w-8 h-8 rounded-full animated-gradient ${user.avatarUrl ? 'hidden' : ''}`} />
                <span className="text-sm font-medium hidden sm:block">
                  {user.displayName}
                </span>
              </div>
              <button
                onClick={logout}
                className="text-sm text-white/40 hover:text-white transition"
              >
                Выйти
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="pt-24 pb-12 px-6">
        <div className="max-w-4xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
