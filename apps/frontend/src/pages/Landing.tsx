import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function Landing() {
  const { isAuthenticated, isLoading, login } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="w-8 h-8 rounded-full animated-gradient animate-spin" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-surface relative overflow-hidden">
      {/* Background orbs */}
      <div className="orb orb-purple w-[600px] h-[600px] -top-[200px] -left-[200px] fixed" />
      <div className="orb orb-blue w-[500px] h-[500px] top-[40%] -right-[150px] fixed" />
      <div className="orb orb-pink w-[400px] h-[400px] bottom-[10%] left-[20%] fixed opacity-20" />

      {/* Header */}
      <header className="fixed top-0 w-full z-50 glass">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="MemeLab Notify" className="w-9 h-9 rounded-xl" />
            <span className="text-lg font-bold tracking-tight">MemeLab Notify</span>
          </div>
          <nav className="flex items-center gap-8">
            <a href="#features" className="text-sm text-white/50 hover:text-white transition hidden sm:block">
              Возможности
            </a>
            <a href="#how-it-works" className="text-sm text-white/50 hover:text-white transition hidden sm:block">
              Как это работает
            </a>
            <button onClick={login} className="btn-glow text-sm !px-5 !py-2.5 !shadow-glow">
              Войти через MemeLab
            </button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-36 pb-24 px-6 relative">
        <div className="max-w-4xl mx-auto text-center">
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm mb-8 opacity-0 animate-fade-up"
            style={{ background: 'rgba(102, 126, 234, 0.1)', border: '1px solid rgba(102, 126, 234, 0.2)' }}
          >
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse-glow" />
            <span className="text-accent-light">Telegram</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold leading-[1.1] mb-6 opacity-0 animate-fade-up-delayed">
            <span className="text-gradient">Анонсы стримов</span>
            <br />
            <span className="text-white">автоматически</span>
          </h1>

          <p className="text-lg md:text-xl text-white/40 max-w-2xl mx-auto mb-12 leading-relaxed opacity-0 animate-fade-up-delayed-2">
            Стрим начался — анонс с превью уже в вашем Telegram-канале.
            Настройте один раз, дальше всё работает само.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6 opacity-0 animate-fade-up-delayed-2">
            <button onClick={login} className="btn-glow text-lg">
              Начать бесплатно
            </button>
            <a href="#how-it-works" className="btn-secondary text-lg text-center">
              Как это работает?
            </a>
          </div>

          <p className="text-white/25 text-sm">Бесплатно. Настройка за 2 минуты.</p>
        </div>

        {/* Stats */}
        <div className="max-w-3xl mx-auto mt-20 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { value: '2 мин', label: 'настройка' },
            { value: '<5 сек', label: 'доставка' },
            { value: '1', label: 'мессенджер' },
            { value: '∞', label: 'каналов' },
          ].map((stat) => (
            <div key={stat.label} className="glass-card p-5 text-center">
              <div className="text-2xl md:text-3xl font-bold text-gradient stat-glow">{stat.value}</div>
              <div className="text-sm text-white/35 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-6 relative">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Что умеет <span className="text-gradient">Notify</span>
            </h2>
            <p className="text-white/35 max-w-xl mx-auto">
              Не просто рассылка — полноценная система анонсов с автоматизацией
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                icon: '🔴',
                title: 'Автоматические анонсы',
                desc: 'Стрим начался — анонс с превью и кнопкой уже в канале. Без ручной работы.',
              },
              {
                icon: '🎨',
                title: 'Свой стиль',
                desc: 'Настройте текст, добавьте свои эмоджи и ссылки. Или используйте красивый дефолт.',
              },
              {
                icon: '🧹',
                title: 'Автоудаление',
                desc: 'Стрим закончился — анонс исчезает. Канал всегда чистый и актуальный.',
              },
              {
                icon: '📱',
                title: 'Telegram',
                desc: 'Подключайте несколько каналов и групп одновременно.',
              },
              {
                icon: '🤖',
                title: 'Управление через бота',
                desc: 'Настройки, шаблоны, статистика, предпросмотр — всё через бота, без открытия сайта.',
              },
              {
                icon: '⚡',
                title: 'Мгновенная доставка',
                desc: 'Меньше 5 секунд от начала стрима до анонса. Дедупликация и обновление при смене игры.',
              },
            ].map((feature) => (
              <div key={feature.title} className="glass-card p-6 group">
                <div className="feature-icon mb-5">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-semibold mb-2 group-hover:text-accent-light transition-colors">{feature.title}</h3>
                <p className="text-sm text-white/40 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-24 px-6 relative">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Как <span className="text-gradient">начать</span>
            </h2>
            <p className="text-white/35">
              Три шага — и анонсы работают автоматически
            </p>
          </div>

          <div className="space-y-6">
            {[
              {
                step: '1',
                title: 'Войди через MemeLab',
                desc: 'Один клик — и аккаунт привязан. Твой канал и настройки подтянутся автоматически.',
              },
              {
                step: '2',
                title: 'Добавь бота в канал',
                desc: 'Добавь @MemelabNotifyBot как администратора в Telegram-канал или группу.',
              },
              {
                step: '3',
                title: 'Готово!',
                desc: 'Теперь при каждом начале стрима бот автоматически отправит красивый анонс с превью.',
              },
            ].map((item) => (
              <div key={item.step} className="glass-card p-6 flex items-start gap-5">
                <div className="step-number">{item.step}</div>
                <div>
                  <h3 className="text-xl font-semibold mb-1">{item.title}</h3>
                  <p className="text-white/40 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Announcement preview */}
      <section className="py-24 px-6 relative">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Как выглядит <span className="text-gradient">анонс</span>
            </h2>
            <p className="text-white/35">
              Красивый анонс с превью, названием стрима и кнопкой
            </p>
          </div>

          <div className="max-w-sm mx-auto">
            <div className="glass-card p-0 overflow-hidden hover:!border-accent/30">
              {/* Fake stream preview */}
              <div className="h-48 relative animated-gradient opacity-80">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-5xl">🎮</div>
                </div>
                <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded bg-red-600 text-xs font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  LIVE
                </div>
              </div>
              {/* Fake message content */}
              <div className="p-5">
                <p className="text-white/90 leading-relaxed">
                  <span className="text-red-400">🔴</span> <strong>Стрим начался!</strong>
                  <br /><br />
                  <span className="text-white/60">StreamerName</span> сейчас в эфире
                  <br />
                  📺 Вечерний стрим с чатом
                  <br />
                  🎮 Just Chatting
                </p>
                <div className="flex gap-2 mt-4">
                  <div className="flex-1 text-center py-2 rounded-lg text-sm font-medium" style={{ background: 'rgba(102, 126, 234, 0.2)', color: '#8b9cf7' }}>
                    🔗 Смотреть стрим
                  </div>
                  <div className="flex-1 text-center py-2 rounded-lg text-sm font-medium" style={{ background: 'rgba(255, 255, 255, 0.05)', color: 'rgba(255,255,255,0.5)' }}>
                    📋 MemeLab
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 relative">
        <div className="max-w-2xl mx-auto text-center">
          <div className="glass-card p-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Готовы <span className="text-gradient">автоматизировать</span>?
            </h2>
            <p className="text-white/40 mb-8 max-w-md mx-auto">
              Бесплатно. Настройка за 2 минуты. Работает с Twitch и VK Video.
            </p>
            <button onClick={login} className="btn-glow text-lg">
              Начать бесплатно
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-white/25">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="MemeLab Notify" className="w-6 h-6 rounded-lg" />
            <span>MemeLab Notify v0.1.0</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="https://github.com/batalovmv/stream-alerts" className="hover:text-white/50 transition">
              GitHub
            </a>
            <a href="https://memelab.ru" className="hover:text-white/50 transition">
              memelab.ru
            </a>
          </div>
          <span>© 2026 MemeLab</span>
        </div>
      </footer>
    </div>
  );
}
