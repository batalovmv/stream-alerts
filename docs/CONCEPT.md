# MemeLab Notify - Product Concept

Last updated: 2026-03-09

## Problem

Streamers still lose audience around stream start for predictable reasons:

1. Platform push notifications are unreliable or ignored
2. Manual announcement posting is repetitive and easy to forget
3. Audience communication happens in messengers, not only on the streaming platform

## Solution

MemeLab Notify automatically posts stream announcements to messenger chats when a MemeLab-connected streamer goes live, updates those announcements during the stream, and can remove them after the stream ends.

The service is opinionated:

- one dashboard for configuration
- one Telegram bot for linking chats and managing them
- asynchronous delivery through a queue
- defaults that work without heavy setup

## Current Product Scope

### Live today

- Login through the main MemeLab platform
- Telegram account linking through `@MemelabNotifyBot`
- Chat connection through Telegram native chat picker and `/connect`
- Automatic handling of `stream.online`, `stream.update`, `stream.offline`
- Per-streamer settings for platforms, inline buttons, photo type, and default template
- Per-chat enable/disable, custom template override, and delete-after-end
- Test announcement sending
- Optional custom Telegram bot for announcement delivery

### In code, but not enabled for users yet

- MAX provider and API integration

Current blocker:

- activation depends on real MAX bot access and `MAX_BOT_TOKEN`
- frontend add-chat flow intentionally stays Telegram-only until that is available

## Primary Users

### Streamers

- use MemeLab as their main account and channel identity
- maintain Telegram channels or groups for audience communication
- want zero-friction announcement automation

### Viewers

- follow streamers through messenger channels and groups
- want a clear “stream started” signal with a direct watch link

## Product Principles

### 1. Setup should feel short

The user should not manually paste chat IDs or configure a queue. Login, link Telegram, run `/connect`, and pick a chat.

### 2. Delivery should be reliable

Webhook handlers must stay fast. Delivery, retries, edits, and deletes belong to the queue worker.

### 3. Defaults should already look usable

Default text, buttons, and preview image should be good enough before any customization.

### 4. Advanced customization should stay optional

Custom buttons, photo type, platform URLs, and custom Telegram bot are power-user features, not a requirement for activation.

## Core Features

| Feature | Status | Notes |
|--------|--------|-------|
| MemeLab auth | Active | Uses main MemeLab token and profile sync |
| Telegram linking | Active | Deep link + bot handshake |
| Connect Telegram chat | Active | `/connect` + native chat picker |
| Auto announce on stream start | Active | `stream.online` |
| Update existing announcement | Active | `stream.update` |
| Delete announcement after stream | Active | Optional per chat |
| Custom template | Active | Global + per-chat override |
| Custom buttons | Active | Streamer-level |
| Photo type selector | Active | Preview, box-art fallback, none |
| Custom Telegram bot | Active | Optional advanced setting |
| MAX announcements | Dormant | Code present, waiting for activation |

## User Flow

### First-time setup

```text
notify.memelab.ru
  -> Login through MemeLab
  -> Open dashboard
  -> Link Telegram account
  -> Open @MemelabNotifyBot
  -> Run /connect
  -> Pick channel or group from Telegram native picker
  -> Channel appears in dashboard
```

### Stream lifecycle

```text
MemeLab sends stream.online
  -> Notify enqueues delivery
  -> Worker posts announcement

MemeLab sends stream.update
  -> Notify enqueues update
  -> Worker edits existing message

MemeLab sends stream.offline
  -> Notify enqueues cleanup
  -> Worker optionally deletes message
```

## Announcement Shape

Default announcement includes:

- stream started marker
- streamer name
- stream title
- game or category
- primary watch link
- MemeLab link when available

Available template data includes:

- `streamer_name`
- `stream_title`
- `game_name`
- `stream_url`
- `memelab_url`
- per-platform URLs
- `start_time`
- `start_date`
- `viewer_count`
- `twitch_login`
- `channel_slug`

## Non-goals Right Now

- Manual chat ID onboarding in the main UX
- A separate global client-state store in frontend
- Provider-specific business logic leaking into core announcement flow
- Enabling MAX in UI before backend access is actually available

## Near-Term Roadmap

1. Enable MAX once real bot access and token provisioning are available
2. Expand analytics and delivery visibility around sent/failed announcements
3. Improve channel-level management inside bot flows without duplicating dashboard logic
