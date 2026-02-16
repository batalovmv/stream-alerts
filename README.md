# MemeLab Notify

Автоматические уведомления о стримах в Telegram и MAX.

**notify.memelab.ru**

---

## Что это

MemeLab Notify — сервис, который автоматически отправляет красивые анонсы в Telegram-каналы и MAX-группы когда стример начинает трансляцию. Стрим начался — анонс уже в канале.

## Как работает

1. Стример авторизуется через MemeLab
2. Добавляет @MemelabNotifyBot в свой Telegram-канал/MAX-группу
3. Когда стрим начинается — бот автоматически постит анонс с превью
4. После завершения стрима — анонс удаляется (опционально)

## Возможности

- **Мультиплатформенность** — Telegram, MAX (расширяемо)
- **Красивые анонсы** — фото превью, название стрима, кнопки
- **Настраиваемые шаблоны** — свой текст, свой стиль
- **Несколько каналов** — один стример, много каналов
- **Управление через бота** — без захода на сайт
- **Автоудаление** — после стрима анонс исчезает

## Стек

| Слой | Технология |
|------|-----------|
| Backend | Node.js, Express, TypeScript |
| ORM | Prisma |
| БД | PostgreSQL |
| Очереди | Redis + BullMQ |
| Frontend | React, Vite, TypeScript |
| Стили | Tailwind CSS |
| Telegram | Native fetch (Bot API) |
| MAX | @maxhub/max-bot-api |

## Запуск

```bash
# Установка зависимостей
pnpm install

# Настройка окружения
cp apps/backend/.env.example apps/backend/.env
# Заполнить переменные

# База данных
cd apps/backend
npx prisma migrate dev
npx prisma generate

# Запуск в dev режиме
pnpm dev
```

## Структура

```
memelab-notify/
├── apps/
│   ├── backend/        # Express API + Telegram/MAX боты
│   └── frontend/       # React SPA (dashboard)
├── docs/               # Документация
│   ├── CONCEPT.md      # Концепция продукта
│   └── ARCHITECTURE.md # Техническая архитектура
├── CLAUDE.md           # Инструкции для AI-ассистентов
└── README.md
```

## Документация

- [Концепция продукта](docs/CONCEPT.md)
- [Архитектура](docs/ARCHITECTURE.md)

## Лицензия

Proprietary. MemeLab 2026.
