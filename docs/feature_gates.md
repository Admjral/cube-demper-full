# Feature Gates — Реализация

## Что сделано

Закрыли ~60 платных endpoints feature gates. Раньше Free-пользователи имели доступ ко всем функциям бесплатно (Gemini API, WAHA, Kaspi API расходовались впустую).

---

## Паттерн

```python
# БЫЛО — любой авторизованный пользователь:
current_user: Annotated[dict, Depends(get_current_user)]

# СТАЛО — только с нужной фичей в подписке/аддоне:
current_user: Annotated[dict, require_feature("ai_lawyer")]
```

При отсутствии фичи → **403** с телом:
```json
{
  "error": "feature_not_available",
  "feature": "ai_lawyer",
  "message": "Доступно на тарифе Базовый, Стандарт, Премиум"
}
```

При превышении лимита → **403** с телом:
```json
{
  "error": "limit_exceeded",
  "feature": "demping",
  "current": 50,
  "limit": 50,
  "message": "Лимит демпинга исчерпан (50/50). Приобретите пакет «Демпинг +100 товаров» или повысьте тариф."
}
```

---

## Матрица доступа

| Фича | Free | Basic (21 990₸) | Standard (27 990₸) | Premium (33 990₸) | Аддон |
|------|------|-----------------|--------------------|--------------------|-------|
| demping | ❌ | ✅ (50) | ✅ (100) | ✅ (200) | +100 за 10 000₸ |
| analytics | ❌ | ✅ (500) | ✅ (1000) | ✅ (безлимит) | безлимит 20 000₸ |
| exclude_own_stores | ❌ | ✅ | ✅ | ✅ | — |
| invoice_glue | ❌ | ✅ | ✅ | ✅ | — |
| orders_view | ❌ | ✅ | ✅ | ✅ | — |
| unit_economics | ❌ | ✅ | ✅ | ✅ | — |
| ai_lawyer | ❌ | ✅ | ✅ | ✅ | — |
| priority_support | ❌ | ✅ | ✅ | ✅ | — |
| preorder | ❌ | ❌ | ✅ | ✅ | 10 000₸ |
| whatsapp_auto | ❌ | ❌ | ✅ | ✅ | 15 000₸ |
| niche_search | ❌ | ❌ | ✅ | ✅ | — |
| city_demping | ❌ | ❌ | ✅ | ✅ | 10 000₸ |
| whatsapp_bulk | ❌ | ❌ | ❌ | ✅ | 15 000₸ |
| delivery_demping | ❌ | ❌ | ❌ | ✅ | 10 000₸ |
| priority_products | ❌ | ❌ | ❌ | ✅ | — |
| ai_salesman | ❌ | ❌ | ❌ | ❌ | 15 000₸ |

**Тестовый период:** 7 дней (план Basic).

---

## Backend — изменённые файлы

### `services/feature_access.py`
- Добавлены 4 новых фичи в `FEATURE_REQUIREMENTS`: `niche_search`, `city_demping`, `delivery_demping`, `priority_products`
- Добавлены названия аддонов в `ADDON_NAMES`: `city_demping`, `delivery_demping`
- `check_limit()` — проверка лимитов демпинга и аналитики (существовала, но не вызывалась)

### `routers/lawyer.py` — 16 endpoints → `ai_lawyer`
Все endpoints кроме `get_faq` (публичный):
- Chat: `create_session`, `chat`, `get_history`, `list_sessions`, `delete_session`, `clear_history`
- Calculators: `calculate_penalty`, `calculate_compensation`, `calculate_warranty`, `calculate_refund`
- Documents: `generate_document`, `list_documents`, `get_document`, `delete_document`, `download_document_pdf`
- FAQ: `search_faq`

### `routers/preorders.py` — 4 endpoints → `preorder`
- `list_preorders`, `create_preorder`, `update_preorder`, `delete_preorder`

### `routers/unit_economics.py` — ~14 endpoints → `unit_economics`
- 9 authenticated endpoints: заменён `get_current_user` → `require_feature`
- 5 ранее публичных endpoints: добавлен параметр `current_user` с `require_feature`
- `calculate_unit_economics`, `get_categories`, `get_subcategories`, `get_commission_rate`, `parse_kaspi_url`, `save_calculation`, `list_calculations`, `get_calculation`, `delete_calculation`, и др.

### `routers/invoices.py` — 1 endpoint → `invoice_glue`
- `process_invoices` (склейка накладных)
- `get_layout_types` оставлен публичным

### `routers/niches.py` — 6 endpoints → `niche_search`
- `get_categories`, `get_category_details`, `get_products`, `get_product_details`, `calculate_unit_economics`, `get_niche_stats`

### `routers/whatsapp.py` — 29 endpoints
**`whatsapp_auto`** (25 endpoints):
- Сессии: `create_session`, `list_sessions`, `get_session`, `delete_session`, `get_qr`, `check_status`, `restart_session`, `logout_session`, `get_session_info`
- Сообщения: `send_message`, `send_template_message`, `get_messages`, `get_chat_messages`, `get_chats`, `mark_as_read`
- Шаблоны: `list_templates`, `create_template`, `update_template`, `delete_template`
- Контакты: `list_contacts`, `create_contact`, `delete_contact`
- Настройки: `get_settings`, `update_settings`
- Stats: `get_stats`

**`whatsapp_bulk`** (4 endpoints):
- `list_broadcasts`, `create_broadcast`, `get_broadcast`, `cancel_broadcast`

**Без gate:** `waha_webhook` (публичный webhook)

### `routers/kaspi.py` — 36 endpoints

**`demping`** (20 endpoints):
- Stores: `list_stores`, `update_store_api_token`, `get_token_alerts`, `test_store_api_token`, `authenticate_store`, `verify_sms`, `delete_store`
- Products: `list_products`, `update_product`, `get_product_demping_details`, `bulk_update_products`, `check_product_demping`, `run_product_demping`
- Store products: `list_store_products`, `get_store_demping_settings`, `update_store_demping_settings`
- Sync: `sync_store_products_by_id`, `sync_store_prices`
- Price: `get_product_price_history`, `update_product_price`
- Other: `test_preorder`

**`analytics`** (4 endpoints):
- `get_analytics`, `get_store_stats`, `get_store_analytics`, `get_top_products`

**`city_demping`** (5 endpoints):
- `get_product_city_prices`, `set_product_city_prices`, `update_product_city_price`, `delete_product_city_price`, `run_product_city_demping`

**`orders_view`** (5 endpoints):
- `get_order_customer`, `process_order_event`, `get_recent_orders`, `get_orders_polling_status`, `toggle_orders_polling`, `sync_store_orders`

**Без gate** (2 endpoints):
- `list_cities`, `get_order_event_types` (справочные данные)

### `routers/billing.py` — Trial фиксы
- **analytics_limit баг**: было `plan['demping_limit']` (50), стало `plan['analytics_limit']` (500)
- **trial_days**: хардкод 7 дней

---

## Проверки лимитов внутри endpoints

### Демпинг лимит (`update_product`, `bulk_update_products`)
При включении `bot_active = true`:
1. Считаем сколько товаров уже с `bot_active = true` у пользователя
2. `check_limit(pool, user_id, 'demping', active_count)`
3. Если превышен → 403 `limit_exceeded`

### Приоритетные товары (`update_product`)
При включении `is_priority = true`:
1. `check_feature_access(pool, user_id, 'priority_products')`
2. Если нет фичи → 403 `feature_not_available`
3. Лимит: макс 10 приоритетных товаров на магазин (отдельная проверка)

### Демпер по доставке (`update_product`)
При включении `delivery_demping_enabled = true`:
1. `check_feature_access(pool, user_id, 'delivery_demping')`
2. Если нет фичи → 403 `feature_not_available`

---

## Frontend

### `hooks/api/use-features.ts`
Добавлен `FEATURE_UPGRADE_INFO` для 8 новых фич:
```typescript
niche_search: { plans: ['Стандарт', 'Премиум'], addons: [] },
city_demping: { plans: ['Стандарт', 'Премиум'], addons: ['Демпер по городам'] },
ai_lawyer: { plans: ['Базовый', 'Стандарт', 'Премиум'], addons: [] },
unit_economics: { plans: ['Базовый', 'Стандарт', 'Премиум'], addons: [] },
invoice_glue: { plans: ['Базовый', 'Стандарт', 'Премиум'], addons: [] },
analytics: { plans: ['Базовый', 'Стандарт', 'Премиум'], addons: ['Аналитика безлимит'] },
demping: { plans: ['Базовый', 'Стандарт', 'Премиум'], addons: ['Демпинг +100'] },
orders_view: { plans: ['Базовый', 'Стандарт', 'Премиум'], addons: [] },
```

### Страница ИИ-Юриста (`dashboard/ai-lawyer/page.tsx`)
Обёрнута в `<FeatureGate feature="ai_lawyer">` — Free-пользователь видит заглушку "Улучшите тариф".

### Страница WhatsApp (`dashboard/whatsapp/page.tsx`)
- Вся страница: `<FeatureGate feature="whatsapp_auto">`
- Вкладка Broadcasts: дополнительно `<FeatureGate feature="whatsapp_bulk">`

### API client (`lib/api.ts`)
При получении 403 с `error: "feature_not_available"` — показывает toast с сообщением из backend (вместо generic "Ошибка 403").

---

## Что НЕ трогали
- `POST /whatsapp/webhook` — публичный (WAHA шлёт события)
- `GET /lawyer/faq` — публичный (FAQ без авторизации)
- `GET /invoices/layout-types` — публичный (справочник сеток)
- `GET /kaspi/cities` — публичный (справочник городов)
- `GET /orders/events/types` — публичный (справочник событий)
- `auth/*`, `billing/*`, `admin/*`, `support/*`, `notifications/*`, `health/*` — своя логика доступа
