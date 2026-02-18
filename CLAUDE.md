# Claude Code Instructions for Cube Demper Project

## Project Overview
Cube Demper — сервис для автоматического демпинга цен на Kaspi.kz маркетплейсе.

## Architecture

### Primary Production — VPS (`cube-demper.shop`)
- **Сервер**: ps.kz (Казахстан), IP `77.243.80.24`, Ubuntu, Docker Compose
- **Зачем VPS**: Kaspi REST API + Pricefeed API требуют KZ IP
- **7 сервисов**: frontend, backend, postgres, redis, worker-1, worker-2, waha
- **Домен**: `cube-demper.shop` (Cloudflare DNS → A record → VPS IP), SSL через nginx + Let's Encrypt
- **SSH**: `/opt/homebrew/Cellar/sshpass/1.06/bin/sshpass -p '<пароль>' ssh ubuntu@77.243.80.24`
- **Структура на VPS**: `/home/ubuntu/cube-demper/` — `docker-compose.yml`, `.env`, `new-backend/`, `frontend/`, `nginx/`
- **Все сервисы на VPS**, кроме offers-relay (см. ниже)

### Railway — offers-relay + демо-фронтенд

#### Project: `offers-relay`
- **GitHub**: `Admjral/offers-relay` (private), деплой через `railway up` из `/offers-relay/`
- **Назначение**: Проксирует запросы к Kaspi, которые блокируются с VPS IP
- **Эндпоинты**: `POST /relay/offers`, `POST /relay/parse-url`
- **URL**: `https://offers-relay-production.up.railway.app`
- **Auth**: Bearer token через `RELAY_SECRET`

#### Project: `demper-demo` (демо-фронтенд с моковыми данными)
- **URL**: `https://demper-demo-production.up.railway.app`
- **Railway project ID**: `1b95126a-006d-4291-993d-0053eceb5d18`
- **Railway service ID**: `11c9515a-2446-4c7d-9bb4-d3dc519dd21a`
- **Локальная папка**: `/Users/adilhamitov/Desktop/cube-demper-full/demo/` (в `.gitignore`, только локально!)
- **Что это**: полная копия `frontend/` с перехватом всех API-вызовов → моковые данные. Без логина, баннер "Демо режим"
- **⚠️ НЕ деплоить на VPS** — это отдельный демо-сайт, никакого бэкенда не требует
- **Деплой**:
  ```bash
  cd /Users/adilhamitov/Desktop/cube-demper-full/demo
  railway up --service 11c9515a-2446-4c7d-9bb4-d3dc519dd21a
  ```
- **Ключевые изменённые файлы** (относительно `frontend/`):
  - `src/lib/mock-data/index.ts` — все моковые данные (создан)
  - `src/lib/api.ts` — все GET → mock, POST/PATCH/PUT/DELETE → no-op
  - `src/lib/auth.ts` — автологин демо-пользователя
  - `src/middleware.ts` — нет проверок токена, /login → редирект в /dashboard
  - `src/app/(dashboard)/layout.tsx` — жёлтый баннер, убраны subscription gates

#### Project: `proud-vision` (НЕ используется как прод, только WAHA)
- `waha-plus` — WhatsApp (NOWEB engine, OTP сессия: `default`)
- Остальные сервисы — неактивны, прод на VPS

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

### Railway — offers-relay (вторичный)
```bash
# rsync → deploy repos → git push
rsync -av --exclude='.git' --exclude='__pycache__' --exclude='.venv' new-backend/ "/Users/adilhamitov/Desktop/Cube Demper/new-backend/"
rsync -av --exclude='.git' --exclude='node_modules' --exclude='.next' frontend/ "/Users/adilhamitov/Desktop/Cube Demper/frontend/"
# git add + commit + push в каждом deploy repo
```

### Demo (Railway — demper-demo)
```bash
cd /Users/adilhamitov/Desktop/cube-demper-full/demo
railway up --service 11c9515a-2446-4c7d-9bb4-d3dc519dd21a
```
**⚠️ `demo/` папка в `.gitignore` — она только локальная, не пушить в монорепо.**

## Key Files

### Backend
- `app/main.py` — FastAPI entry point, background tasks startup
- `app/config.py` — Все конфиги и env vars
- `app/workers/demper_instance.py` — Worker демпинга цен (1457 строк)
- `app/services/api_parser.py` — Kaspi API: offers, sync_orders_to_db, parse_product_by_sku, sync_product
- `app/services/ai_salesman_service.py` — ИИ Продажник (handle_incoming_message + process_order_for_upsell)
- `app/services/ai_lawyer_service.py` — ИИ-Юрист (RAG + Gemini chat)
- `app/services/notification_service.py` — Уведомления (price, orders, support)
- `app/services/orders_sync_service.py` — Фоновый sync заказов (каждые 8 мин, ТОЛЬКО REST API, без GraphQL fallback)
- `app/services/preorder_checker.py` — Фоновая проверка предзаказов (каждые 5 мин)
- `app/services/kaspi_orders_api.py` — Kaspi REST API (X-Auth-Token, реальные телефоны через Base64 декодирование)
- `app/services/kaspi_products_api.py` — Kaspi Products REST API (полные данные товаров: name, price, SKU)
- `app/services/kaspi_mc_service.py` — MC GraphQL (заказы, телефоны замаскированы)
- `app/services/order_event_processor.py` — Обработка событий заказов → WhatsApp шаблоны (KASPI_STATE_TO_EVENT mapping)
- `app/services/kaspi_auth_service.py` — Playwright авторизация Kaspi MC
- `app/services/waha_service.py` — WAHA WhatsApp API client (singleton)
- `app/services/invoice_merger.py` — Склейка PDF-накладных
- `app/routers/kaspi.py` — Магазины, товары, демпинг, аналитика, city-prices (1700+ строк)
- `app/routers/whatsapp.py` — WhatsApp: сессии, рассылки, шаблоны, контакты, webhook (30 endpoints)
- `app/routers/ai.py` — ИИ Продажник endpoints (settings, stats, history, process-order)
- `app/routers/lawyer.py` — ИИ-Юрист (chat, calculators, document generation, PDF export, editing)
- `app/schemas/lawyer.py` — ИИ-Юрист schemas (UpdateDocumentRequest и др.)
- `app/fonts/DejaVuSans.ttf`, `DejaVuSans-Bold.ttf` — Шрифты для PDF с кириллицей (fpdf2)
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
- `src/app/(dashboard)/dashboard/integrations/page.tsx` — API token management с визуальными инструкциями
- `src/hooks/use-notifications.ts` — Уведомления (query + mutations)
- `src/components/notifications/notification-bell.tsx` — Колокольчик с иконками
- `src/components/lawyer/document-generator.tsx` — Генератор документов ИИ-Юриста (формы, редактор, PDF)
- `src/hooks/api/use-lawyer.ts` — ИИ-Юрист hooks (15 document types, chat, calculators, PDF download)
- `src/lib/i18n.ts` — Переводы (ru/kz)
- `src/lib/api.ts` — API клиент
- `public/instructions.png` — Визуальная инструкция по получению API токена из Kaspi MC

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

### API Token Invalid/Expired
- **Симптомы**: `api_key_valid = FALSE`, endpoints возвращают маскированные телефоны
- **Причины**: Kaspi REST API токен истёк, неправильно скопирован, или удалён в Kaspi MC
- **Решение**:
  1. Получить новый токен: Kaspi MC → Настройки → Интеграции → API токен
  2. Обновить через UI: `/dashboard/integrations` → вставить токен → сохранить (с автовалидацией)
  3. Или через SQL: `UPDATE kaspi_stores SET api_key = 'NEW_TOKEN', api_key_valid = TRUE WHERE id = '...'`
- **Тестирование**: `POST /stores/{store_id}/test-api-token` — проверит токен без сохранения

### Телефоны клиентов замаскированы
- **Проблема**: endpoint возвращает `"+0(000)-000-00-00"` вместо реального номера
- **Причина**: нет `api_key` или `api_key_valid = FALSE` → fallback на MC GraphQL (маскированные телефоны)
- **Решение**: установить/обновить API токен в `/dashboard/integrations`
- **Проверка**: `SELECT api_key, api_key_valid FROM kaspi_stores WHERE id = '...'`
- **Логи**: смотри `"Successfully decoded phone from customer.id"` в backend logs

### Products Sync возвращает только ID/SKU
- **Проблема**: синхронизация товаров не возвращает названия и цены
- **Причина**: используется MC GraphQL вместо REST API (GraphQL возвращает только IDs)
- **Решение**: установить API токен → синхронизация автоматически переключится на REST API
- **Проверка**: в логах должно быть `"Synced N products via REST API"`, не GraphQL

### asyncpg + JSONB
- **Запись**: `json.dumps(data, ensure_ascii=False, default=str)` — asyncpg НЕ принимает dict
- **Чтение**: `json.loads(row['col']) if isinstance(row['col'], str) else row['col']`

## Git Config
- Email: `hamitov.adil04@gmail.com`, Username: `Admjral`
- Railway CLI: `/opt/homebrew/bin/railway`

## Environment Variables

### VPS Production (.env file)
- **Location**: `/home/ubuntu/cube-demper/.env`
- **Key vars**:
  - `GEMINI_API_KEY` — Google Gemini API key (текущий: `AIzaSyCcSc21pY7yrx58zCnukoccTmvSzxJzKvo`)
  - `SECRET_KEY` — JWT signing key (32+ chars)
  - `ENCRYPTION_KEY` — Fernet encryption key (32 bytes)
  - `POSTGRES_HOST=postgres` — Docker service name
  - `REDIS_HOST=redis` — Docker service name
  - `WAHA_URL=http://waha:3000` — WAHA internal URL
- **Обновление**: После изменения .env → `docker compose restart <service>`
- **Backup**: Всегда создавай `.env.backup` перед изменениями

### Local Development
- **Config**: `new-backend/app/config.py` — Pydantic Settings с автозагрузкой из .env
- **Defaults**: большинство параметров имеют dev-defaults (localhost, postgres, redis)
- **Валидация**: `validate_secrets()` проверяет что SECRET_KEY и ENCRYPTION_KEY не дефолтные

## Important Notes
1. **Never force push** to main/master
2. **VPS — единственный прод** для всех сервисов. Railway — только offers-relay + demo
3. **Migrations автоматические** при старте бэкенда (`alembic upgrade head`)
4. **offers-relay** деплоится отдельно: `cd offers-relay && railway up`
5. **Gemini API ключ**: обновляется в VPS `.env` файле, требует рестарт backend/workers
6. **demo/** папка в `.gitignore` — не коммитить, деплоить только через `railway up` из этой папки

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
- **Orders Sync**: Фоновая задача в бэкенде (НЕ в воркерах), каждые 8 мин (480s), **ТОЛЬКО REST API** (GraphQL fallback убран 2026-02-17). Нет токена → магазин пропускается

### Kaspi REST API — `state` vs `status` (2026-02-15)
- **ДВА разных параметра фильтрации**:
  - `filter[orders][state]` — таб/вкладка: `NEW`, `SIGN_REQUIRED`, `PICKUP`, `DELIVERY`, `KASPI_DELIVERY`, `ARCHIVE`
  - `filter[orders][status]` — статус заказа: `APPROVED_BY_BANK`, `ACCEPTED_BY_MERCHANT`, `COMPLETED`, `CANCELLED`, `CANCELLING`, `KASPI_DELIVERY_RETURN_REQUESTED`, `RETURNED`
- **В ответе тоже оба поля**: `attributes.state` (таб) и `attributes.status` (реальный статус)
- **Пример**: заказ на самовывозе `state=PICKUP`, `status=ACCEPTED_BY_MERCHANT`. Выданный: `state=ARCHIVE`, `status=COMPLETED`
- **Правило**: всегда использовать `attributes.status` для логики статусов заказов, НЕ `attributes.state`
- **ARCHIVE не приходит без фильтра**: дефолтный запрос без `filter[orders][state]` НЕ возвращает архивные заказы → нужен отдельный запрос с `filter[orders][state]=ARCHIVE`
- **httpx и запятые**: httpx кодирует запятые как `%2C` в query params → строить URL вручную через f-string

### Orders Sync Pipeline (2026-02-15)
- **`kaspi_order_id` = order code** (NOT REST API `id`): REST API `id` = Base64(code), MC GraphQL хранит plain code → дубли если использовать `id`. Всегда `attributes.code` как `kaspi_order_id`
- **WhatsApp шаблоны при смене статуса**: `sync_orders_to_db()` триггерит `process_new_kaspi_order()` и для INSERT (новый заказ), и для UPDATE (смена статуса)
- **Dedup шаблонов**: таблица `whatsapp_messages` — `order_code + trigger_event` предотвращает повторную отправку
- **Event mapping** в `order_event_processor.py`:
  - `APPROVED_BY_BANK` → ORDER_APPROVED, `ACCEPTED_BY_MERCHANT` → ORDER_ACCEPTED
  - `COMPLETED` → ORDER_COMPLETED, `CANCELLED`/`RETURNED` → ORDER_CANCELLED
  - `ARCHIVE` → ORDER_COMPLETED (fallback)

### Base64 Phone Decode (2026-02-15)
- **customer.id без padding**: Kaspi отдаёт Base64 без `=` padding (например `NzAyMzU2NTA3Nw`, 15 символов)
- **Фикс**: `padded = customer_id_base64 + '=' * (-len(customer_id_base64) % 4)` перед `b64decode()`
- **Masked phone detection**: `cellPhone` может быть all-zeros (`00000000000`) → проверка `all(c == '0' for c in digits)`
- **WAHA phone format**: `phone_raw` должен быть 11 цифр с кодом страны (`77023565077`), НЕ 10 (`7023565077`). Формат для WAHA: `{phone_raw}@c.us`

### Real Phone Numbers (2026-02-15)
- **customer.id = Base64-encoded phone**: `atob("NzAyMzU2NTA3Nw")` → `"7023565077"` → `"+77023565077"`
- **customer.cellPhone = маскирован**: `"+0(000)-000-00-00"` или all-zeros (бесполезен)
- **Приоритет**: REST API (Base64 decode) → MC GraphQL (masked fallback)
- **Утилита**: `decode_customer_id_to_phone()` в `api_parser.py` — с padding fix (`+= '=' * (-len % 4)`)
- **Endpoint**: `GET /orders/{store_id}/{order_code}/customer` — возвращает реальный телефон если есть api_key
- **Logic**: В `kaspi_orders_api.py:get_customer_phone()` — local import чтобы избежать circular dependency
- **phone_raw**: 11 цифр с кодом страны (7XXXXXXXXXX), для WAHA: `{phone_raw}@c.us`

### Products Sync (2026-02-15)
- **Kaspi Products REST API**: `kaspi.kz/shop/api/v2/products` (X-Auth-Token, JSON:API format)
- **Полные данные**: name, price, SKU, description, images (НЕ только ID как в GraphQL!)
- **Service**: `kaspi_products_api.py` — `KaspiProductsAPI.fetch_products()`
- **Sync endpoint**: `POST /stores/{store_id}/sync` — REST API first → GraphQL fallback
- **Rate limit**: 6 RPS (shared with orders API via `get_orders_rate_limiter()`)
- **Pagination**: автоматическая через `page[number]` и `meta.totalPages`
- **Сохранение**: `_sync_products_to_db()` в `routers/kaspi.py` — INSERT ... ON CONFLICT UPDATE

### API Token Management (2026-02-15)
- **Валидация при сохранении**: `PATCH /stores/{store_id}/api-token` делает тестовый запрос к Kaspi API
- **Тестирование токена**: `POST /stores/{store_id}/test-api-token` — проверка без сохранения
- **Response**: `{"valid": bool, "orders_count": int, "error": str, "message": str}`
- **Маскирование**: `api_key_masked` в `KaspiStoreResponse` — первые 4 + последние 4 символа (`"eIBx...Ay8="`)
- **Флаг валидности**: `kaspi_stores.api_key_valid` — auto-update при ошибках 401/403
- **Frontend**: `/dashboard/integrations` — input field + visual instructions image (`/public/instructions.png`)

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

### Circular Import Patterns (2026-02-15)
- **Проблема**: `api_parser.py` → `order_event_processor.py` → `kaspi_orders_api.py` → `api_parser.py`
- **Решение**: Local imports внутри функций вместо top-level imports
- **Пример**:
  ```python
  # ❌ Top-level (circular!)
  from .api_parser import decode_customer_id_to_phone

  # ✅ Local import
  def get_customer_phone(...):
      from .api_parser import decode_customer_id_to_phone  # Inside function
      ...
  ```
- **Когда использовать**: утилиты в `api_parser.py`, которые используются в сервисах с cross-dependencies

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
- **⚠️ Проблемные**: Поиск ниш (75%, статичные данные), Интеграции (race condition SMS verify), Техподдержка (dead code `/me`), Billing (TipTopPay не интегрирован)
- **✅ OK**: Демпинг (94%), Аналитика (90%), Юнит-экономика (93%), Предзаказы, WhatsApp, ИИ Продажник, Заказы, Накладные (100%), ИИ-Юрист (95%)
- **Dead code**: `kaspi_auth_*_example.py`, `test_kaspi_auth.py`, `railway_waha_service.py`, дубли `/me` в support.py

### ИИ-Юрист — Генерация документов (2026-02-15)
- **15 типов документов**: supply/sale/service/rent/employment contracts, claims (supplier/buyer/marketplace), complaint, IP/TOO registration, license/tax application, acceptance/work_completion/reconciliation acts
- **Шаблоны**: `DOCUMENT_TEMPLATES` dict в `ai_lawyer_service.py`, markdown-like с `{placeholder}` полями
- **Prepare methods**: `_prepare_rent_contract_data()`, `_prepare_complaint_data()`, `_prepare_application_data(data, doc_type)`, `_prepare_act_data(data, doc_type)` — заполняют defaults + форматируют данные
- **Frontend**: `document-generator.tsx` — 9 категорий форм, inline edit (textarea), copy, PDF download
- **Хранение**: таблица `lawyer_documents` (id, user_id, document_type, title, content, created_at)
- **Редактирование**: `PATCH /lawyer/documents/{id}` + `UpdateDocumentRequest` в `schemas/lawyer.py`

### PDF генерация с fpdf2 (2026-02-15)
- **Библиотека**: `fpdf2==2.8.2`, шрифты DejaVu Sans для кириллицы (`app/fonts/`)
- **Метод**: `generate_pdf(content, title)` в `ai_lawyer_service.py` → in-memory bytes
- **Endpoint**: `GET /lawyer/documents/{id}/pdf` → `StreamingResponse`
- **Важно**: `pdf.x = pdf.l_margin` перед каждым блоком, `multi_cell(content_w, ...)` с явной шириной (НЕ `0`)
- **Кириллица в заголовках**: RFC 5987 — `filename*=UTF-8''%D0%...pdf`

### Sales & Analytics Rework (2026-02-17)
- **GraphQL убран из orders sync**: `orders_sync_service.py` больше НЕ использует MC GraphQL. Нет API токена → магазин пропускается
- **Ручной синк удалён**: `POST /sync-orders` endpoint и кнопка "Синхронизировать" убраны. Только автоматический фоновый синк каждые 8 мин
- **Новые endpoints аналитики**:
  - `GET /stores/{id}/order-pipeline?period=7d` — счётчики по статусам (active/completed/cancelled) + conversion_rate + cancellation_rate
  - `GET /stores/{id}/order-breakdowns?period=7d` — разбивки по payment_mode, delivery_mode, городам (из delivery_address) + delivery_cost_total
- **Статус-группировка для pipeline**:
  - Active: `APPROVED_BY_BANK`, `ACCEPTED_BY_MERCHANT`
  - Completed: `COMPLETED`
  - Cancelled: `CANCELLED`, `CANCELLING`, `RETURNED`, `KASPI_DELIVERY_RETURN_REQUESTED`
- **Label maps**: `PAYMENT_MODE_LABELS`, `DELIVERY_MODE_LABELS` в `routers/kaspi.py` — перевод ключей API в читаемые названия
- **Город из адреса**: `SPLIT_PART(delivery_address, ',', 1)` — первая часть формата "Алматы, улица..."
- **Frontend**: `sales/page.tsx` — pipeline cards + 2 bar charts (выручка + заказы) + 3 donut charts (оплата/доставка/города) + таблица городов
- **Donut chart**: чистый SVG без библиотек, `DonutChart` + `DonutLegend` компоненты, палитра 6 цветов
- **Schemas**: `OrderPipeline`, `PipelineGroup`, `OrderBreakdowns`, `BreakdownItem` в `schemas/kaspi.py`
- **Hooks**: `useOrderPipeline()`, `useOrderBreakdowns()` в `use-analytics.ts`. `useSyncOrders()` удалён

### Alembic Multiple Heads (2026-02-15)
- **Симптом**: Backend не стартует — `"Multiple head revisions are present"` → 502
- **Причина**: Две ветки миграций + циклическая зависимость (`20260212180000` → `down_revision = '20260213090000'`, более поздняя!)
- **Фикс**: 1) Отключить auto-migrations в docker-compose 2) Исправить `down_revision` 3) `DELETE FROM alembic_version` 4) `INSERT` merge revision
- **Merge**: `down_revision = ('branch1', 'branch2')` — кортеж двух голов
- **Правило**: `down_revision` всегда РАНЬШЕ по хронологии чем сама ревизия
