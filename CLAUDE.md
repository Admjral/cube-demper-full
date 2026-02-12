# Claude Code Instructions for Cube Demper Project

## Project Overview
Cube Demper — сервис для автоматического демпинга цен на Kaspi.kz маркетплейсе.

## Architecture

### Primary Production — VPS (`cube-demper.shop`)
- **Сервер**: ps.kz (Казахстан), IP `195.93.152.71`, Ubuntu, Docker Compose
- **Зачем VPS**: Kaspi REST API + Offers API требуют KZ IP
- **7 сервисов**: frontend, backend, postgres, redis, worker-1, worker-2, waha
- **Домен**: `cube-demper.shop` (Cloudflare DNS → A record → VPS IP), SSL через nginx + Let's Encrypt
- **SSH**: `/opt/homebrew/Cellar/sshpass/1.06/bin/sshpass -p '<пароль>' ssh ubuntu@195.93.152.71`
- **Структура на VPS**: `/home/ubuntu/cube-demper/` — `docker-compose.yml`, `.env`, `new-backend/`, `frontend/`, `nginx/`

### Railway — fallback + вспомогательные сервисы

#### Project: `proud-vision` (основной, НЕ используется как прод)
- `frontend`, `backemd` (typo, не менять), `Postgres`, `Redis`, `worker-1`, `worker-2`
- `waha-plus` — WhatsApp (NOWEB engine, OTP сессия: `default`)

#### Project: `offers-relay` (отдельный!)
- **GitHub**: `Admjral/offers-relay` (private)
- **Назначение**: Проксирует запросы к Kaspi Offers API (`/yml/offer-view/offers/{id}`)
- **Зачем**: VPS IP заблокирован Kaspi (405), Railway IP работает
- **URL**: `https://offers-relay-production.up.railway.app`
- **Auth**: Bearer token через `RELAY_SECRET`
- **Config в бэкенде**: `offers_relay_url` + `offers_relay_secret` в `config.py`
- **Fallback**: В `parse_product_by_sku()` — сначала relay, при ошибке → direct

## Repository Structure

### Main Monorepo (Development)
- **Path**: `/Users/adilhamitov/Desktop/cube-demper-full`
- **GitHub**: `Admjral/cube-demper-full`

### Deploy Repos (для Railway автодеплоя)
| Repo | Path | GitHub | Branch |
|------|------|--------|--------|
| Frontend | `/Users/adilhamitov/Desktop/Cube Demper/frontend` | `Admjral/Demper_front` | `master` |
| Backend | `/Users/adilhamitov/Desktop/Cube Demper/new-backend` | `Admjral/cube-demper-` | `main` |

## Tech Stack
- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind, shadcn/ui, Zustand
- **Backend**: FastAPI, PostgreSQL (asyncpg), Redis, Alembic, Playwright
- **AI**: Google Gemini (`gemini-2.5-flash`, embeddings: `text-embedding-004`)
- **WhatsApp**: WAHA Plus (NOWEB engine)

## Deploy Workflow

### VPS (основной прод)
```bash
# 1. Tar
tar czf /tmp/backend.tar.gz --exclude='__pycache__' --exclude='.venv' --exclude='.git' new-backend/
tar czf /tmp/frontend.tar.gz --exclude='node_modules' --exclude='.next' --exclude='.git' frontend/
# 2. Upload
sshpass -p '<пароль>' scp /tmp/backend.tar.gz /tmp/frontend.tar.gz ubuntu@195.93.152.71:/tmp/
# 3. Extract + build + restart
ssh ubuntu@195.93.152.71 'cd /home/ubuntu/cube-demper && tar xzf /tmp/backend.tar.gz && tar xzf /tmp/frontend.tar.gz && docker compose build backend worker-1 worker-2 frontend && docker compose up -d backend worker-1 worker-2 frontend'
```
Миграции выполняются автоматически при старте (`alembic upgrade head` в Dockerfile CMD).

### Railway (вторичный)
```bash
# rsync → deploy repos → git push
rsync -av --exclude='.git' --exclude='__pycache__' --exclude='.venv' new-backend/ "/Users/adilhamitov/Desktop/Cube Demper/new-backend/"
rsync -av --exclude='.git' --exclude='node_modules' --exclude='.next' frontend/ "/Users/adilhamitov/Desktop/Cube Demper/frontend/"
# git add + commit + push в каждом deploy repo
```

## Key Files

### Backend
- `app/main.py` — FastAPI entry point
- `app/config.py` — Все конфиги и env vars
- `app/workers/demper_instance.py` — Worker демпинга цен
- `app/services/api_parser.py` — Kaspi API: offers, sync_orders_to_db, parse_product_by_sku
- `app/services/notification_service.py` — Уведомления (price, orders, support)
- `app/services/orders_sync_service.py` — Фоновый sync заказов (каждые 60 мин)
- `app/services/kaspi_orders_api.py` — Kaspi REST API (X-Auth-Token, реальные телефоны)
- `app/services/kaspi_mc_service.py` — MC GraphQL (заказы, телефоны замаскированы)
- `app/routers/support.py` — Техподдержка (WebSocket + HTTP)
- `app/routers/notifications.py` — CRUD уведомлений + settings

### Frontend
- `src/app/(dashboard)/` — Dashboard pages
- `src/hooks/use-notifications.ts` — Уведомления (query + mutations)
- `src/components/notifications/notification-bell.tsx` — Колокольчик с иконками
- `src/lib/i18n.ts` — Переводы (ru/kz)
- `src/lib/api.ts` — API клиент

## Database Migrations
```bash
cd /Users/adilhamitov/Desktop/cube-demper-full/new-backend
alembic revision -m "description"  # Именование: YYYYMMDDHHMMSS_description.py
alembic heads  # Проверить что нет multiple heads
```

## Common Issues

### Demper Worker не видит товары
1. `bot_active = TRUE`? 2. `kaspi_stores.is_active = TRUE`? 3. `needs_reauth = FALSE`? ← **Частая!**
4. `guid IS NOT NULL`? 5. `external_kaspi_id IS NOT NULL`? 6. Рабочие часы?
```sql
UPDATE kaspi_stores SET needs_reauth = FALSE WHERE guid IS NOT NULL;
```

### asyncpg + JSONB
- **Запись**: `json.dumps(data, ensure_ascii=False, default=str)` — asyncpg НЕ принимает dict
- **Чтение**: `json.loads(row['col']) if isinstance(row['col'], str) else row['col']`

## Git Config
- Email: `hamitov.adil04@gmail.com`, Username: `Admjral`
- Railway CLI: `/opt/homebrew/bin/railway`

## Important Notes
1. **Never force push** to main/master
2. **Always sync both repos** after changes (или деплой на VPS)
3. **Migrations автоматические** при старте бэкенда
4. **VPS — основной прод**, Railway — fallback/relay

---

## Claude Instructions
- После успешного фикса — добавь инсайт в Learned Insights
- Если CLAUDE.md > ~300 строк — сократи устаревшее

---

## Learned Insights

### Kaspi API
- **Rate Limits**: Offers 8 RPS/IP (бан 403, 10с). Pricefeed 1.5 RPS/аккаунт (бан 429, **30 мин!**). Per-endpoint лимитеры в `rate_limiter.py`
- **Offers API**: 405 с датацентр IP → relay через Railway (`offers-relay` проект)
- **REST API** (`kaspi.kz/shop/api/v2/orders`): `X-Auth-Token` header, KZ IP required, `User-Agent` обязателен
- **MC GraphQL**: `mc.shop.kaspi.kz/mc/facade/graphql`, cookies dict + `x-auth-version: 3`, НЕ Relay-схема, телефоны замаскированы
- **Orders Sync**: Фоновая задача в бэкенде (НЕ в воркерах), каждые 60 мин, MC GraphQL → только активные заказы

### Notification System (2026-02-12)
- **`notification_settings` JSONB** в `users` — `{"orders": true, "price_changes": true, "support": true}`
- Всегда проверять `get_user_notification_settings()` перед отправкой
- Price: после `_record_price_change()` в `demper_instance.py`. Orders: только INSERT в `sync_orders_to_db()`. Support: в `support.py:send_message()`
- Frontend: `iconMap` в `notification-bell.tsx` **должен** совпадать с `getNotificationMeta()` в `use-notifications.ts`

### Gemini API
- API ключ из Google Cloud Console (НЕ AI Studio), включить "Generative Language API"
- Role mapping: `"assistant"` → `"model"`. User message сохранять ПОСЛЕ `chat()`, не до

### Frontend Patterns
- Hydration: `'\u00B7'` вместо `&middot;`, Zustand persist `skipHydration: true`, next-themes без `dark:hidden` на Image
- `useSearchParams()` требует `<Suspense>` в Next.js 14+

### CORS & Middleware
- `BaseHTTPMiddleware` может проглотить CORS-заголовки → pure ASGI middleware
- Playwright endpoints: всегда `except Exception` catch-all

### WhatsApp / WAHA
- OTP сессия: `config.py:waha_otp_session = "default"` (77027410732, Cube Development)
- Регистрация возвращает JWT (автологин) → OTP в WhatsApp → `/verify-phone`
- `get_current_user()` SQL обязан включать `phone, phone_verified`

### DB
- `products.kaspi_sku` (НЕ `sku`). `kaspi_stores` ON CONFLICT НЕ обновляет `user_id`
- FK: `phone_verifications.user_id` ON DELETE CASCADE, `subscriptions.assigned_by` ON DELETE SET NULL
- Alembic: `ba10cb14a230` и `6ce6a0fa5853` оба `down_revision = None` — не трогать
