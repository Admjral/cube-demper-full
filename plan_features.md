# План: Добавление Feature Gates — Анализ и Реализация

## Контекст

В проекте есть система тарифов и feature gates для контроля доступа к функциям по подпискам, но большинство endpoints НЕ защищены feature gates. Это означает что **бесплатные пользователи** могут использовать **платные функции**.

### Текущее состояние
- **Определено 12 фич** в `FeatureAccessService.FEATURE_REQUIREMENTS`
- **Защищено только 2 endpoint'a**: `POST /ai/salesman/process-order`, `POST /ai/salesman/process-bulk`
- **197 endpoints всего**, из которых ~15-20 должны быть защищены feature gates

### Тарифная структура (из tariffs_cube_demper.md)

| План | Цена | Функции |
|------|------|---------|
| **21,990 тг** (Basic) | 21,990 | Аналитика 500, Демпинг 50, Не конкурировать со своими, Склейка накладных, Управление заказами, Юнит-экономика, ИИ юрист, Поддержка |
| **27,990 тг** (Standard) | 27,990 | Аналитика 1000, Демпинг 100, Демпер по городам, Предзаказ, Поиск ниш, Авто рассылка, + все из Basic |
| **33,990 тг** (Premium) | 33,990 | Аналитика безлимит, Демпинг 200, Демпер по доставке, Приоритетные товары, Массовая рассылка, + все из Standard |

**Отдельные аддоны:**
- ИИ продажник: 15,000
- Демпинг +100 товаров: 10,000
- Предзаказ: 10,000
- WhatsApp рассылка: 15,000
- Аналитика безлимит: 20,000
- Демпер по доставке: 10,000
- Демпер по городам: 10,000

---

## Проблемы

### 1. Feature gates определены, но НЕ используются

| Фича | Определена | Используется | Должна защищать |
|------|-----------|--------------|-----------------|
| `analytics` | ✅ | ❌ | Kaspi analytics endpoints |
| `demping` | ✅ | ❌ | Demping run endpoints |
| `ai_lawyer` | ✅ | ❌ | Lawyer chat, calculators, documents |
| `preorder` | ✅ | ❌ | Preorders CRUD |
| `whatsapp_auto` | ✅ | ❌ | WhatsApp templates, auto-messages |
| `whatsapp_bulk` | ✅ | ❌ | WhatsApp broadcasts |
| `unit_economics` | ✅ | ❌ | Unit economics calculator |
| `invoice_glue` | ✅ | ❌ | Invoice PDF merge |
| `orders_view` | ✅ | ❌ | Orders customer phone |
| `exclude_own_stores` | ✅ | ❌ | Analytics exclude own stores |
| `priority_support` | ✅ | ❌ | Support priority flag |

### 2. Функции из тарифов БЕЗ фич

| Функция из тарифа | Фича в коде | Статус |
|-------------------|-------------|--------|
| Поиск ниш | ❌ НЕТ | Endpoints открыты всем |
| Демпер по городам | ❌ НЕТ | Endpoints открыты всем |
| Демпер по доставке | ❌ НЕТ | Endpoint не существует? |
| Приоритетные товары | ❌ НЕТ | Endpoint не существует? |

### 3. Endpoints БЕЗ feature gates (критичные)

#### AI Lawyer (должен быть Basic+)
- `POST /lawyer/chat` - главный endpoint
- `POST /lawyer/generate-document`
- `POST /lawyer/calculate-penalty`
- `POST /lawyer/calculate-tax`
- `POST /lawyer/calculate-fee`
- `POST /lawyer/analyze-contract`

**Проблема**: Любой бесплатный пользователь может пользоваться ИИ юристом! Gemini API стоит денег.

#### Preorders (должен быть Standard+ или addon)
- `GET /preorders/`
- `POST /preorders/`
- `PATCH /preorders/{id}`
- `DELETE /preorders/{id}`

#### Unit Economics (должен быть Basic+)
- `POST /unit-economics/calculate`
- `POST /unit-economics/parse-url`
- `GET /unit-economics/saved`

#### Invoices (должен быть Basic+)
- `POST /invoices/process-invoices`

#### Niches (должен быть Standard+)
- `GET /niches/categories`
- `GET /niches/products`
- `POST /niches/calculate-unit-economics`

#### WhatsApp (должен быть Standard+ или addon)
Все ~30 endpoints открыты! Любой может:
- Создавать сессии
- Отправлять сообщения
- Делать рассылки
- Использовать шаблоны

---

## Логическое разделение модулей

### Free план (plan_id = NULL)
**Доступ:**
- ✅ Регистрация, авторизация
- ✅ Support chat
- ✅ Billing info (просмотр планов)
- ✅ Notifications

**Недоступно:**
- ❌ Всё остальное

### Basic план (21,990 тг)
**Базовые фичи:**
- `analytics` (лимит 500)
- `demping` (лимит 50)
- `exclude_own_stores`
- `invoice_glue`
- `orders_view`
- `unit_economics`
- `ai_lawyer`
- `priority_support`

### Standard план (27,990 тг)
**Дополнительно к Basic:**
- `preorder`
- `whatsapp_auto`
- `niche_search`
- `city_demping`

### Premium план (33,990 тг)
**Дополнительно к Standard:**
- `whatsapp_bulk`
- `delivery_demping` (если есть)
- `priority_products` (если есть)
- Аналитика unlimited

### Аддоны (независимо от плана)
- `ai_salesman` (только через аддон!)
- `demping_addon` (+100 товаров)
- `analytics_unlimited`
- `city_demping` (если нет Standard+)
- `delivery_demping`
- `whatsapp` (если нет Standard+)
- `preorder` (если нет Standard+)

---

## Необходимые изменения

### 1. Добавить недостающие фичи

**Файл:** `new-backend/app/services/feature_access.py`

**Добавить в FEATURE_REQUIREMENTS:**
```python
FEATURE_REQUIREMENTS = {
    # ... existing features ...

    # Новые фичи:
    'niche_search': {'plans': ['standard', 'premium']},
    'city_demping': {'plans': ['standard', 'premium'], 'addons': ['city_demping']},
    'delivery_demping': {'plans': ['premium'], 'addons': ['delivery_demping']},
    'priority_products': {'plans': ['premium']},
}
```

### 2. Защитить AI Lawyer endpoints

**Файл:** `new-backend/app/routers/lawyer.py`

**Изменение:**
```python
# ДОБАВИТЬ import
from ..dependencies import require_feature

# ИЗМЕНИТЬ все endpoint signatures:

# БЫЛО:
@router.post("/chat")
async def chat_with_lawyer(
    current_user: Annotated[dict, Depends(get_current_user)],
    # ...
):

# СТАЛО:
@router.post("/chat")
async def chat_with_lawyer(
    current_user: Annotated[dict, require_feature("ai_lawyer")],  # ← FEATURE GATE
    # ...
):
```

**Endpoints для защиты:**
- `/chat`
- `/generate-document`
- `/analyze-contract`
- `/calculate-penalty`
- `/calculate-tax`
- `/calculate-fee`

### 3. Защитить Preorders endpoints

**Файл:** `new-backend/app/routers/preorders.py`

**Добавить к каждому endpoint:**
```python
current_user: Annotated[dict, require_feature("preorder")]
```

### 4. Защитить Unit Economics endpoints

**Файл:** `new-backend/app/routers/unit_economics.py`

**Endpoints:**
- `POST /calculate`
- `POST /parse-url`
- `GET /saved`
- `POST /saved`
- `PUT /saved/{id}`
- `DELETE /saved/{id}`

### 5. Защитить Invoices endpoint

**Файл:** `new-backend/app/routers/invoices.py`

```python
@router.post("/process-invoices")
async def process_invoices(
    current_user: Annotated[dict, require_feature("invoice_glue")],
    # ...
):
```

### 6. Защитить Niches endpoints

**Файл:** `new-backend/app/routers/niches.py`

**Все endpoints:**
- `GET /categories`
- `GET /categories/{id}`
- `GET /products`
- `GET /products/{id}`
- `POST /calculate-unit-economics`
- `GET /stats`

**Добавить:**
```python
current_user: Annotated[dict, require_feature("niche_search")]
```

### 7. Защитить WhatsApp endpoints

**Файл:** `new-backend/app/routers/whatsapp.py`

**Разделение:**

#### Sessions, Messages, Templates → `whatsapp_auto`
```python
# Sessions management
@router.post("/sessions")
async def create_session(
    current_user: Annotated[dict, require_feature("whatsapp_auto")],
    # ...
):

# Message sending
@router.post("/send")
async def send_message(
    current_user: Annotated[dict, require_feature("whatsapp_auto")],
    # ...
):

# Templates CRUD
@router.get("/templates")
async def list_templates(
    current_user: Annotated[dict, require_feature("whatsapp_auto")],
    # ...
):
```

#### Broadcasts → `whatsapp_bulk`
```python
@router.post("/broadcasts")
async def create_broadcast(
    current_user: Annotated[dict, require_feature("whatsapp_bulk")],
    # ...
):

@router.post("/broadcasts/{id}/start")
async def start_broadcast(
    current_user: Annotated[dict, require_feature("whatsapp_bulk")],
    # ...
):
```

### 8. Защитить City Demping

**Файл:** `new-backend/app/routers/kaspi.py`

**Endpoint:**
```python
@router.post("/products/{product_id}/run-city-demping")
async def run_city_demping(
    current_user: Annotated[dict, require_feature("city_demping")],
    # ...
):
```

### 9. Защитить Orders View

**Файл:** `new-backend/app/routers/kaspi.py`

```python
@router.get("/orders/{store_id}/{order_code}/customer")
async def get_order_customer(
    current_user: Annotated[dict, require_feature("orders_view")],
    # ...
):
```

### 10. Защитить Analytics

**Файл:** `new-backend/app/routers/kaspi.py`

**Endpoints:**
- `GET /analytics`
- `GET /stores/{store_id}/analytics`
- `GET /stores/{store_id}/stats`

```python
@router.get("/analytics")
async def get_analytics(
    current_user: Annotated[dict, require_feature("analytics")],
    # ...
):
```

### 11. Защитить Demping endpoints

**Файл:** `new-backend/app/routers/kaspi.py`

**Endpoints:**
- `POST /products/{id}/run-demping`
- `POST /stores/{id}/run-demping`
- `POST /products/bulk-update` (если включает демпинг)

```python
@router.post("/products/{product_id}/run-demping")
async def run_demping(
    current_user: Annotated[dict, require_feature("demping")],
    # ...
):
```

---

## Полная матрица защиты

| Router | Endpoints Count | Feature Gate | Priority |
|--------|----------------|--------------|----------|
| **lawyer.py** | 10 | `ai_lawyer` | 🔴 HIGH (Gemini costs!) |
| **preorders.py** | 4 | `preorder` | 🔴 HIGH |
| **unit_economics.py** | 6 | `unit_economics` | 🔴 HIGH |
| **invoices.py** | 1 | `invoice_glue` | 🟡 MEDIUM |
| **niches.py** | 6 | `niche_search` (new) | 🔴 HIGH |
| **whatsapp.py** | ~25 | `whatsapp_auto` / `whatsapp_bulk` | 🔴 HIGH (WAHA costs!) |
| **kaspi.py** (analytics) | 3 | `analytics` | 🟡 MEDIUM |
| **kaspi.py** (demping) | 3 | `demping` | 🟡 MEDIUM |
| **kaspi.py** (orders) | 1 | `orders_view` | 🟢 LOW |
| **kaspi.py** (city demping) | 1 | `city_demping` (new) | 🟢 LOW |

**Итого:** ~60 endpoints нуждаются в защите feature gates

---

## Критичные файлы

| Файл | Изменения |
|------|-----------|
| `services/feature_access.py` | Добавить 4 новых фичи (niche_search, city_demping, delivery_demping, priority_products) |
| `routers/lawyer.py` | Добавить feature gates к 10 endpoints |
| `routers/preorders.py` | Добавить feature gates к 4 endpoints |
| `routers/unit_economics.py` | Добавить feature gates к 6 endpoints |
| `routers/invoices.py` | Добавить feature gate к 1 endpoint |
| `routers/niches.py` | Добавить feature gates к 6 endpoints |
| `routers/whatsapp.py` | Добавить feature gates к ~25 endpoints (разделить auto/bulk) |
| `routers/kaspi.py` | Добавить feature gates к ~8 endpoints (analytics, demping, orders, city) |

---

## Проверка (Verification)

### 1. Тест с Free пользователем
```bash
# 1. Создать free пользователя
# 2. Попробовать вызвать защищённый endpoint

curl -X POST https://cube-demper.shop/api/lawyer/chat \
  -H "Authorization: Bearer {free_user_token}" \
  -H "Content-Type: application/json" \
  -d '{"message": "test"}'

# Ожидаемый ответ:
{
  "detail": {
    "error": "feature_not_available",
    "feature": "ai_lawyer",
    "message": "Доступно на тарифе Базовый"
  }
}
```

### 2. Тест с Basic пользователем
```bash
# 1. Создать basic пользователя
# 2. Попробовать ai_lawyer (должен работать)

curl -X POST https://cube-demper.shop/api/lawyer/chat \
  -H "Authorization: Bearer {basic_user_token}" \
  -H "Content-Type: application/json" \
  -d '{"message": "test"}'

# Ожидаемый ответ: 200 OK, ответ от AI Lawyer

# 3. Попробовать preorder (НЕ должен работать)
curl -X GET https://cube-demper.shop/api/preorders \
  -H "Authorization: Bearer {basic_user_token}"

# Ожидаемый ответ: 403 Forbidden
{
  "detail": {
    "error": "feature_not_available",
    "feature": "preorder",
    "message": "Доступно на тарифе Стандарт либо доп. услуге «Предзаказ»"
  }
}
```

### 3. Тест лимитов
```bash
# Analytics limit для Basic = 100 товаров
# Проверить что после 100 товаров:
# - Analytics endpoints возвращают ошибку "Лимит аналитики исчерпан (100/100)"
# - Предлагают купить аддон или повысить тариф
```

### 4. Тест аддонов
```bash
# 1. Free пользователь покупает аддон "ai_salesman"
# 2. Должен получить доступ ТОЛЬКО к AI Salesman, но не к другим фичам

curl -X POST https://cube-demper.shop/api/ai/salesman/process-order \
  -H "Authorization: Bearer {free_with_ai_salesman_token}"

# Ожидаемый ответ: 200 OK

curl -X POST https://cube-demper.shop/api/lawyer/chat \
  -H "Authorization: Bearer {free_with_ai_salesman_token}"

# Ожидаемый ответ: 403 Forbidden (нет ai_lawyer feature)
```

---

## Порядок выполнения

### Phase 1: Critical (HIGH priority)
1. ✅ Добавить 4 новых фичи в `feature_access.py`
2. ✅ Защитить `lawyer.py` (10 endpoints)
3. ✅ Защитить `niches.py` (6 endpoints)
4. ✅ Защитить `whatsapp.py` (~25 endpoints)

### Phase 2: Medium priority
5. ✅ Защитить `preorders.py` (4 endpoints)
6. ✅ Защитить `unit_economics.py` (6 endpoints)
7. ✅ Защитить `invoices.py` (1 endpoint)

### Phase 3: LOW priority (может подождать)
8. ✅ Защитить `kaspi.py` analytics (3 endpoints)
9. ✅ Защитить `kaspi.py` demping (3 endpoints)
10. ✅ Защитить `kaspi.py` orders/city (2 endpoints)

### Phase 4: Тестирование
11. ✅ End-to-end тесты всех feature gates
12. ✅ Проверка лимитов (analytics_limit, demping_limit)
13. ✅ Проверка аддонов

---

## Важные замечания

### 1. Webhook endpoints БЕЗ feature gates
`POST /whatsapp/webhook` — НЕ защищать! Это callback от WAHA, не требует авторизации пользователя.

### 2. Публичные endpoints
- `GET /billing/plans`
- `GET /billing/plans-v2`
- `GET /billing/addons`
- `GET /health/*`
- `POST /auth/register`
- `POST /auth/login`

НЕ защищать feature gates — это публичные endpoints.

### 3. Admin endpoints
`/api/admin/*` — уже защищены `get_current_admin_user`, feature gates НЕ нужны.

### 4. Backward compatibility
**При добавлении feature gates существующие пользователи БЕЗ подписки потеряют доступ!**

Решение:
- При миграции автоматически назначить Basic план всем пользователям с `plan_id = NULL` и у которых есть `kaspi_stores`
- Или дать grace period (14 дней) для покупки тарифа

---

## Финальная проверка

### Матрица "Кто что может"

| Фича | Free | Basic | Standard | Premium | Аддон |
|------|------|-------|----------|---------|-------|
| ai_lawyer | ❌ | ✅ | ✅ | ✅ | - |
| analytics | ❌ | ✅ (100) | ✅ (500) | ✅ (unlim) | ✅ (unlim addon) |
| demping | ❌ | ✅ (50) | ✅ (100) | ✅ (200) | ✅ (+100 addon) |
| unit_economics | ❌ | ✅ | ✅ | ✅ | - |
| invoice_glue | ❌ | ✅ | ✅ | ✅ | - |
| orders_view | ❌ | ✅ | ✅ | ✅ | - |
| preorder | ❌ | ❌ | ✅ | ✅ | ✅ (addon) |
| niche_search | ❌ | ❌ | ✅ | ✅ | - |
| whatsapp_auto | ❌ | ❌ | ✅ | ✅ | ✅ (addon) |
| whatsapp_bulk | ❌ | ❌ | ❌ | ✅ | ✅ (addon) |
| city_demping | ❌ | ❌ | ✅ | ✅ | ✅ (addon) |
| ai_salesman | ❌ | ❌ | ❌ | ❌ | ✅ (ONLY addon!) |

