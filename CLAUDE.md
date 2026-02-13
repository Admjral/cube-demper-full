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
- **GitHub**: https://github.com/Admjral/cube-demper-full
- **Contains**: frontend + new-backend + sync scripts

### Separate Deployment Repos
После разработки изменения синхронизируются в отдельные репозитории:

#### Frontend
- **Path**: `/Users/adilhamitov/Desktop/Cube Demper/frontend`
- **GitHub**: https://github.com/Admjral/Demper_front
- **Branch**: `master`
- **Deploy**: Railway (service: `frontend`)

#### Backend
- **Path**: `/Users/adilhamitov/Desktop/Cube Demper/new-backend`
- **GitHub**: https://github.com/Admjral/cube-demper-
- **Branch**: `main`
- **Deploy**: Railway (service: `backemd`)

## Tech Stack

### Frontend
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui components
- Zustand (state management)

### Backend
- FastAPI
- PostgreSQL (asyncpg)
- Redis
- Alembic (migrations)
- Playwright (web scraping)

## Deployment (Railway)

### Project: `proud-vision`
Services:
- `frontend` - Next.js app
- `backemd` - FastAPI backend (typo in name, don't change)
- `Postgres` - PostgreSQL database
- `Redis` - Redis cache
- `worker-1`, `worker-2` - Demping workers (2 шарда достаточно для 10-20 юзеров)

### Backend Dockerfile
```dockerfile
# Main backend uses: Dockerfile
# Workers use: Dockerfile.worker
```

### Backend Start Command
```bash
sh -c 'alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port $PORT'
```

### Worker Environment Variables
Each worker needs:
- `INSTANCE_INDEX` - 0 or 1
- `INSTANCE_COUNT` - 2

> Сократили с 4 до 2 воркеров для экономии. 2 воркера достаточно для ~2000 товаров.

## Git Workflow

### Committing to Monorepo
```bash
cd /Users/adilhamitov/Desktop/cube-demper-full
git add <files>
git commit -m "feat: description"
git push origin main
```

### Syncing to Separate Repos
Use `sync.sh` script or manual rsync:

```bash
# Frontend sync
rsync -av --exclude='.git' --exclude='node_modules' --exclude='.next' \
  /Users/adilhamitov/Desktop/cube-demper-full/frontend/ \
  "/Users/adilhamitov/Desktop/Cube Demper/frontend/"

# Backend sync
rsync -av --exclude='.git' --exclude='__pycache__' --exclude='.venv' --exclude='venv' \
  /Users/adilhamitov/Desktop/cube-demper-full/new-backend/ \
  "/Users/adilhamitov/Desktop/Cube Demper/new-backend/"
```

### After Sync - Push to Deployment Repos
```bash
# Frontend
cd "/Users/adilhamitov/Desktop/Cube Demper/frontend"
git add -A
git commit -m "feat: description"
git push origin master

# Backend
cd "/Users/adilhamitov/Desktop/Cube Demper/new-backend"
git add -A
git commit -m "feat: description"
git push origin main
```

## Database Migrations

### Creating New Migration
```bash
cd /Users/adilhamitov/Desktop/cube-demper-full/new-backend
alembic revision -m "description"
```

### Migration Naming Convention
`YYYYMMDDHHMMSS_description.py` (e.g., `20260121100000_add_product_city_prices.py`)

### Important: Migration Chain
Always check `down_revision` points to the latest existing migration. Use:
```bash
alembic heads
alembic history
```

## Key Files

### Backend
- `app/main.py` - FastAPI app entry point
- `app/config.py` - Configuration and env vars
- `app/routers/` - API endpoints
- `app/routers/ai.py` - AI chat + AI Salesman endpoints
- `app/routers/lawyer.py` - AI Lawyer (чат, документы, калькуляторы)
- `app/services/ai_lawyer_service.py` - Сервис юриста (RAG, анализ договоров)
- `app/services/ai_salesman_service.py` - Сервис продажника (upsell, отзывы)
- `app/services/legal_docs_loader.py` - Автозагрузка PDF в RAG при старте
- `app/services/api_parser.py` - Kaspi API integration (sync_orders_to_db, parse_order_details)
- `app/services/kaspi_mc_service.py` - MC GraphQL: заказы, телефоны покупателей
- `app/services/orders_sync_service.py` - Периодический sync заказов (background, каждые 60 мин)
- `app/workers/demper_instance.py` - Worker for price demping
- `migrations/versions/` - Alembic migrations
- `legal_docs/` - PDF документы для RAG (загружаются автоматически при старте)

### Frontend
- `src/app/(dashboard)/` - Dashboard pages (App Router)
- `src/components/` - React components
- `src/hooks/api/` - API hooks (React Query)
- `src/store/` - Zustand stores
- `src/types/api.ts` - TypeScript types

## Common Issues & Fixes

### Multiple Alembic Heads
Fix by updating `down_revision` in the problematic migration to point to correct parent.

### Railway CLI in Non-TTY Mode
Cannot use interactive commands. Use Railway Dashboard for worker configuration.

### Kaspi API Returns Null Fields
Always use fallback values, e.g.:
```python
kaspi_product_id = raw_offer.get("offerId") or raw_offer.get("sku")
```

### Demper Worker не видит товары ("Fetched 0 active products")
Проверь по порядку:
1. `bot_active = TRUE` у товаров? (включён демпинг)
2. `kaspi_stores.is_active = TRUE`?
3. `kaspi_stores.needs_reauth = FALSE`? ← **Частая проблема!**
4. `kaspi_stores.guid IS NOT NULL`? (есть сессия)
5. `products.external_kaspi_id IS NOT NULL`?
6. Текущее время в рабочих часах (`demping_settings.work_hours_*`)?

**Быстрый фикс needs_reauth:**
```sql
UPDATE kaspi_stores SET needs_reauth = FALSE WHERE guid IS NOT NULL;
```

## Git Config
- Email: `hamitov.adil04@gmail.com`
- Username: `Admjral`

## Railway CLI
- Path: `/opt/homebrew/bin/railway`
- To check status: `railway status`
- To view logs: `railway logs -s <service>`

## Direct Database Access
Для прямого доступа к БД Railway без CLI (Claude может использовать это):

```bash
# Получить публичный DATABASE_URL:
/opt/homebrew/bin/railway variables -s Postgres --json 2>&1 | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('DATABASE_PUBLIC_URL',''))"

# Запустить SQL через Python:
python3 -c "
import psycopg2
conn = psycopg2.connect('DATABASE_URL_HERE')
cur = conn.cursor()
cur.execute('SELECT ...')
print(cur.fetchall())
conn.close()
"
```

### Полезные диагностические запросы
```sql
-- Проверить почему воркер не видит товары
SELECT
    COUNT(*) as total_with_demping,
    COUNT(*) FILTER (WHERE ks.is_active = TRUE) as store_active,
    COUNT(*) FILTER (WHERE ks.needs_reauth = FALSE OR ks.needs_reauth IS NULL) as no_reauth_needed,
    COUNT(*) FILTER (WHERE ks.guid IS NOT NULL) as has_session,
    COUNT(*) FILTER (WHERE p.external_kaspi_id IS NOT NULL) as has_external_id
FROM products p
JOIN kaspi_stores ks ON ks.id = p.store_id
WHERE p.bot_active = TRUE;

-- Сбросить needs_reauth если сессия валидна
UPDATE kaspi_stores SET needs_reauth = FALSE WHERE guid IS NOT NULL;

-- Проверить историю цен
SELECT * FROM price_history ORDER BY created_at DESC LIMIT 20;
```

## Important Notes
1. **Never force push** to main/master
2. **VPS — единственный прод** для всех сервисов. Railway — только offers-relay
3. **Migrations автоматические** при старте бэкенда (`alembic upgrade head`)
4. **offers-relay** деплоится отдельно: `cd offers-relay && railway up`

---

## Claude Instructions

### После успешного фикса
Когда пользователь подтверждает что правка заработала — добавь инсайт в секцию "Learned Insights" ниже.

### Управление размером файла
Если CLAUDE.md превышает ~300 строк — сократи устаревшую информацию, оставь только актуальное.

---

## Learned Insights

### Kaspi API
- **Rate Limits**: Offers 8 RPS/IP (бан 403, 10с). Pricefeed 1.5 RPS/аккаунт (бан 429, **30 мин!**). Per-endpoint лимитеры в `rate_limiter.py`
- **Offers API**: 405 с VPS IP → relay через Railway (`/relay/offers`). Fallback → direct
- **Product pages** (`kaspi.kz/shop/p/...`): тоже через relay (`/relay/parse-url`). Используется в юнит-экономике
- **Pricefeed API**: работает напрямую с VPS (KZ IP нужен)
- **REST API** (`kaspi.kz/shop/api/v2/orders`): `X-Auth-Token` header, KZ IP required, `User-Agent` обязателен
- **MC GraphQL**: `mc.shop.kaspi.kz/mc/facade/graphql`, cookies dict + `x-auth-version: 3`, НЕ Relay-схема, телефоны замаскированы
- **Orders Sync**: Фоновая задача в бэкенде (НЕ в воркерах), каждые 60 мин, MC GraphQL → только активные заказы

### City Prices (2026-02-13)
- `KASPI_CITIES` в `schemas/kaspi.py` — НЕ полный список, ~28 городов
- Если city_id не в словаре → fallback на city_name из `store_points` магазина (не 400 ошибка)
- `run-city-demping` принимает `{ city_ids: [...] }` как JSON body (`RunCityDempingRequest`)

### Notification System (2026-02-12)
- **`notification_settings` JSONB** в `users` — `{"orders": true, "price_changes": true, "support": true}`
- Всегда проверять `get_user_notification_settings()` перед отправкой
- Price: после `_record_price_change()` в `demper_instance.py`. Orders: только INSERT в `sync_orders_to_db()`. Support: в `support.py:send_message()`
- Frontend: `iconMap` в `notification-bell.tsx` **должен** совпадать с `getNotificationMeta()` в `use-notifications.ts`

### Authentication
- Login endpoint должен проверять `is_blocked` перед выдачей токена

### Google Gemini API (2026-02-07)
- **API ключ**: Google Cloud Console (не AI Studio), включить "Generative Language API" в restrictions
- **Модели**: `gemini-2.5-flash` (основная), `text-embedding-004` (эмбеддинги для RAG)
- **Ошибка "API key expired"**: Ключ невалиден, проверять через curl перед деплоем

### Legal Docs RAG Loader (2026-02-07)
- **Автозагрузка**: PDF из `legal_docs/` загружаются при старте как background task, идемпотентно (по `title`)
- **pgvector опционален**: На Railway нет pgvector → text search fallback
- **Таблицы**: `legal_documents` (`document_type`, NOT `category`), `legal_articles` (NO `keywords` column)

### Kaspi API Rate Limits (2026-02-08)
- **Offers**: 8 RPS safe (бан 403, 10с, per IP). **Pricefeed**: 1.5 RPS safe (бан 429, **30 мин**, per account!). **Catalog**: без ограничений.
- **Реализация**: Per-endpoint limiters в `rate_limiter.py`, per-merchant для pricefeed, cooldown/pause механизмы
- **Конфиг**: `offers_rps`, `pricefeed_rps`, `pricefeed_cooldown_seconds`, `offers_ban_pause_seconds`

### Bugs Fixed (2026-02-08, consolidated)
- **Demper worker**: TypeError из-за несовпадения сигнатур + единый rate limiter → per-endpoint лимитеры
- **AI Salesman**: category/sales_count не заполнялись, лимит сообщений игнорировался, sent_at=NULL, нет валидации телефона
- **Парсинг телефонов**: dead code в `format_chat_id()`, двойной +7 в MC (10 vs 11 цифр)
- **Deploy repo contamination**: rsync не удаляет лишние файлы → всегда `git status` после rsync
- **Alembic idempotency**: `inspector.get_table_names()` перед `CREATE TABLE` при нескольких таблицах в одной миграции
- **AI Lawyer docs**: KeyError в шаблонах (setdefault), asyncpg JSONB = `json.dumps()`, отсутствующие шаблоны
- **Playwright race condition**: Per-merchant `asyncio.Lock` — параллельные логины в один аккаунт = гарантированный сбой
- **Secret scanning**: НИКОГДА не хардкодить API ключи в публичных репо. Использовать env vars + `None` дефолт

### Frontend Patterns (2026-02-09)
- **Hydration #418**: Использовать `'\u00B7'` вместо `&middot;` в Next.js
- **Mobile-first**: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`, таблицы → `sm:hidden` карточки + `hidden sm:block` таблица
- **Фиксированные ширины**: `w-full sm:w-[140px]`, `h-[250px] sm:h-[400px]`

### Kaspi MC GraphQL (2026-02-09)
- **URL**: `mc.shop.kaspi.kz/mc/facade/graphql`
- **Auth**: cookies как httpx dict (НЕ Cookie header строкой) + `x-auth-version: 3` + `Origin: https://kaspi.kz`
- **НЕ Relay-схема**: нет `edges/node`, нет `first`/`states`/`totalCount`
- **Список заказов**: `merchant.orders.orders(input: { presetFilter: TAB })` → `{total, orders: [...]}`
- **Табы**: `NEW`, `DELIVERY`, `PICKUP`, `SIGN_REQUIRED` — только активные, **нет COMPLETED/ARCHIVE**
- **Поля Order**: `code`, `totalPrice`, `status` (НЕ `state`!), `customer` (объект), `entries` (объект)
- **`creationDate` НЕ существует** в типе Order (есть только в orderDetail)
- **`orderDetail(code: "xxx")`**: работает для получения деталей (customer.phoneNumber, entries, deliveryAddress)
- **`get_active_session(merchant_id)`**: принимает 1 аргумент! Не (user_id, store_id, pool)

### Orders Sync Architecture (2026-02-09)
- MC GraphQL показывает только **активные** заказы → БД накапливает историю со временем
- **Отдельная фоновая задача в бэкенде** (`orders_sync_service.py`), НЕ в воркерах (они уже нагружены offers+pricefeed)
- Цикл каждые 60 мин, `asyncio.create_task()` в `main.py`
- Последовательная обработка магазинов с паузами (2с между магазинами)
- 400 магазинов × 24 запроса = 9,600 req/cycle → ~53 мин при 3 RPS
- `fetch_orders_for_sync()`: шаг 1 = коды из 4 табов, шаг 2 = `orderDetail` для каждого
- Формат конвертируется в Open API совместимый → `sync_orders_to_db()` без изменений

### AI Lawyer Chat (2026-02-09, исправлено)
- **Gemini role mapping**: `"assistant"` → `"model"` (Gemini API не принимает "assistant")
- **Duplicate message**: User message нужно сохранять в history **ПОСЛЕ** `chat()`, не до (иначе Gemini видит его дважды → краш на втором сообщении)

### WAHA Plus на Railway (2026-02-09)
- **Темплейт**: Приватный Docker образ (`devlikeapro/waha-plus`) не деплоится через `railway add --image` — Railway не поддерживает Docker Hub credentials через CLI/GraphQL API (`serviceInstanceUpdate` с `registryCredentials` возвращает `true`, но не применяется). **Решение**: использовать официальный WAHA темплейт на Railway marketplace.
- **Движок NOWEB**: Легче WEBJS (не нужен Chromium), подходит для Railway. Env var: `WHATSAPP_DEFAULT_ENGINE=NOWEB`
- **API Key**: WAHA Plus генерирует `WAHA_API_KEY` при первом старте — нужно добавить в backend env vars (`WAHA_API_KEY`)
- **Internal URL**: `http://waha-plus.railway.internal:3000` (для backend → WAHA коммуникации)
- **Dashboard**: Доступен по public URL с логином `WAHA_DASHBOARD_USERNAME`/`WAHA_DASHBOARD_PASSWORD`
- **Сервис на Railway**: `waha-plus` (имя из темплейта)
- **OCR ловушка**: `dckr_pat_FI...` vs `dckr_pat_Fl...` (заглавная I vs строчная l) — всегда копировать токены текстом, не со скриншотов

### WhatsApp Templates (2026-02-09)
- **JSONB response parsing**: asyncpg возвращает JSONB как raw string. Всегда `json.loads()` при чтении, `json.dumps()` + `::jsonb` при записи
- **Правило**: При изменении Create/Update схемы — **всегда** проверять Response схему и все SQL запросы на согласованность

### Subscription & Billing (2026-02-09)
- **Цены API**: `/billing/plans-v2` уже возвращает тенге (`price_tiyns / 100`). Фронтенд НЕ должен делить повторно — `plan.price.toLocaleString()`, не `(plan.price / 100)`
- **Free plan при регистрации**: `auth.py` создаёт subscription с `plan='free'`, `plan_id=NULL`. Значит `features.plan_code === null` но `has_active_subscription === true`
- **Trial flow**: `POST /billing/activate-trial` — проверяет 3 условия: 1) нет plan_id, 2) merchant_id не использован другим аккаунтом для триала, 3) plan с trial_days > 0
- **Anti-abuse**: Проверка по `kaspi_stores.merchant_id` через JOIN между аккаунтами — один магазин = один триал, вне зависимости от аккаунта
- **SubscriptionGate vs FeatureGate**: `SubscriptionGate` проверяет `has_active_subscription` (есть ли вообще подписка), `FeatureGate` проверяет конкретную фичу в `features[]`
- **Админ endpoints**: `POST /admin/users/{id}/subscription/cancel`, `ends_at` param в AssignSubscriptionRequest (ISO datetime, приоритет над `days`)

### WhatsApp OTP верификация телефона (2026-02-09)
- **Флоу**: Регистрация (email+пароль+телефон) → бэкенд создаёт юзера + отправляет 6-значный OTP в WhatsApp → фронтенд перенаправляет на `/verify-phone` → юзер вводит код → доступ к дашборду
- **Регистрация теперь возвращает JWT**: Раньше возвращала `UserResponse`, теперь `Token` — автологин сразу после регистрации (чтобы можно было вызвать `/auth/send-otp` и `/auth/verify-otp` с токеном)
- **signUp() тоже возвращает AuthResponse**: Фронтенд `auth.ts:signUp()` теперь делает `register` → получает токен → `GET /me` → возвращает `AuthResponse` (как `signIn`), а не просто `User`
- **OTP rate limit**: Максимум 1 код в 60 секунд на юзера (проверка по `created_at` в `phone_verifications`). 5 попыток на код, истекает через 5 минут
- **Обратная совместимость для старых юзеров**: Гард в dashboard layout: `user.phone && !user.phone_verified` → редирект. Юзеры с `phone=NULL` (легаси) проходят свободно
- **Middleware**: `/verify-phone` требует auth_token но НЕ редиректит на дашборд (в отличие от `/login`/`/register` которые редиректят залогиненных)
- **dependencies.py**: `get_current_user()` SQL запрос **должен** включать `phone, phone_verified` — иначе `current_user.get('phone')` всегда `None` и OTP endpoints не работают
- **WAHA отправка**: `get_waha_service().send_text(phone, "Cube Demper: Ваш код подтверждения: XXXXXX")` — используется существующий singleton из `waha_service.py`
