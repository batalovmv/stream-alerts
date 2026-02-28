import { NavLink } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Avatar, Button } from '@memelabui/ui';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { to: '/dashboard/channels', label: 'Каналы', icon: '📢' },
  { to: '/dashboard/settings', label: 'Настройки', icon: '⚙️' },
];

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold bg-gradient-to-r from-accent to-glow-purple bg-clip-text text-transparent">
              MemeLab Notify
            </span>
          </div>
          {user && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <Avatar
                  src={user.avatarUrl ?? undefined}
                  name={user.displayName}
                  size="sm"
                />
                <span className="text-sm text-white/70 hidden sm:block">
                  {user.displayName}
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={logout}>
                Выйти
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* Main layout */}
      <div className="max-w-7xl mx-auto px-4 py-6 flex gap-6">
        {/* Desktop sidebar */}
        <nav className="w-56 shrink-0 hidden md:block">
          <div className="glass rounded-xl p-3 sticky top-24">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all duration-200 ${
                    isActive
                      ? 'bg-accent/20 text-accent'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`
                }
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Mobile bottom nav */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass border-t border-white/10 px-2 py-1">
          <div className="flex justify-around">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex flex-col items-center py-2 px-3 text-xs transition-colors ${
                    isActive ? 'text-accent' : 'text-white/50'
                  }`
                }
              >
                <span className="text-lg">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        </div>

        {/* Content */}
        <main className="flex-1 min-w-0 pb-20 md:pb-0">
          {children}
        </main>
      </div>
    </div>
  );
}
