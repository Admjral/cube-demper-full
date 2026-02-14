"""
AI Salesman Service - автоматический менеджер допродаж

Работает на событиях:
1. После покупки - генерирует персональное предложение upsell/cross-sell
2. Повторные продажи - предлагает расходники, аналоги, комплекты
3. Отзывы - просит оставить отзыв с бонусом

Использует Google Gemini для генерации персонализированных сообщений
и WAHA для отправки в WhatsApp.
"""
import logging
import asyncpg
from typing import Optional, Dict, Any, List
from uuid import UUID
from datetime import datetime, timedelta
from dataclasses import dataclass
from enum import Enum

import google.generativeai as genai

logger = logging.getLogger(__name__)


class SalesmanTrigger(str, Enum):
    """Триггеры для ИИ продажника"""
    NEW_ORDER = "new_order"  # Новый заказ - допродажа
    REPEAT_CUSTOMER = "repeat_customer"  # Повторный клиент - лояльность
    REVIEW_REQUEST = "review_request"  # Запрос отзыва
    ABANDONED_CART = "abandoned_cart"  # Брошенная корзина (будущее)


@dataclass
class OrderContext:
    """Контекст заказа для генерации сообщения"""
    order_id: UUID
    store_id: UUID
    user_id: UUID
    customer_phone: str
    customer_name: Optional[str]
    items: List[Dict[str, Any]]  # Товары в заказе
    total_price: int  # В тиынах
    order_date: datetime
    is_first_purchase: bool
    purchase_history: List[Dict[str, Any]]  # Предыдущие покупки


@dataclass
class SalesmanMessage:
    """Результат генерации сообщения"""
    text: str
    trigger: SalesmanTrigger
    products_suggested: List[str]  # SKU предложенных товаров
    generated_at: datetime


class AISalesmanService:
    """
    Сервис ИИ продажника.

    Генерирует персонализированные сообщения для допродаж
    на основе контекста заказа и каталога магазина.
    """

    # System prompts для разных сценариев
    SYSTEM_PROMPTS = {
        SalesmanTrigger.NEW_ORDER: """Ты ИИ продажник для маркетплейса. Твоя задача - составить короткое, дружелюбное сообщение покупателю в WhatsApp с предложением дополнительных товаров.

Правила:
1. Сообщение должно быть на русском языке
2. Максимум 3-4 предложения
3. Упомяни 1-2 релевантных товара из каталога
4. Не используй эмодзи больше 1-2 штук
5. Обращайся на "вы"
6. Не предлагай скидки и промокоды
7. Не обещай того, чего нет в каталоге

Формат ответа:
Только текст сообщения, без пояснений.""",

        SalesmanTrigger.REPEAT_CUSTOMER: """Ты ИИ продажник для маркетплейса. Покупатель делает повторную покупку - это важный клиент!

Твоя задача - составить теплое сообщение в WhatsApp:
1. Поблагодари за повторную покупку
2. Предложи 1-2 товара на основе истории покупок

Правила:
- Русский язык
- Максимум 4 предложения
- Дружелюбный тон
- Без навязчивости
- Не предлагай скидки и промокоды

Формат ответа:
Только текст сообщения.""",

        SalesmanTrigger.REVIEW_REQUEST: """Ты ИИ помощник для маркетплейса. Твоя задача - вежливо попросить покупателя оставить отзыв.

Правила:
1. Русский язык
2. 2-3 предложения максимум
3. Не давить, просто напомнить

Формат ответа:
Только текст сообщения.""",
    }

    def __init__(self, gemini_api_key: str = None):
        """
        Инициализация сервиса.

        Args:
            gemini_api_key: API ключ Gemini (или из settings)
        """
        self._gemini_api_key = gemini_api_key
        self._configured = False

    def _configure_gemini(self):
        """Configure Gemini API"""
        if not self._configured:
            from ..config import settings

            api_key = self._gemini_api_key or settings.gemini_api_key
            if not api_key:
                raise ValueError("Gemini API key not configured")

            genai.configure(api_key=api_key)
            self._configured = True

    def _get_model(self, system_prompt: str):
        """Get Gemini model with system instruction"""
        self._configure_gemini()
        from ..config import settings

        return genai.GenerativeModel(
            model_name=settings.gemini_model,
            system_instruction=system_prompt
        )

    async def generate_upsell_message(
        self,
        context: OrderContext,
        catalog: List[Dict[str, Any]],
        shop_settings: Dict[str, Any] = None,
    ) -> SalesmanMessage:
        """
        Сгенерировать сообщение допродажи.

        Args:
            context: Контекст заказа
            catalog: Каталог товаров магазина
            shop_settings: Настройки магазина (тон, скидки, etc.)

        Returns:
            Сгенерированное сообщение
        """
        # Определяем триггер
        trigger = SalesmanTrigger.REPEAT_CUSTOMER if not context.is_first_purchase else SalesmanTrigger.NEW_ORDER

        # Подготавливаем контекст для ИИ
        user_prompt = self._build_user_prompt(context, catalog, shop_settings)

        try:
            from ..config import settings

            model = self._get_model(self.SYSTEM_PROMPTS[trigger])
            response = await model.generate_content_async(
                user_prompt,
                generation_config=genai.GenerationConfig(
                    max_output_tokens=500,
                    temperature=0.7,
                )
            )

            message_text = response.text.strip()

            # Извлекаем упомянутые товары (упрощенно)
            suggested_products = self._extract_suggested_products(message_text, catalog)

            return SalesmanMessage(
                text=message_text,
                trigger=trigger,
                products_suggested=suggested_products,
                generated_at=datetime.utcnow(),
            )

        except Exception as e:
            logger.error("Failed to generate upsell message: %s", str(e))
            # Fallback на шаблон
            return self._get_fallback_message(context, trigger)

    def _build_user_prompt(
        self,
        context: OrderContext,
        catalog: List[Dict[str, Any]],
        shop_settings: Dict[str, Any] = None,
    ) -> str:
        """Построить промпт для Gemini"""
        # Форматируем купленные товары
        items_text = "\n".join([
            f"- {item.get('name', 'Товар')} (цена: {item.get('price', 0) / 100:.0f} тг)"
            for item in context.items[:5]  # Максимум 5 товаров
        ])

        # Релевантные товары из каталога (до 10)
        relevant_catalog = self._get_relevant_catalog(context.items, catalog)
        catalog_text = "\n".join([
            f"- {p.get('name', '')} (цена: {p.get('price', 0) / 100:.0f} тг, артикул: {p.get('sku', '')})"
            for p in relevant_catalog[:10]
        ])

        # История покупок
        history_text = ""
        if context.purchase_history:
            history_text = f"\n\nИстория покупок клиента ({len(context.purchase_history)} заказов ранее):"
            for hist in context.purchase_history[:3]:
                history_text += f"\n- {hist.get('name', 'Товар')} ({hist.get('date', '')})"

        prompt = f"""Клиент {context.customer_name or 'Покупатель'} только что купил:
{items_text}

Общая сумма: {context.total_price / 100:.0f} тг
{"Это первая покупка клиента." if context.is_first_purchase else "Это повторный клиент."}
{history_text}

Доступные товары из каталога для допродажи:
{catalog_text if catalog_text else "Каталог недоступен"}

Составь короткое сообщение для отправки в WhatsApp."""

        # Добавляем настройки магазина если есть
        if shop_settings:
            if shop_settings.get('tone'):
                prompt += f"\n\nТон общения: {shop_settings['tone']}"

        return prompt

    def _get_relevant_catalog(
        self,
        purchased_items: List[Dict[str, Any]],
        catalog: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Получить релевантные товары из каталога для допродажи"""
        if not catalog:
            return []

        # Собираем категории купленных товаров
        purchased_categories = set()
        purchased_skus = set()

        for item in purchased_items:
            if item.get('category'):
                purchased_categories.add(item['category'])
            if item.get('sku'):
                purchased_skus.add(item['sku'])

        # Фильтруем каталог
        relevant = []
        for product in catalog:
            # Пропускаем уже купленные
            if product.get('sku') in purchased_skus:
                continue

            # Добавляем товары из тех же категорий
            if product.get('category') in purchased_categories:
                relevant.append(product)
            # Или с похожей ценой (±30%)
            elif purchased_items:
                avg_price = sum(i.get('price', 0) for i in purchased_items) / len(purchased_items)
                product_price = product.get('price', 0)
                if product_price and 0.7 * avg_price <= product_price <= 1.5 * avg_price:
                    relevant.append(product)

        # Сортируем по популярности/рейтингу если есть
        relevant.sort(key=lambda x: x.get('sales_count', 0), reverse=True)

        return relevant[:10]

    def _extract_suggested_products(
        self,
        message: str,
        catalog: List[Dict[str, Any]],
    ) -> List[str]:
        """Извлечь SKU упомянутых товаров из сообщения"""
        suggested = []
        message_lower = message.lower()

        for product in catalog:
            name = product.get('name', '').lower()
            sku = product.get('sku', '')

            # Проверяем упоминание названия товара
            if name and len(name) > 3 and name in message_lower:
                suggested.append(sku)

        return suggested[:5]  # Максимум 5

    def _get_fallback_message(
        self,
        context: OrderContext,
        trigger: SalesmanTrigger,
    ) -> SalesmanMessage:
        """Получить fallback сообщение если Gemini недоступен"""
        if trigger == SalesmanTrigger.REPEAT_CUSTOMER:
            text = f"Здравствуйте{', ' + context.customer_name if context.customer_name else ''}! Спасибо за повторный заказ. Мы ценим вашу лояльность! Если нужна помощь с выбором товаров - пишите."
        elif trigger == SalesmanTrigger.REVIEW_REQUEST:
            text = f"Здравствуйте! Надеемся, вам понравился товар. Будем благодарны за отзыв - это помогает другим покупателям."
        else:
            text = f"Здравствуйте{', ' + context.customer_name if context.customer_name else ''}! Спасибо за заказ. Если понадобятся дополнительные товары - будем рады помочь!"

        return SalesmanMessage(
            text=text,
            trigger=trigger,
            products_suggested=[],
            generated_at=datetime.utcnow(),
        )

    async def generate_review_request(
        self,
        context: OrderContext,
    ) -> SalesmanMessage:
        """
        Сгенерировать запрос на отзыв.

        Args:
            context: Контекст заказа
        """
        user_prompt = f"""Клиент {context.customer_name or 'Покупатель'} купил:
{', '.join(item.get('name', 'Товар') for item in context.items[:3])}

{"Это первая покупка." if context.is_first_purchase else f"Клиент делал {len(context.purchase_history)} покупок ранее."}

Составь вежливую просьбу оставить отзыв."""

        try:
            model = self._get_model(self.SYSTEM_PROMPTS[SalesmanTrigger.REVIEW_REQUEST])
            response = await model.generate_content_async(
                user_prompt,
                generation_config=genai.GenerationConfig(
                    max_output_tokens=200,
                    temperature=0.7,
                )
            )

            return SalesmanMessage(
                text=response.text.strip(),
                trigger=SalesmanTrigger.REVIEW_REQUEST,
                products_suggested=[],
                generated_at=datetime.utcnow(),
            )

        except Exception as e:
            logger.error("Failed to generate review request: %s", str(e))
            return self._get_fallback_message(context, SalesmanTrigger.REVIEW_REQUEST)


async def process_order_for_upsell(
    order_id: UUID,
    pool: asyncpg.Pool,
    send_message: bool = True,
) -> Optional[SalesmanMessage]:
    """
    Обработать заказ для автоматической допродажи.

    Эта функция вызывается после создания нового заказа.

    Args:
        order_id: ID заказа
        pool: Пул соединений к БД
        send_message: Отправить сообщение в WhatsApp

    Returns:
        Сгенерированное сообщение или None
    """
    async with pool.acquire() as conn:
        # 0. Дедупликация — не отправляем повторно для того же заказа
        existing = await conn.fetchval(
            "SELECT id FROM ai_salesman_messages WHERE order_id = $1",
            order_id
        )
        if existing:
            logger.info("AI salesman already sent for order %s, skipping", order_id)
            return None

        # 1. Получаем данные заказа
        order = await conn.fetchrow("""
            SELECT o.*, s.user_id, s.name as store_name
            FROM orders o
            JOIN kaspi_stores s ON o.store_id = s.id
            WHERE o.id = $1
        """, order_id)

        if not order:
            logger.warning("Order not found: %s", order_id)
            return None

        # Проверяем наличие телефона
        customer_phone = order.get('customer_phone')
        if not customer_phone:
            logger.info("No customer phone for order %s", order_id)
            return None

        # 2. Получаем товары заказа
        items = await conn.fetch("""
            SELECT oi.*, p.category, p.kaspi_sku as product_sku
            FROM order_items oi
            LEFT JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = $1
        """, order_id)

        items_list = [dict(item) for item in items]

        # 3. Проверяем историю покупок клиента
        purchase_history = await conn.fetch("""
            SELECT o.id, o.order_date, oi.name
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            WHERE o.store_id = $1 AND o.customer_phone = $2 AND o.id != $3
            ORDER BY o.order_date DESC
            LIMIT 10
        """, order['store_id'], customer_phone, order_id)

        is_first_purchase = len(purchase_history) == 0

        # 4. Получаем каталог магазина для допродажи
        catalog = await conn.fetch("""
            SELECT p.id, p.name, p.kaspi_sku, p.price, p.category
            FROM products p
            WHERE p.store_id = $1 AND p.is_active = TRUE
            ORDER BY p.sales_count DESC NULLS LAST
            LIMIT 50
        """, order['store_id'])

        catalog_list = [dict(p) for p in catalog]

        # 5. Получаем настройки магазина для ИИ
        shop_settings = await conn.fetchrow("""
            SELECT ai_tone, ai_enabled, ai_max_messages_per_day
            FROM kaspi_stores
            WHERE id = $1
        """, order['store_id'])

        # Проверяем включен ли ИИ для магазина
        if shop_settings and not shop_settings.get('ai_enabled', True):
            logger.info("AI disabled for store %s", order['store_id'])
            return None

        # Проверяем дневной лимит сообщений
        max_per_day = (shop_settings.get('ai_max_messages_per_day') or 50) if shop_settings else 50
        today_count = await conn.fetchval("""
            SELECT COUNT(*) FROM ai_salesman_messages
            WHERE store_id = $1 AND created_at >= CURRENT_DATE
        """, order['store_id'])

        if today_count >= max_per_day:
            logger.info("Daily message limit (%d) reached for store %s", max_per_day, order['store_id'])
            return None

        # 6. Формируем контекст
        context = OrderContext(
            order_id=order_id,
            store_id=order['store_id'],
            user_id=order['user_id'],
            customer_phone=customer_phone,
            customer_name=order.get('customer_name'),
            items=items_list,
            total_price=order.get('total_price', 0),
            order_date=order.get('order_date', datetime.utcnow()),
            is_first_purchase=is_first_purchase,
            purchase_history=[dict(p) for p in purchase_history],
        )

        settings_dict = None
        if shop_settings:
            settings_dict = {
                'tone': shop_settings.get('ai_tone'),
            }

        # 7. Генерируем сообщение
        salesman = AISalesmanService()
        message = await salesman.generate_upsell_message(context, catalog_list, settings_dict)

        logger.info(
            "Generated upsell message for order %s, trigger: %s",
            order_id, message.trigger.value
        )

        # 8. Отправляем в WhatsApp если нужно
        if send_message and message.text:
            # Валидация телефона: минимум 10 цифр
            phone_digits = "".join(filter(str.isdigit, customer_phone))
            if len(phone_digits) < 10:
                logger.warning("Invalid phone number for order %s: %s", order_id, customer_phone)
                return message

            try:
                # Проверяем есть ли активная WhatsApp сессия у пользователя
                wa_session = await conn.fetchrow("""
                    SELECT session_name, status
                    FROM whatsapp_sessions
                    WHERE user_id = $1 AND status = 'WORKING'
                """, order['user_id'])

                if wa_session:
                    from .waha_service import get_waha_service

                    waha = get_waha_service()
                    await waha.send_text(
                        phone=customer_phone,
                        text=message.text,
                        session=wa_session['session_name'],
                    )

                    logger.info(
                        "Sent upsell message to %s for order %s",
                        customer_phone, order_id
                    )

                    # Сохраняем в историю
                    await conn.execute("""
                        INSERT INTO ai_salesman_messages
                        (order_id, store_id, customer_phone, trigger_type, message_text, products_suggested, sent_at)
                        VALUES ($1, $2, $3, $4, $5, $6, NOW())
                    """, order_id, order['store_id'], customer_phone,
                        message.trigger.value, message.text, message.products_suggested)

                else:
                    logger.warning(
                        "No active WhatsApp session for user %s, message not sent",
                        order['user_id']
                    )
            except Exception as e:
                logger.error("Failed to send WhatsApp message: %s", str(e))

        return message


# Singleton instance
_ai_salesman: Optional[AISalesmanService] = None


def get_ai_salesman() -> AISalesmanService:
    """Получить singleton instance AISalesmanService"""
    global _ai_salesman

    if _ai_salesman is None:
        _ai_salesman = AISalesmanService()

    return _ai_salesman


# ==================== INCOMING MESSAGE HANDLER ====================

CHAT_SYSTEM_PROMPT = """Ты ИИ-продажник для магазина на маркетплейсе Kaspi.kz. Клиент написал тебе в WhatsApp. Твоя задача — помочь клиенту и при уместности предложить товары из каталога магазина.

Правила:
1. Отвечай на русском языке
2. Будь вежливым, дружелюбным и полезным
3. Если клиент спрашивает о товаре — дай информацию из каталога
4. Если клиент жалуется — извинись и предложи решение
5. Если уместно — порекомендуй 1-2 товара из каталога
6. Максимум 3-5 предложений
7. Не обещай того, чего нет
8. Не давай скидок без разрешения магазина
9. Обращайся на "вы"

Формат ответа: только текст сообщения, без пояснений."""


async def handle_incoming_message(
    session_name: str,
    from_number: str,
    message_text: str,
    pool: "asyncpg.Pool",
) -> Optional[str]:
    """
    Обработать входящее сообщение от клиента и сгенерировать ответ.

    Вызывается из webhook при event == "message".
    Проверяет ai_enabled для магазина, дневной лимит, генерирует ответ через Gemini,
    отправляет обратно через WAHA.

    Args:
        session_name: Имя WhatsApp сессии (привязана к user_id)
        from_number: Номер телефона отправителя (без @c.us)
        message_text: Текст входящего сообщения
        pool: Пул соединений к БД

    Returns:
        Текст ответа или None если ответ не отправлен
    """
    if not message_text or not message_text.strip():
        return None

    async with pool.acquire() as conn:
        # 1. Найти пользователя и магазин по сессии
        session = await conn.fetchrow("""
            SELECT ws.user_id, ws.session_name
            FROM whatsapp_sessions ws
            WHERE ws.session_name = $1 AND ws.status = 'WORKING'
        """, session_name)

        if not session:
            logger.debug("No active session found for %s", session_name)
            return None

        user_id = session["user_id"]

        # 2. Получить магазины пользователя с ai_enabled
        stores = await conn.fetch("""
            SELECT id, name, merchant_id,
                   COALESCE(ai_enabled, false) as ai_enabled,
                   ai_tone, ai_discount_percent, ai_promo_code,
                   COALESCE(ai_max_messages_per_day, 50) as ai_max_messages_per_day
            FROM kaspi_stores
            WHERE user_id = $1 AND is_active = TRUE
        """, user_id)

        if not stores:
            return None

        # Берём первый магазин с ai_enabled=true
        store = None
        for s in stores:
            if s["ai_enabled"]:
                store = s
                break

        if not store:
            logger.debug("AI Salesman disabled for all stores of user %s", user_id)
            return None

        store_id = store["id"]

        # 3. Проверить дневной лимит
        max_per_day = store["ai_max_messages_per_day"]
        today_count = await conn.fetchval("""
            SELECT COUNT(*) FROM ai_salesman_messages
            WHERE store_id = $1 AND created_at >= CURRENT_DATE
        """, store_id)

        if today_count >= max_per_day:
            logger.info("Daily AI limit (%d) reached for store %s", max_per_day, store_id)
            return None

        # 4. Загрузить последние сообщения для контекста (история чата)
        recent_messages = await conn.fetch("""
            SELECT message_text, 'assistant' as role, created_at
            FROM ai_salesman_messages
            WHERE store_id = $1 AND customer_phone = $2
            ORDER BY created_at DESC
            LIMIT 5
        """, store_id, from_number)

        # 5. Загрузить каталог магазина (top товары)
        catalog = await conn.fetch("""
            SELECT name, kaspi_sku, price
            FROM products
            WHERE store_id = $1
            ORDER BY price DESC
            LIMIT 20
        """, store_id)

        catalog_text = "\n".join([
            f"- {p['name']} ({p['price']}₸)" for p in catalog
        ]) if catalog else "Каталог недоступен"

        # 6. Загрузить историю покупок клиента
        purchase_history = await conn.fetch("""
            SELECT o.total_price, o.status, oi.name
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            WHERE o.store_id = $1 AND o.customer_phone = $2
            ORDER BY o.created_at DESC
            LIMIT 5
        """, store_id, from_number)

        history_text = ""
        if purchase_history:
            history_text = "\nИстория покупок клиента:\n" + "\n".join([
                f"- {p['name'] or 'Товар'}" for p in purchase_history
            ])

        # 7. Собрать контекст чата
        chat_context = ""
        if recent_messages:
            msgs = list(reversed(recent_messages))
            chat_context = "\nПоследние сообщения ИИ этому клиенту:\n" + "\n".join([
                f"- Ты: {m['message_text'][:100]}" for m in msgs
            ])

        # 8. Сформировать промпт
        tone_instruction = ""
        if store["ai_tone"]:
            tone_instruction = f"\nТон общения: {store['ai_tone']}"

        discount_instruction = ""
        if store["ai_discount_percent"]:
            discount_instruction = f"\nМожно предложить скидку до {store['ai_discount_percent']}%"
        if store["ai_promo_code"]:
            discount_instruction += f"\nПромокод: {store['ai_promo_code']}"

        system_prompt = CHAT_SYSTEM_PROMPT + tone_instruction + discount_instruction

        user_prompt = f"""Магазин: {store['name']}

Каталог товаров:
{catalog_text}
{history_text}
{chat_context}

Клиент написал: "{message_text}"

Составь ответ."""

        # 9. Генерация через Gemini
        try:
            salesman = get_ai_salesman()
            model = salesman._get_model(system_prompt)
            response = await model.generate_content_async(
                user_prompt,
                generation_config=genai.GenerationConfig(
                    max_output_tokens=500,
                    temperature=0.7,
                ),
            )
            reply_text = response.text.strip()
        except Exception as e:
            logger.error("Gemini failed for incoming message: %s", e)
            reply_text = f"Здравствуйте! Спасибо за сообщение. Наш менеджер свяжется с вами в ближайшее время."

        # 10. Отправить ответ через WAHA
        try:
            from .waha_service import get_waha_service
            waha = get_waha_service()
            await waha.send_text(
                phone=from_number,
                text=reply_text,
                session=session_name,
            )
            logger.info("AI Salesman replied to %s: %s", from_number, reply_text[:80])
        except Exception as e:
            logger.error("Failed to send AI reply to %s: %s", from_number, e)
            return None

        # 11. Сохранить в историю
        try:
            await conn.execute("""
                INSERT INTO ai_salesman_messages
                (store_id, customer_phone, trigger_type, message_text, products_suggested, sent_at)
                VALUES ($1, $2, 'incoming_reply', $3, $4, NOW())
            """, store_id, from_number, reply_text, [])
        except Exception as e:
            logger.warning("Failed to save AI message to history: %s", e)

        return reply_text
