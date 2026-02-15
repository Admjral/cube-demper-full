"""
WhatsApp Automation Service

Автоматическая отправка WhatsApp сообщений при завершении заказа
и создание контекста для ИИ Продажника.
"""

import asyncio
import json
import logging
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

import asyncpg

from .order_event_processor import get_order_event_processor, OrderEvent
from .waha_service import get_waha_service


logger = logging.getLogger(__name__)


def _is_valid_phone(phone: Optional[str]) -> bool:
    """Проверка что телефон валиден (минимум 10 цифр)"""
    if not phone:
        return False
    digits = "".join(filter(str.isdigit, phone))
    return len(digits) >= 10


async def process_order_completed(
    user_id: str,
    store_id: str,
    order_id: str,
    order_code: str,
    pool: asyncpg.Pool,
) -> None:
    """
    Обработка завершённого заказа.

    Флоу:
    1. Проверить что ai_enabled для магазина
    2. Отправить шаблон order_completed (если есть)
    3. Через 2-3 сек отправить follow-up: "Как вам заказ? Все понравилось?"
    4. Создать order_conversation для допродажи (24 часа)
    """
    async with pool.acquire() as conn:
        # Получаем заказ + настройки магазина
        order = await conn.fetchrow("""
            SELECT o.id, o.kaspi_order_code, o.customer_phone, o.customer_name, o.total_price,
                   s.ai_enabled
            FROM orders o
            JOIN kaspi_stores s ON o.store_id = s.id
            WHERE o.id = $1
        """, UUID(order_id))

        if not order:
            logger.warning(f"Order {order_id} not found")
            return

        if not order['ai_enabled']:
            logger.debug(f"AI disabled for order {order_id}, skipping automation")
            return

        customer_phone = order['customer_phone']
        if not _is_valid_phone(customer_phone):
            logger.warning(f"Invalid phone {customer_phone} for order {order_id}")
            return

        # Шаг 1: Отправить шаблон (если активен)
        template_sent = await send_order_completed_template(
            user_id=user_id,
            store_id=store_id,
            order_code=order_code,
            pool=pool,
        )

        # Шаг 2: Follow-up через 2-3 сек
        await asyncio.sleep(2.5 if template_sent else 0.5)

        await send_followup_message(
            user_id=user_id,
            customer_phone=customer_phone,
            language='ru',  # Дефолт, ИИ сам определит потом
            pool=pool,
        )

        # Шаг 3: Создать conversation
        await create_order_conversation(
            order_id=order_id,
            customer_phone=customer_phone,
            pool=pool,
        )

        logger.info(f"Completed order automation for {order_code}")


async def send_order_completed_template(
    user_id: str,
    store_id: str,
    order_code: str,
    pool: asyncpg.Pool,
) -> bool:
    """
    Отправить шаблон order_completed через order_event_processor.

    Returns:
        True если шаблон отправлен успешно
    """
    try:
        processor = get_order_event_processor()
        result = await processor.process_order_event(
            event=OrderEvent.ORDER_COMPLETED,
            user_id=user_id,
            store_id=store_id,
            order_code=order_code,
            pool=pool,
        )

        if result and result.get("status") == "sent":
            logger.info(f"Template sent for order {order_code}")
            return True
        else:
            logger.debug(f"Template not sent for order {order_code}: {result}")
            return False

    except Exception as e:
        logger.error(f"Failed to send template for order {order_code}: {e}")
        return False


async def send_followup_message(
    user_id: str,
    customer_phone: str,
    language: str = 'ru',
    pool: asyncpg.Pool = None,
) -> None:
    """
    Отправить follow-up сообщение: "Как вам заказ? Все понравилось?"

    Сообщение на русском или казахском языке.
    """
    messages = {
        'ru': "Как вам заказ? Все понравилось? 😊",
        'kz': "Тапсырыс ұнады ма? Барлығы жақсы ма? 😊",
    }

    text = messages.get(language, messages['ru'])

    try:
        # Получить активную сессию
        async with pool.acquire() as conn:
            session = await conn.fetchrow("""
                SELECT session_name FROM whatsapp_sessions
                WHERE user_id = $1 AND status IN ('connected', 'WORKING')
                ORDER BY created_at DESC
                LIMIT 1
            """, UUID(user_id))

        if not session:
            logger.warning(f"No active WhatsApp session for user {user_id}")
            return

        # Отправить через WAHA
        waha = get_waha_service()
        phone_clean = "".join(filter(str.isdigit, customer_phone))

        await waha.send_text(
            phone=phone_clean,
            text=text,
            session=session['session_name'],
        )

        logger.info(f"Follow-up message sent to {customer_phone}")

    except Exception as e:
        logger.error(f"Failed to send follow-up to {customer_phone}: {e}")


async def create_order_conversation(
    order_id: str,
    customer_phone: str,
    pool: asyncpg.Pool,
) -> None:
    """
    Создать контекст заказа для ИИ Продажника.

    order_data (JSONB):
    {
        "order_code": "...",
        "total_price": 50000,
        "items": [{"name": "...", "price": ..., "quantity": ...}, ...]
    }

    expires_at: NOW() + 24 часа
    """
    try:
        async with pool.acquire() as conn:
            # Получить заказ + товары
            order = await conn.fetchrow("""
                SELECT kaspi_order_code, total_price
                FROM orders
                WHERE id = $1
            """, UUID(order_id))

            if not order:
                logger.warning(f"Order {order_id} not found for conversation")
                return

            items = await conn.fetch("""
                SELECT name, price, quantity, sku
                FROM order_items
                WHERE order_id = $1
            """, UUID(order_id))

            # Формируем JSONB
            order_data = {
                "order_code": order['kaspi_order_code'],
                "total_price": order['total_price'],
                "items": [
                    {
                        "name": item['name'],
                        "price": item['price'],
                        "quantity": item['quantity'],
                        "sku": item['sku'],
                    }
                    for item in items
                ]
            }

            order_data_json = json.dumps(order_data, ensure_ascii=False, default=str)
            expires_at = datetime.utcnow() + timedelta(hours=24)

            # Создаём запись
            await conn.execute("""
                INSERT INTO order_conversations
                (order_id, customer_phone, order_data, expires_at)
                VALUES ($1, $2, $3::jsonb, $4)
            """, UUID(order_id), customer_phone, order_data_json, expires_at)

            logger.info(f"Order conversation created for {order['kaspi_order_code']}, expires at {expires_at}")

    except Exception as e:
        logger.error(f"Failed to create order conversation for {order_id}: {e}")
