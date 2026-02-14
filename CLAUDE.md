# Claude Code Instructions for Cube Demper Project

## Project Overview
Cube Demper — сервис для автоматического демпинга цен на Kaspi.kz маркетплейсе.

## Architecture

### Primary Production — VPS (`cube-demper.shop`)
- **Сервер**: ps.kz (Казахстан), IP `195.93.152.71`, Ubuntu, Docker Compose
- **Зачем VPS**: Kaspi REST API + Pricefeed API требуют KZ IP
- **7 сервисов**: frontend, backend, postgres, redis, worker-1, worker-2, waha
- **Домен**: `cube-demper.shop` (Cloudflare DNS → A record → VPS IP), SSL через nginx + Let's Encrypt
- **SSH**: `/opt/homebrew/Cellar/sshpass/1.06/bin/sshpass -p '<пароль>' ssh ubuntu@195.93.152.71`
- **Структура на VPS**: `/home/ubuntu/cube-demper/` — `docker-compose.yml`, `.env`, `new-backend/`, `frontend/`, `nginx/`
- **Все сервисы на VPS**, кроме offers-relay (см. ниже)

### Railway — ТОЛЬКО offers-relay

#### Project: `offers-relay` (единственный активный на Railway)
- **GitHub**: `Admjral/offers-relay` (private), деплой через `railway up` из `/offers-relay/`
- **Назначение**: Проксирует запросы к Kaspi, которые блокируются с VPS IP
- **Эндпоинты**:
  - `POST /relay/offers` — Kaspi Offers API (`/yml/offer-view/offers/{id}`), конкуренты
  - `POST /relay/parse-url` — Kaspi product page HTML (для юнит-экономики `parse-url`)
- **URL**: `https://offers-relay-production.up.railway.app`
- **Auth**: Bearer token через `RELAY_SECRET`
- **Config в бэкенде**: `offers_relay_url` + `offers_relay_secret` в `config.py`
- **Fallback**: VPS бэкенд сначала пробует relay, при ошибке → direct запрос

#### Project: `proud-vision` (НЕ используется как прод, только WAHA)
- `waha-plus` — WhatsApp (NOWEB engine, OTP сессия: `default`)
- Остальные сервисы (`frontend`, `backemd`, workers) — неактивны, прод на VPS

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
- `app/main.py` — FastAPI entry point, background tasks startup
- `app/config.py` — Все конфиги и env vars
- `app/workers/demper_instance.py` — Worker демпинга цен (1457 строк)
- `app/services/api_parser.py` — Kaspi API: offers, sync_orders_to_db, parse_product_by_sku, sync_product
- `app/services/ai_salesman_service.py` — ИИ Продажник (handle_incoming_message + process_order_for_upsell)
- `app/services/ai_lawyer_service.py` — ИИ-Юрист (RAG + Gemini chat)
- `app/services/notification_service.py` — Уведомления (price, orders, support)
- `app/services/orders_sync_service.py` — Фоновый sync заказов (каждые 8 мин)
- `app/services/preorder_checker.py` — Фоновая проверка предзаказов (каждые 5 мин)
- `app/services/kaspi_orders_api.py` — Kaspi REST API (X-Auth-Token, реальные телефоны)
- `app/services/kaspi_mc_service.py` — MC GraphQL (заказы, телефоны замаскированы)
- `app/services/kaspi_auth_service.py` — Playwright авторизация Kaspi MC
- `app/services/waha_service.py` — WAHA WhatsApp API client (singleton)
- `app/services/invoice_merger.py` — Склейка PDF-накладных
- `app/routers/kaspi.py` — Магазины, товары, демпинг, аналитика, city-prices (1700+ строк)
- `app/routers/whatsapp.py` — WhatsApp: сессии, рассылки, шаблоны, контакты, webhook (30 endpoints)
- `app/routers/ai.py` — ИИ Продажник endpoints (settings, stats, history, process-order)
- `app/routers/lawyer.py` — ИИ-Юрист (chat, calculators, document generation)
- `app/routers/unit_economics.py` — Юнит-экономика (calculate, parse-url, saved calculations)
- `app/routers/niches.py` — Поиск ниш (categories, products, stats)
- `app/routers/preorders.py` — CRUD предзаказов
- `app/routers/invoices.py` — Склейка накладных
- `app/routers/support.py` — Техподдержка (WebSocket + HTTP)
- `app/routers/billing.py` — Тарифы, подписки, аддоны
- `app/routers/admin.py` — Админка (users, stats, partners, stores)
- `app/routers/auth.py` — Регистрация, логин, OTP, сброс пароля
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
2. **VPS — единственный прод** для всех сервисов. Railway — только offers-relay
3. **Migrations автоматические** при старте бэкенда (`alembic upgrade head`)
4. **offers-relay** деплоится отдельно: `cd offers-relay && railway up`

---

## Claude Instructions
- После успешного фикса — добавь инсайт в Learned Insights
- Если CLAUDE.md > ~300 строк — сократи устаревшее

---

## Learned Insights

### Kaspi API
- **Rate Limits**: Offers 8 RPS/IP (бан 403, 10с). Pricefeed 1.5 RPS/аккаунт (бан 429, **30 мин!**). Per-endpoint лимитеры в `rate_limiter.py`
- **Offers API**: 405 с VPS IP → relay через Railway (`/relay/offers`). Fallback → direct
- **Product pages** (`kaspi.kz/shop/p/...`): тоже через relay (`/relay/parse-url`). Используется в юнит-экономике
- **Pricefeed API**: работает напрямую с VPS (KZ IP нужен)
- **REST API** (`kaspi.kz/shop/api/v2/orders`): `X-Auth-Token` header, KZ IP required, `User-Agent` обязателен
- **MC GraphQL**: `mc.shop.kaspi.kz/mc/facade/graphql`, cookies dict + `x-auth-version: 3`, НЕ Relay-схема, телефоны замаскированы
- **Orders Sync**: Фоновая задача в бэкенде (НЕ в воркерах), каждые 8 мин (480s), REST API first → MC GraphQL fallback

### City Prices (2026-02-13)
- `KASPI_CITIES` в `schemas/kaspi.py` — НЕ полный список, ~28 городов
- Если city_id не в словаре → fallback на city_name из `store_points` магазина (не 400 ошибка)
- `run-city-demping` принимает `{ city_ids: [...] }` как JSON body (`RunCityDempingRequest`)

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
- **AI Salesman auto-reply**: Webhook `POST /whatsapp/webhook` → `handle_incoming_message()` → Gemini → WAHA send. Только входящие (`fromMe=false`), `asyncio.create_task()` чтобы не блокировать webhook
- Legacy эндпоинты `/session/create` (singular) остались, фронтенд использует `/sessions` (plural)
- WAHA статус в webhook сохраняется как `WORKING` (raw), а `normalize_waha_status()` маппит в `connected` — несоответствие в разных местах

### DB
- `products.kaspi_sku` (НЕ `sku`). `kaspi_stores` ON CONFLICT НЕ обновляет `user_id`
- FK: `phone_verifications.user_id` ON DELETE CASCADE, `subscriptions.assigned_by` ON DELETE SET NULL
- Alembic: `ba10cb14a230` и `6ce6a0fa5853` оба `down_revision = None` — не трогать

### Full Module Audit (2026-02-14)

**12 модулей — статус:**

| # | Модуль | Роутер | Статус | Ключевые проблемы |
|---|--------|--------|--------|-------------------|
| 1 | Демпинг цен | `workers/demper_instance.py` | ✅ 94% | `sync_store_sessions()` = TODO placeholder; `_process_city_prices` и `_process_product_cities` могут конфликтовать |
| 2 | Аналитика | `routers/kaspi.py` | ✅ 90% | N+1 subquery в `get_store_analytics()`; UTC вместо KZ timezone |
| 3 | Поиск ниш | `routers/niches.py` | ⚠️ 75% | Данные статичные (нет sync с Kaspi); комиссия hardcoded 12% (неточно); медленные запросы |
| 4 | Юнит-экономика | `routers/unit_economics.py` | ✅ 93% | Relay работает; VAT toggle не влияет на комиссию; subcategory matching через substring |
| 5 | Предзаказы | `routers/preorders.py` | ✅ OK | Background checker каждые 5 мин; нет отдельного endpoint для `pre_order_days` |
| 6 | WhatsApp | `routers/whatsapp.py` | ✅ OK | 30 эндпоинтов; broadcasts с anti-spam delay 15-30с; legacy /session/create рядом с /sessions |
| 7 | ИИ Продажник | `services/ai_salesman_service.py` + `routers/ai.py` | ✅ OK | `handle_incoming_message()` для входящих; `process_order_for_upsell()` для заказов (ручной); нет dedup входящих |
| 8 | Заказы | `services/orders_sync_service.py` | ✅ OK | Sync каждые 8 мин; REST API first → MC GraphQL fallback; нет GET /orders endpoint |
| 9 | Склейка накладных | `routers/invoices.py` | ✅ 100% | Чисто, без проблем |
| 10 | Интеграции Kaspi | `routers/kaspi.py` + `services/kaspi_auth_service.py` | ⚠️ | Race condition в SMS verify (store limit не перепроверяется); ON CONFLICT не обновляет user_id |
| 11 | ИИ-Юрист | `routers/lawyer.py` + `services/ai_lawyer_service.py` | ✅ OK | RAG через Gemini + legal_docs; pgvector нет → text search fallback |
| 12 | Техподдержка | `routers/support.py` | ⚠️ | WebSocket + HTTP; 3 определения `/me` (dead code); нет ownership check при отправке сообщений |

**Доп. модули:**
- **Auth** (`routers/auth.py`): ✅ OK. OTP 6 цифр, 5 мин expiry, 60с cooldown. Password reset = TODO (email не отправляется)
- **Billing** (`routers/billing.py`): ⚠️ TipTopPay не интегрирован (подписки без оплаты). `plan_id = NULL` для free плана
- **Admin** (`routers/admin.py`): ✅ OK. Workers status = TODO (всегда `running_workers: 0`)

**Dead code найден:**
- `services/kaspi_auth_complete_example.py`, `kaspi_auth_usage_example.py`, `test_kaspi_auth.py` — example/test файлы
- `services/railway_waha_service.py` — не используется (WAHA в Docker, не Railway)
- `routers/support.py` строки 134-156 — два пустых определения `/me` перед реальным
