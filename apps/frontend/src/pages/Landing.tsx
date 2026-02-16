export function Landing() {
  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 bg-surface/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-glow-purple" />
            <span className="text-lg font-bold">MemeLab Notify</span>
          </div>
          <nav className="flex items-center gap-6">
            <a href="#features" className="text-sm text-white/60 hover:text-white transition">
              Возможности
            </a>
            <a href="#how-it-works" className="text-sm text-white/60 hover:text-white transition">
              Как это работает
            </a>
            <button className="btn-glow text-sm !px-4 !py-2">
              Войти через MemeLab
            </button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/20 text-accent text-sm mb-8">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Telegram & MAX
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold leading-tight mb-6">
            <span className="text-gradient">Анонсы стримов</span>
            <br />
            автоматически
          </h1>

          <p className="text-lg text-white/50 max-w-2xl mx-auto mb-10">
            Стрим начался — анонс с превью уже в вашем Telegram-канале.
            Настройте один раз, дальше всё работает само.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="btn-glow text-lg">
              Начать бесплатно
            </button>
            <button className="btn-secondary text-lg">
              Как это работает?
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-8 mt-16 max-w-lg mx-auto">
            <div>
              <div className="text-3xl font-bold text-gradient">2 мин</div>
              <div className="text-sm text-white/40 mt-1">настройка</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-gradient">&lt;5 сек</div>
              <div className="text-sm text-white/40 mt-1">доставка</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-gradient">2+</div>
              <div className="text-sm text-white/40 mt-1">мессенджера</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            Всё что нужно для <span className="text-gradient">анонсов</span>
          </h2>

          <div className="grid md:grid-cols-3 gap-6">
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
                desc: 'Стрим закончился — анонс исчезает. Канал всегда чистый.',
              },
              {
                icon: '📱',
                title: 'Telegram & MAX',
                desc: 'Поддержка двух мессенджеров. Подключайте несколько каналов одновременно.',
              },
              {
                icon: '🤖',
                title: 'Управление через бота',
                desc: 'Настройки, тестовые анонсы, статус — всё через бота, без открытия сайта.',
              },
              {
                icon: '⚡',
                title: 'Мгновенная доставка',
                desc: 'Меньше 5 секунд от начала стрима до анонса в канале.',
              },
            ].map((feature) => (
              <div key={feature.title} className="glass-card p-6 hover:border-accent/20 transition-all duration-300">
                <div className="text-3xl mb-4">{feature.icon}</div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-white/50">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            Три шага к <span className="text-gradient">автоматизации</span>
          </h2>

          <div className="space-y-8">
            {[
              {
                step: '01',
                title: 'Авторизуйтесь',
                desc: 'Войдите через MemeLab аккаунт. Ваш канал и настройки подтянутся автоматически.',
              },
              {
                step: '02',
                title: 'Добавьте бота',
                desc: 'Добавьте @MemelabNotifyBot как администратора в ваш Telegram-канал или MAX-группу.',
              },
              {
                step: '03',
                title: 'Готово!',
                desc: 'Теперь при каждом начале стрима бот автоматически отправит красивый анонс с превью.',
              },
            ].map((item) => (
              <div key={item.step} className="glass-card p-6 flex items-start gap-6">
                <div className="text-4xl font-extrabold text-gradient shrink-0">{item.step}</div>
                <div>
                  <h3 className="text-xl font-semibold mb-1">{item.title}</h3>
                  <p className="text-white/50">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">
            Готовы <span className="text-gradient">автоматизировать</span> анонсы?
          </h2>
          <p className="text-white/50 mb-8">
            Бесплатно. Настройка за 2 минуты. Работает с Twitch и VK Video.
          </p>
          <button className="btn-glow text-lg">
            Начать бесплатно
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-sm text-white/30">
          <span>MemeLab Notify 2026</span>
          <a href="https://memelab.ru" className="hover:text-white/60 transition">
            memelab.ru
          </a>
        </div>
      </footer>
    </div>
  );
}
