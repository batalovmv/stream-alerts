import { useAuth } from '../../hooks/useAuth';
import { Navbar, Avatar, Button } from '@memelabui/ui';

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
      <Navbar
        glass
        logo={
          <a href="/" className="flex items-center gap-3">
            <img src="/logo.png" alt="MemeLab Notify" className="w-9 h-9 rounded-xl" />
            <span className="text-lg font-bold tracking-tight">MemeLab Notify</span>
          </a>
        }
      >
        {user && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <Avatar
                src={user.avatarUrl ?? undefined}
                name={user.displayName}
                size="sm"
              />
              <span className="text-sm font-medium hidden sm:block">
                {user.displayName}
              </span>
            </div>
            <Button variant="ghost" size="sm" onClick={logout}>
              Выйти
            </Button>
          </div>
        )}
      </Navbar>

      {/* Content */}
      <main className="pt-24 pb-12 px-6">
        <div className="max-w-4xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
