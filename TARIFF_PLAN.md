# План реализации системы тарифов Cube Demper

## Цель
Привести систему тарифов в соответствие с бизнес-моделью и добавить проверку лимитов.

## Целевая модель тарифов

### Основные планы
| План | Цена | Аналитика | Демпинг | Функции |
|------|------|-----------|---------|---------|
| **Standard** | 21,990₸ | 500 | 50 | Базовые + ИИ юрист |
| **Plus** | 27,990₸ | 1000 | 100 | + предзаказ, поиск ниш, авто рассылка |
| **Ultra** | 33,990₸ | Безлимит | 200 | + массовая рассылка |

### Решения по ответам:
- **Названия:** Standard / Plus / Ultra
- **Новые пользователи:** Триал 3 дня на Standard
- **TipTopPay:** Отложено, пока без оплаты (структура готова)
- **ИИ юрист:** Только платным (любой тариф)

### Аддоны (отдельные модули)
| Аддон | Цена | Тип |
|-------|------|-----|
| ИИ продажник | 15,000₸ | feature |
| Демпинг +100 | 10,000₸ | limit_increase |
| Предзаказ | 10,000₸ | feature |
| WhatsApp рассылка | 15,000₸ | feature |
| Аналитика безлимит | 20,000₸ | limit_increase |

---

## Фаза 1: Миграции БД

### 1.1 Создать таблицу `plans`
**Файл:** `new-backend/migrations/versions/20260128100000_add_plans_table.py`

```sql
CREATE TABLE plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    price_kzt INTEGER NOT NULL,
    billing_period VARCHAR(20) DEFAULT 'monthly',
    analytics_limit INTEGER,  -- NULL = безлимит
    demping_limit INTEGER NOT NULL,
    features JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 1.2 Создать таблицу `addons`
**Файл:** `new-backend/migrations/versions/20260128100100_add_addons_table.py`

```sql
CREATE TABLE addons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    price_kzt INTEGER NOT NULL,
    addon_type VARCHAR(30) NOT NULL,  -- 'feature' | 'limit_increase'
    limit_type VARCHAR(30),           -- 'demping' | 'analytics'
    limit_increase INTEGER,
    feature_code VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 1.3 Создать таблицу `user_addons`
**Файл:** `new-backend/migrations/versions/20260128100200_add_user_addons_table.py`

```sql
CREATE TABLE user_addons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    addon_id UUID REFERENCES addons(id),
    start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_date TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    payment_id UUID REFERENCES payments(id),
    auto_renew BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_user_addons_user ON user_addons(user_id, status);
```

### 1.4 Изменить таблицу `subscriptions`
**Файл:** `new-backend/migrations/versions/20260128100300_alter_subscriptions.py`

```sql
ALTER TABLE subscriptions
    ADD COLUMN plan_id UUID REFERENCES plans(id),
    ADD COLUMN analytics_limit INTEGER,
    ADD COLUMN demping_limit INTEGER,
    ADD COLUMN features JSONB DEFAULT '[]',
    ADD COLUMN auto_renew BOOLEAN DEFAULT TRUE;
```

### 1.5 Изменить таблицу `payments`
**Файл:** `new-backend/migrations/versions/20260128100400_alter_payments.py`

```sql
ALTER TABLE payments
    ADD COLUMN payment_type VARCHAR(30) DEFAULT 'subscription',
    ADD COLUMN addon_id UUID REFERENCES addons(id),
    ADD COLUMN tiptoppay_invoice_id VARCHAR(255);
```

### 1.6 Seed данные
**Файл:** `new-backend/migrations/versions/20260128100500_seed_plans_addons.py`

```sql
-- Планы
INSERT INTO plans (code, name, price_kzt, analytics_limit, demping_limit, features, display_order)
VALUES
    ('standard', 'Standard', 21990, 500, 50, '["ai_lawyer"]'::jsonb, 1),
    ('plus', 'Plus', 27990, 1000, 100, '["ai_lawyer", "preorder", "niche_search", "auto_broadcast"]'::jsonb, 2),
    ('ultra', 'Ultra', 33990, NULL, 200, '["ai_lawyer", "preorder", "niche_search", "auto_broadcast", "mass_broadcast"]'::jsonb, 3);

-- Аддоны
INSERT INTO addons (code, name, price_kzt, addon_type, limit_type, limit_increase, feature_code)
VALUES
    ('ai_salesman', 'ИИ продажник', 15000, 'feature', NULL, NULL, 'ai_salesman'),
    ('demping_100', 'Демпинг +100 товаров', 10000, 'limit_increase', 'demping', 100, NULL),
    ('preorder', 'Предзаказ', 10000, 'feature', NULL, NULL, 'preorder'),
    ('whatsapp_broadcast', 'WhatsApp рассылка', 15000, 'feature', NULL, NULL, 'whatsapp_broadcast'),
    ('analytics_unlimited', 'Аналитика безлимит', 20000, 'limit_increase', 'analytics', NULL, NULL);
```

---

## Фаза 2: Backend сервисы

### 2.1 Создать `app/services/limits_service.py`
Функции:
- `get_user_limits(user_id)` → UserLimitsResponse
- `check_demping_limit(user_id)` → (can_add, current, limit)
- `check_analytics_limit(user_id)` → (can_add, current, limit)
- `check_feature_access(user_id, feature)` → bool

### 2.2 Создать `app/services/tiptoppay_service.py` (ОТЛОЖЕНО)
> TipTopPay интеграция отложена. Пока создаём только структуру подписок.
> Подписки активируются через админ-панель вручную.

### 2.3 Обновить `app/dependencies.py`
Добавить:
```python
def require_feature(feature: str):
    """Dependency для проверки доступа к функции"""

async def check_demping_can_add():
    """Dependency для проверки лимита демпинга"""

async def require_active_subscription():
    """Dependency для проверки наличия активной подписки"""
```

---

## Фаза 3: Backend API

### 3.1 Переписать `app/routers/billing.py`
Новые эндпоинты:
- `GET /billing/plans` - из БД
- `GET /billing/addons` - из БД
- `GET /billing/subscription` - с лимитами
- `GET /billing/limits` - только лимиты
- `POST /billing/subscribe` - активация подписки (пока без оплаты, для тестов)
- `POST /billing/cancel` - отмена
- ~~`POST /billing/create-payment`~~ - ОТЛОЖЕНО
- ~~`POST /billing/webhook/tiptoppay`~~ - ОТЛОЖЕНО

### 3.2 Обновить `app/routers/kaspi.py`
**Строки 489-492** (update_product):
```python
if update_data.bot_active is True:
    can_add, current, limit = await check_demping_limit(user_id, pool)
    if not can_add:
        raise HTTPException(403, f"Demping limit: {current}/{limit}")
```

**Строки 655-678** (bulk_update_products):
```python
# Аналогичная проверка для массового включения
```

### 3.3 Обновить `app/routers/whatsapp.py`
Добавить `Depends(require_feature("whatsapp_broadcast"))` к:
- `POST /send/bulk`

### 3.4 Обновить `app/routers/ai.py`
Добавить `Depends(require_feature("ai_salesman"))` к:
- `POST /salesman/process-order`
- `POST /salesman/process-bulk`
- `PUT /salesman/settings/{store_id}`

Добавить `Depends(require_active_subscription)` к (ИИ юрист только платным):
- `POST /chat` (для lawyer)
- `GET /history/{assistant_type}`

### 3.5 Обновить `app/routers/preorders.py`
Добавить `Depends(require_feature("preorder"))` к роутеру.

### 3.6 Обновить `app/workers/demper_instance.py`
**Метод `fetch_products_for_instance()`:**
Добавить CTE для фильтрации по лимиту демпинга пользователя:
```sql
WITH user_limits AS (
    SELECT user_id,
           COALESCE(s.demping_limit, 0) + COALESCE(addon_bonus, 0) as total_limit
    FROM ...
),
ranked_products AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY ...) as rank
    FROM products WHERE bot_active = TRUE
)
SELECT * FROM ranked_products WHERE rank <= total_limit
```

### 3.7 Удалить из `app/config.py`
```python
# Удалить устаревшие параметры:
plan_free_products_limit
plan_basic_products_limit
plan_pro_products_limit
plan_basic_price_tiyns
plan_pro_price_tiyns
```

---

## Фаза 4: Backend схемы

### 4.1 Обновить `app/schemas/billing.py`
Новые модели:
- `PlanResponse`
- `AddonResponse`
- `UserLimitsResponse`
- `SubscriptionWithLimitsResponse`
- `CreatePaymentRequest`
- `TipTopPayWebhookPayload`

---

## Фаза 5: Frontend

### 5.1 Обновить `frontend/src/types/api.ts`
```typescript
interface Plan { code, name, price_kzt, analytics_limit, demping_limit, features }
interface Addon { code, name, price_kzt, addon_type, ... }
interface UserLimits { analytics_limit, analytics_used, demping_limit, demping_used, features }
```

### 5.2 Обновить `frontend/src/hooks/api/use-billing.ts`
```typescript
usePlans() - GET /billing/plans
useAddons() - GET /billing/addons
useSubscriptionWithLimits() - GET /billing/subscription
useUserLimits() - GET /billing/limits
useCreatePayment() - POST /billing/create-payment
```

### 5.3 Переписать `frontend/src/app/(dashboard)/dashboard/billing/page.tsx`
- Загружать планы из API
- Показывать текущие лимиты
- Редирект на TipTopPay при оплате

### 5.4 Обновить `frontend/src/components/landing/pricing.tsx`
- Актуальные цены (21990, 27990, 33990)
- Актуальные лимиты

### 5.5 Обновить `frontend/src/components/dashboard/sidebar.tsx`
```typescript
const { data: limits } = useUserLimits()

// Условная навигация
{limits?.features.includes('preorder') && <NavItem ... />}
{limits?.features.includes('ai_salesman') && <NavItem ... />}
```

---

## Фаза 6: Тестирование

### 6.1 Проверить миграции
```bash
cd new-backend
alembic upgrade head
alembic downgrade -1
alembic upgrade head
```

### 6.2 Проверить API
```bash
# Получить планы
curl http://localhost:8010/billing/plans

# Получить лимиты
curl -H "Authorization: Bearer $TOKEN" http://localhost:8010/billing/limits
```

### 6.3 Проверить демпинг лимит
1. Создать пользователя с планом "Standard" (50 товаров)
2. Включить демпинг для 50 товаров - OK
3. Попытаться включить 51-й - должна быть ошибка 403

### 6.4 Проверить feature access
1. Пользователь без аддона "ai_salesman"
2. `POST /ai/salesman/process-order` - должна быть ошибка 403

### 6.5 Проверить триал
1. Зарегистрировать нового пользователя
2. Убедиться что создаётся Standard триал на 3 дня
3. Проверить доступ к ИИ юристу

---

## Критические файлы

| Файл | Действие |
|------|----------|
| `new-backend/migrations/versions/` | +6 новых миграций |
| `new-backend/app/services/limits_service.py` | Создать |
| `new-backend/app/dependencies.py` | Добавить require_feature, check_demping_can_add |
| `new-backend/app/routers/billing.py` | Полностью переписать |
| `new-backend/app/routers/kaspi.py` | Добавить проверки лимитов (строки 489, 655) |
| `new-backend/app/routers/whatsapp.py` | Добавить require_feature |
| `new-backend/app/routers/ai.py` | Добавить require_feature |
| `new-backend/app/routers/preorders.py` | Добавить require_feature |
| `new-backend/app/workers/demper_instance.py` | Фильтр по лимитам в SQL |
| `new-backend/app/schemas/billing.py` | Новые Pydantic модели |
| `new-backend/app/config.py` | Удалить старые plan_* параметры |
| `frontend/src/types/api.ts` | Новые типы |
| `frontend/src/hooks/api/use-billing.ts` | Новые хуки |
| `frontend/src/app/(dashboard)/dashboard/billing/page.tsx` | Переписать |
| `frontend/src/components/landing/pricing.tsx` | Обновить цены |
| `frontend/src/components/dashboard/sidebar.tsx` | Условная навигация |

---

## Порядок выполнения

1. **Миграции** (Фаза 1) - сначала БД
2. **Backend сервисы** (Фаза 2) - limits_service
3. **Backend dependencies** (Фаза 2.3) - require_feature, require_active_subscription
4. **Backend API** (Фаза 3) - billing, kaspi, whatsapp, ai, preorders
5. **Backend worker** (Фаза 3.6) - demper_instance
6. **Frontend** (Фаза 5) - типы, хуки, компоненты
7. **Тестирование** (Фаза 6)

---

## Обработка существующих пользователей

При первом запросе `/billing/subscription` для пользователя без подписки:
- Автоматически создать подписку **Standard** со статусом **"trial"** на **3 дня**
- После истечения триала - показать страницу выбора тарифа

---

## Риски и митигация

| Риск | Решение |
|------|---------|
| Пользователи с превышенным лимитом | Не отключать, только блокировать новые |
| TipTopPay недоступен | Ручное подтверждение админом |
| Медленные запросы лимитов | Кэш Redis 5 минут |
