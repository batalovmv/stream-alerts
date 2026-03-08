# MemeLab Notify

Автоматические анонсы стримов для Telegram. Кодовая база уже содержит интеграцию с MAX, но она пока выключена до получения рабочего bot token и доступа на стороне MAX.

**Прод:** `https://notify.memelab.ru`

## Что сейчас умеет сервис

- Принимает webhook-события `stream.online`, `stream.update`, `stream.offline` от MemeLab backend
- Отправляет, обновляет и при необходимости удаляет анонсы через BullMQ worker
- Управляет подключением Telegram-каналов и групп через `@MemelabNotifyBot`
- Позволяет настраивать платформы, кнопки, тип картинки и кастомный Telegram-бот для отправки анонсов
- Хранит состояние в PostgreSQL и Redis, использует Prisma и Redis-backed middleware

## Текущий статус платформ

- `Telegram`: основной и рабочий сценарий
- `MAX`: реализация провайдера есть в репозитории, но активация пока выключена в UI и зависит от `MAX_BOT_TOKEN`

## Стек

| Слой | Технология |
|------|-----------|
| Backend | Node.js, Express, TypeScript |
| ORM | Prisma |
| БД | PostgreSQL |
| Очереди | Redis + BullMQ |
| Frontend | React 19, Vite, TypeScript |
| Стили | Tailwind CSS + `@memelabui/ui` |
| Monitoring | Sentry |

## Быстрый старт

### Требования

- Node.js 20+
- pnpm 9+
- PostgreSQL
- Redis

### Установка

```bash
pnpm install
```

### Переменные окружения

```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
```

PowerShell equivalent:

```powershell
Copy-Item apps/backend/.env.example apps/backend/.env
Copy-Item apps/frontend/.env.example apps/frontend/.env
```

Минимально нужны:

- `DATABASE_URL`
- `REDIS_URL`
- `MEMELAB_API_URL`
- `JWT_COOKIE_NAME`
- `TELEGRAM_BOT_TOKEN`
- `WEBHOOK_SECRET`

Для кастомных Telegram-ботов дополнительно нужен `BOT_TOKEN_ENCRYPTION_KEY`.

### Локальная инфраструктура через Docker Compose

`docker-compose.yml` поднимает `postgres` и `redis`, но перед запуском ожидает:

- `POSTGRES_PASSWORD`
- `REDIS_PASSWORD`

Пример:

```bash
POSTGRES_PASSWORD=memelab REDIS_PASSWORD=memelab docker compose up -d postgres redis
```

PowerShell equivalent:

```powershell
$env:POSTGRES_PASSWORD='memelab'
$env:REDIS_PASSWORD='memelab'
docker compose up -d postgres redis
```

Если Docker Compose не используется, достаточно поднять PostgreSQL и Redis любым другим способом.

### Подготовка базы

```bash
cd apps/backend
npx prisma migrate dev
npx prisma generate
cd ../..
```

### Запуск

```bash
pnpm dev
```

Полезные команды:

```bash
pnpm build
pnpm test
pnpm lint
pnpm ai:check
```

## Как устроен пользовательский flow

1. Пользователь логинится через основной MemeLab и попадает в dashboard
2. В dashboard привязывает Telegram-аккаунт через deep link в `@MemelabNotifyBot`
3. В боте использует `/connect`, выбирает канал или группу через native picker Telegram
4. MemeLab backend присылает webhook о стриме, а worker публикует или обновляет анонс

## Структура репозитория

```text
memelab-notify/
├── .ai/                # Shared AI context, tasks, decisions, handoffs
├── apps/
│   ├── backend/        # Express API, Prisma, BullMQ worker, Telegram/MAX providers
│   └── frontend/       # React dashboard
├── docs/               # Product and architecture docs
├── scripts/            # Repo automation, including AI CLI
├── AGENTS.md           # Codex entry guide
├── CLAUDE.md           # Opus entry guide
└── README.md
```

## Документация

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/CONCEPT.md](docs/CONCEPT.md)
- [AGENTS.md](AGENTS.md)
- [CLAUDE.md](CLAUDE.md)
- [.ai/README.md](.ai/README.md)

## Лицензия

Proprietary. MemeLab 2026.
