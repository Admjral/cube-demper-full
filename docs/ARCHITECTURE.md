# Cube Demper — Архитектура и Контроль Доступа

## 📋 Содержание

1. [Общая архитектура](#общая-архитектура)
2. [Модель авторизации](#модель-авторизации)
3. [Тарифная система](#тарифная-система)
4. [Модули и их зависимости](#модули-и-их-зависимости)
5. [Ownership модель](#ownership-модель)
6. [Границы доступа](#границы-доступа)
7. [Рекомендации по разграничению](#рекомендации-по-разграничению)

---

## 🏗️ Общая архитектура

### Слои приложения

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                    │
│  - Dashboard UI                                          │
│  - API Client (fetch + Bearer token)                     │
└───────────────────┬─────────────────────────────────────┘
                    │ HTTP/REST + WebSocket
┌───────────────────▼─────────────────────────────────────┐
│                   Backend (FastAPI)                      │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Routers (Endpoints)                             │   │
│  │  - Auth, Billing, Kaspi, WhatsApp, AI, etc.     │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Dependencies (Auth & Feature Gates)             │   │
│  │  - get_current_user()                            │   │
│  │  - require_feature("feature_name")               │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Services (Business Logic)                       │   │
│  │  - kaspi_orders_api, kaspi_products_api          │   │
│  │  - ai_salesman, ai_lawyer                        │   │
│  │  - feature_access, notification_service          │   │
│  └──────────────────────────────────────────────────┘   │
└───────────────────┬─────────────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────────────┐
│               Workers (Background)                       │
│  - demper_instance.py (price demping)                   │
│  - orders_sync_service.py (8 min cycle)                 │
│  - preorder_checker.py (5 min cycle)                    │
└─────────────────────────────────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────────────┐
│              Databases & External APIs                   │
│  - PostgreSQL (users, stores, products, subscriptions)  │
│  - Redis (cache, sessions)                              │
│  - Kaspi API (REST + MC GraphQL)                        │
│  - Google Gemini (AI features)                          │
│  - WAHA (WhatsApp)                                      │
└─────────────────────────────────────────────────────────┘
```

---

## 🔐 Модель авторизации

### 1. Роли пользователей

```python
# dependencies.py

ROLES = {
    "user": "Обычный пользователь (owner магазинов)",
    "admin": "Администратор (full access)",
    "partner": "Партнёр (рефералка, отдельная авторизация)"
}
```

### 2. JWT токены

**Структура JWT payload:**
```json
{
  "sub": "user_id (UUID)",
  "role": "user|admin|partner",
  "exp": "expiration timestamp"
}
```

**Типы токенов:**
- `role: "user"` — основной токен для пользователей
- `role: "admin"` — админ токен
- `role: "partner"` — партнёрский токен
- `role: "password_reset"` — НЕ принимается в `get_current_user()` (блокируется)

### 3. Dependency Injection (DI)

#### `get_current_user()`
```python
# Базовая авторизация — используется в 95% endpoints
async def get_current_user(
    authorization: Header,
    pool: asyncpg.Pool
) -> dict:
    # 1. Проверка Bearer token
    # 2. Декодирование JWT
    # 3. Валидация role in ("user", "admin")
    # 4. Проверка is_blocked
    # 5. Возврат user dict с полями:
    return {
        "id": UUID,
        "email": str,
        "role": "user" | "admin",
        "phone": str | None,
        "phone_verified": bool,
        "company_name": str | None,
        # ...
    }
```

#### `get_current_admin_user()`
```python
# Админ-только endpoints
async def get_current_admin_user(
    current_user: Depends(get_current_user)
) -> dict:
    if current_user["role"] != "admin":
        raise AuthorizationError("Admin access required")
    return current_user
```

#### `require_feature("feature_name")`
```python
# Feature-gated endpoints (тарифные ограничения)
def require_feature(feature: str):
    async def dependency(
        current_user: Depends(get_current_user),
        pool: asyncpg.Pool
    ) -> dict:
        has_access, message = await feature_access.check_feature_access(
            pool, current_user['id'], feature
        )
        if not has_access:
            raise HTTPException(403, detail={
                "error": "feature_not_available",
                "feature": feature,
                "message": message
            })
        return current_user
    return Depends(dependency)
```

**Использование:**
```python
@router.post("/ai/salesman/settings")
async def update_ai_settings(
    current_user: Annotated[dict, require_feature("ai_salesman")],
    # ...
):
    # Только пользователи с feature "ai_salesman" могут попасть сюда
```

---

## 💰 Тарифная система

### 1. Планы (Plans)

**Таблица:** `plans`

| План | Код | Цена (тенге) | Analytics Limit | Demping Limit | Фичи |
|------|-----|--------------|-----------------|---------------|------|
| Free | `free` | 0 | 0 | 0 | (нет фич) |
| Basic | `basic` | 21,990 | 500 | 50 | analytics, demping, exclude_own_stores, invoice_glue, orders_view, unit_economics, ai_lawyer, priority_support |
| Standard | `standard` | 27,990 | 1,000 | 100 | Basic + preorder, whatsapp_auto, niche_search, city_demping |
| Premium | `premium` | 33,990 | -1 (unlim) | 200 | Standard + whatsapp_bulk, delivery_demping, priority_products |

**Trial:**
- `trial_days` = 7 дней (план Basic)
- Anti-abuse: проверка по `kaspi_stores.merchant_id` + `users.phone` — один магазин/телефон = один trial **на все аккаунты**

### 2. Аддоны (Add-ons)

**Таблица:** `addons`

| Аддон | Код | Цена (тенге) | Recurring | Stackable | Фичи |
|-------|-----|------|-----------|-----------|------|
| ИИ Продажник | `ai_salesman` | 15,000 | ✅ | ❌ | ai_salesman |
| Предзаказ | `preorder` | 10,000 | ✅ | ❌ | preorder |
| WhatsApp рассылка | `whatsapp` | 15,000 | ✅ | ❌ | whatsapp_auto, whatsapp_bulk |
| Демпинг +100 | `demping_100` | 10,000 | ✅ | ✅ | +100 к demping_limit |
| Аналитика безлимит | `analytics_unlimited` | 20,000 | ✅ | ❌ | analytics_limit = -1 |
| Демпер по городам | `city_demping` | 10,000 | ✅ | ❌ | city_demping |
| Демпер по доставке | `delivery_demping` | 10,000 | ✅ | ❌ | delivery_demping |

### 3. Feature Access Service

**Сервис:** `services/feature_access.py`

**Основные методы:**

```python
# Получить все фичи пользователя
features = await feature_access.get_user_features(pool, user_id)
# Возвращает:
{
    "plan_code": str | None,          # "basic", "standard", etc.
    "plan_name": str | None,          # "Базовый", "Стандарт", etc.
    "features": list[str],            # ["analytics", "demping", "ai_lawyer", ...]
    "analytics_limit": int,           # -1 = unlimited
    "demping_limit": int,
    "has_active_subscription": bool,  # True если есть активная подписка
    "is_trial": bool,
    "trial_ends_at": datetime | None,
    "subscription_ends_at": datetime | None,
}

# Проверить доступ к фиче
has_access, message = await feature_access.check_feature_access(
    pool, user_id, "ai_salesman"
)

# Проверить лимит
within_limit, max_limit, message = await feature_access.check_limit(
    pool, user_id, "demping", current_count=150
)
```

**Фичи:**

| Фича | Требования |
|------|------------|
| `analytics` | Plans: basic, standard, premium |
| `demping` | Plans: basic, standard, premium |
| `ai_lawyer` | Plans: basic, standard, premium |
| `orders_view` | Plans: basic, standard, premium |
| `invoice_glue` | Plans: basic, standard, premium |
| `unit_economics` | Plans: basic, standard, premium |
| `exclude_own_stores` | Plans: basic, standard, premium |
| `priority_support` | Plans: basic, standard, premium |
| `preorder` | Plans: standard, premium OR Addon: preorder |
| `whatsapp_auto` | Plans: standard, premium OR Addon: whatsapp |
| `whatsapp_bulk` | Plans: premium OR Addon: whatsapp |
| `niche_search` | Plans: standard, premium |
| `city_demping` | Plans: standard, premium OR Addon: city_demping |
| `delivery_demping` | Plans: premium OR Addon: delivery_demping |
| `priority_products` | Plans: premium |
| `ai_salesman` | Addon: ai_salesman ONLY |

---

## 🧩 Модули и их зависимости

### 1. Core модули (без тарифов)

**Доступны всем пользователям:**

- **Auth** (`/auth`)
  - Регистрация, логин, OTP
  - Сброс пароля (TODO: email не отправляется)
  - Не требует подписки

- **Billing** (`/billing`)
  - Просмотр планов и аддонов
  - Активация trial (1 раз per merchant_id)
  - Просмотр платежей
  - Не требует подписки для просмотра

- **Support** (`/support`)
  - WebSocket + HTTP chat
  - Доступно всем пользователям
  - Notifications при новых сообщениях от админа

- **Notifications** (`/notifications`)
  - Просмотр уведомлений
  - Настройки уведомлений (`notification_settings` JSONB)
  - Доступно всем

- **Health** (`/health`)
  - Healthcheck endpoints
  - Публичные (no auth)

### 2. Kaspi Integration (базовые фичи требуют Plan)

**Модуль:** `/kaspi`

**Ownership:** `kaspi_stores.user_id = current_user['id']`

**Endpoints без feature gates:**
- `GET /stores` — список магазинов пользователя
- `POST /stores/connect` — подключение магазина (Playwright auth)
- `PATCH /stores/{store_id}/api-token` — сохранение API токена
- `POST /stores/{store_id}/test-api-token` — тестирование токена
- `GET /stores/{store_id}/products` — список товаров магазина

**Endpoints с feature gates:**
- `POST /stores/{store_id}/sync` — синхронизация товаров (требует `analytics` OR `demping`)
- `POST /stores/{store_id}/run-demping` — демпинг цен (требует `demping`)
- `GET /stores/{store_id}/analytics` — аналитика (требует `analytics`)
- `GET /orders/{store_id}/{order_code}/customer` — телефон клиента (требует `orders_view`)

**Зависимости:**
```
kaspi.router
  ├─ kaspi_auth_service (Playwright авторизация)
  ├─ kaspi_orders_api (REST API, Base64 телефоны)
  ├─ kaspi_products_api (REST API, полные данные товаров)
  ├─ kaspi_mc_service (MC GraphQL, fallback)
  └─ api_parser (offers, sync_orders_to_db, parse_product_by_sku)
```

### 3. Demping Worker (фоновый)

**Модуль:** `workers/demper_instance.py`

**Запуск:** отдельный process (worker-1, worker-2)

**Ownership:** только товары где `products.store_id IN (user's stores)` AND `bot_active = TRUE`

**Фильтры:**
- `kaspi_stores.is_active = TRUE`
- `kaspi_stores.needs_reauth = FALSE`
- `products.bot_active = TRUE`
- `work_hours` (KZ timezone)
- Sharding по `mod(abs(hashtext(id::text)), WORKER_COUNT) = INDEX`

**Не требует подписки для запуска** — но пользователь должен иметь активные товары

### 4. WhatsApp (`/whatsapp`)

**Фичи:**
- `whatsapp_auto` — автоответы, шаблоны
- `whatsapp_bulk` — массовые рассылки (broadcast)

**Ownership:** `whatsapp_sessions.store_id → kaspi_stores.user_id`

**Endpoints:**
```python
POST /sessions                         # Создать сессию (требует store ownership)
GET /sessions                          # Список сессий пользователя
POST /sessions/{session_id}/broadcast  # Рассылка (требует whatsapp_bulk)
GET /contacts                          # Контакты (customer_contacts.store_id)
```

**Зависимости:**
- `waha_service.py` (WAHA API client)
- `ai_salesman_service.py` (auto-reply через webhook)

### 5. AI Salesman (`/ai/salesman`)

**Фича:** `ai_salesman` (только через аддон!)

**Ownership:** `ai_salesman_settings.store_id → kaspi_stores.user_id`

**Endpoints:**
```python
POST /ai/salesman/settings           # Настройки (require_feature("ai_salesman"))
GET /ai/salesman/stats/{store_id}    # Статистика (require_feature("ai_salesman"))
GET /ai/salesman/history/{store_id}  # История (require_feature("ai_salesman"))
POST /ai/salesman/process-order      # Ручная обработка заказа (require_feature("ai_salesman"))
```

**Auto-reply:**
- Webhook `POST /whatsapp/webhook` → `handle_incoming_message()`
- Проверяет наличие фичи `ai_salesman` у владельца store
- Генерирует ответ через Gemini
- Отправляет через WAHA

### 6. AI Lawyer (`/ai/lawyer` + `/ai/chat`)

**Фича:** `ai_lawyer` (доступна на всех платных планах)

**Endpoints:** Все закрыты `require_feature("ai_lawyer")`:
- `lawyer.py`: 16 endpoints (chat, calculators, documents, PDF)
- `ai.py`: `/ai/chat` (общий чат-endpoint)

### 7. Preorders (`/preorders`)

**Фича:** `preorder`

**Ownership:** `preorders.store_id → kaspi_stores.user_id`

**Endpoints:** Все закрыты `require_feature("preorder")`:
- `GET/POST/PUT/DELETE /preorders`

**Background checker:** `preorder_checker.py` (каждые 5 мин) — проверяет доступность товаров

### 8. Unit Economics (`/unit-economics`)

**Фича:** `unit_economics`

**Endpoints:** Все закрыты `require_feature("unit_economics")`

### 9. Invoices (`/invoices`)

**Фича:** `invoice_glue`

**Endpoints:** `POST /merge` закрыт `require_feature("invoice_glue")`

### 10. Niche Search (`/niches`)

**Фича:** `niche_search` (Standard+)

**Endpoints:** Все закрыты `require_feature("niche_search")`

---

## 🔑 Ownership модель

### Иерархия владения

```
User (users.id)
  └─ Kaspi Store (kaspi_stores.user_id)
      ├─ Products (products.store_id)
      ├─ Orders (orders.store_id)
      ├─ WhatsApp Sessions (whatsapp_sessions.store_id)
      ├─ AI Salesman Settings (ai_salesman_settings.store_id)
      ├─ Preorders (preorders.store_id)
      └─ Customer Contacts (customer_contacts.store_id)
```

### Проверка ownership в коде

**Паттерн:**
```python
@router.get("/stores/{store_id}/products")
async def get_products(
    store_id: str,
    current_user: Annotated[dict, Depends(get_current_user)],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    # 1. Проверка что store принадлежит пользователю
    async with pool.acquire() as conn:
        store = await conn.fetchrow(
            "SELECT id FROM kaspi_stores WHERE id = $1 AND user_id = $2",
            uuid.UUID(store_id), current_user['id']
        )
        if not store:
            raise HTTPException(404, detail="Store not found")

    # 2. Дальнейшая логика
    # ...
```

**⚠️ Критично:** Всегда проверять `user_id` в JOIN запросах!

**Плохо:**
```sql
-- Опасно! Любой может получить данные чужого store
SELECT * FROM products WHERE store_id = $1
```

**Хорошо:**
```sql
-- Безопасно: проверяем ownership через JOIN
SELECT p.* FROM products p
JOIN kaspi_stores s ON s.id = p.store_id
WHERE p.store_id = $1 AND s.user_id = $2
```

---

## 🚧 Границы доступа

### 1. По ролям

| Роль | Доступ |
|------|--------|
| `user` | Только свои данные (ownership check) |
| `admin` | Full access ко всем endpoints |
| `partner` | Только партнёрские endpoints (`/partner`) |

### 2. По тарифам

#### Free план (plan_id = NULL)
- ✅ Auth, Support, Notifications
- ❌ Демпинг, Аналитика, AI, WhatsApp, Preorders
- ✅ Trial activation (1 раз)

#### Basic план (21,990₸)
- ✅ Analytics (500 товаров)
- ✅ Demping (50 товаров)
- ✅ AI Lawyer, Orders View, Invoice Glue, Unit Economics
- ✅ Exclude Own Stores, Priority Support
- ❌ Preorder, WhatsApp, Niche Search, AI Salesman

#### Standard план (27,990₸)
- ✅ Basic +
- ✅ Analytics (1,000 товаров), Demping (100 товаров)
- ✅ Preorder, WhatsApp Auto, Niche Search, City Demping

#### Premium план (33,990₸)
- ✅ Standard +
- ✅ Analytics (unlimited), Demping (200 товаров)
- ✅ WhatsApp Bulk, Delivery Demping, Priority Products

#### Аддоны (независимо от плана)
- AI Salesman (15,000₸) — ТОЛЬКО через аддон
- Preorder (10,000₸) — добавляет фичу к Free/Basic
- WhatsApp (15,000₸) — добавляет whatsapp_auto + whatsapp_bulk
- Demping +100 (10,000₸) — увеличивает лимит (stackable)
- Analytics Unlimited (20,000₸) — снимает лимит
- City Demping (10,000₸) — демпер по городам
- Delivery Demping (10,000₸) — демпер по доставке

### 3. По данным

#### User-scoped
- **Subscriptions** — только свои
- **Payments** — только свои
- **Notifications** — только свои
- **Support chats** — только свои

#### Store-scoped
- **Kaspi Stores** — только где `user_id = current_user['id']`
- **Products** — только через ownership store
- **Orders** — только через ownership store
- **WhatsApp Sessions** — только через ownership store
- **AI Salesman Settings** — только через ownership store
- **Preorders** — только через ownership store

#### Global (no ownership)
- **Plans** — публичные
- **Addons** — публичные
- **Niches** — публичные (статичные данные)

---

## 🛡️ Рекомендации по разграничению

### 1. Критичные проблемы (требуют фикса)

#### ❌ Отсутствие feature gates

**Статус:** ✅ Исправлено (2026-02-15). Все роутеры теперь используют `require_feature()`:
- `routers/lawyer.py` — `require_feature("ai_lawyer")`
- `routers/preorders.py` — `require_feature("preorder")`
- `routers/unit_economics.py` — `require_feature("unit_economics")`
- `routers/invoices.py` — `require_feature("invoice_glue")`
- `routers/niches.py` — `require_feature("niche_search")`
- `routers/ai.py` — `/ai/chat` → `require_feature("ai_lawyer")`, salesman endpoints → `require_feature("ai_salesman")`
- `routers/whatsapp.py` — `/send/bulk` → `require_feature("whatsapp_bulk")`

#### ❌ Kaspi Stores — multiple ownership

**Проблема:** ON CONFLICT не обновляет `user_id` — один магазин может принадлежать нескольким пользователям

**Файл:** `routers/kaspi.py:connect_store()`

**Решение:**
```python
# Перед INSERT проверить существующий store
existing = await conn.fetchrow(
    "SELECT user_id FROM kaspi_stores WHERE merchant_id = $1",
    merchant_id
)
if existing and existing['user_id'] != current_user['id']:
    raise HTTPException(400, detail="Store already connected to another account")
```

### 2. Архитектурные улучшения

#### 💡 Централизованные ownership checks

**Создать dependency:**
```python
# dependencies.py
async def require_store_ownership(store_id: str):
    async def dependency(
        current_user: dict = Depends(get_current_user),
        pool: asyncpg.Pool = Depends(get_db_pool)
    ):
        async with pool.acquire() as conn:
            store = await conn.fetchrow(
                "SELECT id FROM kaspi_stores WHERE id = $1 AND user_id = $2",
                uuid.UUID(store_id), current_user['id']
            )
            if not store:
                raise HTTPException(404, detail="Store not found")
        return current_user
    return Depends(dependency)

# Использование:
@router.get("/stores/{store_id}/products")
async def get_products(
    store_id: str,
    current_user: Annotated[dict, require_store_ownership(store_id)],
    # ...
):
    # Ownership уже проверен в dependency
```

#### 💡 Audit logging

**Добавить таблицу:**
```sql
CREATE TABLE audit_log (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    action TEXT,  -- "demping_run", "api_token_update", etc.
    resource_type TEXT,  -- "store", "product", etc.
    resource_id UUID,
    ip_address INET,
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Логировать критичные операции:**
- API token updates
- Store connect/disconnect
- Demping runs
- WhatsApp broadcasts

#### 💡 Rate limiting per endpoint

**Сейчас:** Rate limiting только для внешних API (Kaspi)

**Рекомендация:** Добавить user-level rate limiting для дорогих операций:
- AI endpoints (Gemini calls)
- WhatsApp broadcasts
- PDF merge

### 3. Разграничение по функциям

#### Что можно ограничить дополнительно

| Функция | Текущий доступ | Рекомендация |
|---------|----------------|--------------|
| **Niche Search** | Все пользователи | Free: 10 запросов/день, Paid: unlimited |
| **AI Lawyer** | Все пользователи | Free: 5 вопросов/день, Paid: unlimited |
| **Unit Economics** | Все пользователи | Free: 3 расчёта/день, Paid: unlimited |
| **Invoice Merge** | Все пользователи | Free: 2 файла max, Paid: unlimited |
| **Orders Export** | Нет endpoint | Создать с feature gate |
| **Analytics Export** | Нет endpoint | Создать с feature gate (CSV/Excel) |

### 4. Безопасность данных

#### PII (Personally Identifiable Information)

**Защищённые данные:**
- `users.email` — owner only
- `users.phone` — owner only
- `customer_contacts.phone` — store owner only
- `orders.customer` — store owner only

**⚠️ Критично:** Никогда не возвращать PII чужих пользователей в API responses

#### API Tokens

**Текущая реализация:**
- `kaspi_stores.api_key` — plain text в БД
- `api_key_masked` в responses — первые 4 + последние 4 символа

**Рекомендация:**
- Шифрование API keys в БД через `ENCRYPTION_KEY`
- Separate read/write permissions (только owner может читать/записывать)

### 5. Multi-tenancy considerations

#### Если планируется B2B (агентства управляют магазинами клиентов)

**Нужно добавить:**
1. **Organizations** таблица
2. **Team members** с ролями (owner, manager, analyst)
3. **Permissions** per member (read_only, can_edit, can_demping)
4. **Separate billing** per organization vs per user

**Архитектура:**
```
Organization
  └─ Team Members (users + roles)
      └─ Kaspi Stores (organization-owned)
          └─ Products, Orders, etc.
```

---

## 📊 Матрица доступа (Quick Reference)

| Module | Free | Basic | Standard | Premium | Admin |
|--------|------|-------|----------|---------|-------|
| Auth | ✅ | ✅ | ✅ | ✅ | ✅ |
| Billing | ✅ | ✅ | ✅ | ✅ | ✅ |
| Support | ✅ | ✅ | ✅ | ✅ | ✅ |
| Notifications | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Analytics** | ❌ | ✅ (500) | ✅ (1000) | ✅ (unlim) | ✅ |
| **Demping** | ❌ | ✅ (50) | ✅ (100) | ✅ (200) | ✅ |
| **AI Lawyer** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Orders View** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Invoice Glue** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Unit Economics** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Niche Search** | ❌ | ❌ | ✅ | ✅ | ✅ |
| **City Demping** | ❌ (+addon) | ❌ (+addon) | ✅ | ✅ | ✅ |
| **Preorder** | ❌ (+addon) | ❌ (+addon) | ✅ | ✅ | ✅ |
| **WhatsApp Auto** | ❌ (+addon) | ❌ (+addon) | ✅ | ✅ | ✅ |
| **Delivery Demping** | ❌ (+addon) | ❌ (+addon) | ❌ (+addon) | ✅ | ✅ |
| **Priority Products** | ❌ | ❌ | ❌ | ✅ | ✅ |
| **WhatsApp Bulk** | ❌ (+addon) | ❌ (+addon) | ❌ (+addon) | ✅ | ✅ |
| **AI Salesman** | ❌ (+addon) | ❌ (+addon) | ❌ (+addon) | ❌ (+addon) | ✅ |

**Легенда:**
- ✅ = Доступно (feature gate: `require_feature()`)
- ❌ = Недоступно
- (+addon) = Доступно при покупке аддона

---

## 🔧 Рекомендуемые изменения

### High Priority

1. **~~Добавить feature gates~~** ✅ Сделано (2026-02-15): все роутеры закрыты `require_feature()`

2. **Kaspi Store ownership:**
   - Добавить проверку перед INSERT в `connect_store()`
   - Блокировать multiple accounts на один merchant_id

3. **API Keys encryption:**
   - Шифровать `kaspi_stores.api_key` в БД
   - Дешифровать только при использовании

### Medium Priority

4. **Centralized ownership checks:**
   - Создать `require_store_ownership()` dependency
   - Рефакторинг всех endpoints для использования

5. **Audit logging:**
   - Создать таблицу `audit_log`
   - Логировать критичные операции

6. **Rate limiting:**
   - Per-user rate limits для AI endpoints
   - Per-user rate limits для expensive operations

### Low Priority

7. **~~Niche Search feature gate~~** ✅ Сделано: `require_feature("niche_search")`, Standard+ планы

8. **Analytics/Orders export:**
   - Новые endpoints с feature gates
   - CSV/Excel export

9. **B2B multi-tenancy:**
   - Organizations model
   - Team permissions

---

**Последнее обновление:** 2026-02-15
**Версия документа:** 2.0 (feature gates fix, prices/limits updated)
