"""
Background service for checking preorder activation status on Kaspi.

Runs every 5 minutes. For each product with preorder_status='pending':
1. Fetches the product's offers from public Kaspi API
2. Finds our merchant's offer
3. Checks if preOrder is active
4. Sends notification when activated (or after 24h timeout)
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

import asyncpg

from .api_parser import parse_product_by_sku
from .notification_service import notify_preorder_activated, notify_preorder_failed

logger = logging.getLogger(__name__)

CHECK_INTERVAL_SECONDS = 300  # 5 minutes
TIMEOUT_HOURS = 24  # Notify after 24h without activation


async def periodic_preorder_check(pool: asyncpg.Pool):
    """Main loop: check pending preorders every 5 minutes."""
    logger.info("[PREORDER] Preorder checker started")

    # Initial delay to let other services start
    await asyncio.sleep(30)

    while True:
        try:
            await check_pending_preorders(pool)
        except Exception as e:
            logger.error(f"[PREORDER] Error in preorder check cycle: {e}")

        await asyncio.sleep(CHECK_INTERVAL_SECONDS)


async def check_pending_preorders(pool: asyncpg.Pool):
    """Check all products with pending preorder status."""
    async with pool.acquire() as conn:
        pending = await conn.fetch(
            """
            SELECT
                p.id, p.external_kaspi_id, p.name, p.pre_order_days,
                p.preorder_requested_at,
                ks.merchant_id, ks.user_id
            FROM products p
            JOIN kaspi_stores ks ON ks.id = p.store_id
            WHERE p.preorder_status = 'pending'
              AND p.pre_order_days > 0
              AND p.external_kaspi_id IS NOT NULL
            """
        )

    if not pending:
        return

    logger.info(f"[PREORDER] Checking {len(pending)} pending preorders")

    for product in pending:
        try:
            await _check_single_product(pool, product)
        except Exception as e:
            logger.warning(
                f"[PREORDER] Error checking product {product['name']}: {e}"
            )

        # Rate limit: 1 request per second
        await asyncio.sleep(1)


async def _check_single_product(pool: asyncpg.Pool, product: dict):
    """Check a single product's preorder status on Kaspi."""
    product_id = product['id']
    external_id = str(product['external_kaspi_id'])
    product_name = product['name']
    merchant_id = product['merchant_id']
    user_id = product['user_id']
    pre_order_days = product['pre_order_days']
    requested_at = product['preorder_requested_at']

    # Fetch product offers from public Kaspi API
    product_data = await parse_product_by_sku(external_id)

    if not product_data:
        logger.debug(f"[PREORDER] No data for {product_name} ({external_id})")
        return

    # Extract offers
    offers = product_data.get("offers", [])
    if isinstance(product_data, list):
        offers = product_data

    if not offers:
        logger.debug(f"[PREORDER] No offers for {product_name}")
        return

    # Find our merchant's offer
    our_offer = None
    for offer in offers:
        if offer.get("merchantId") == merchant_id:
            our_offer = offer
            break

    if not our_offer:
        logger.debug(
            f"[PREORDER] Our offer not found for {product_name} "
            f"(merchant_id={merchant_id}, {len(offers)} offers total)"
        )
        # Check timeout
        await _check_timeout(pool, product)
        return

    # Check for preOrder in the offer data
    # The Kaspi offers API may include preOrder in various places:
    # 1. Direct field on offer: offer.preOrder
    # 2. In availabilities: offer.availabilities[].preOrder
    # 3. In delivery info: offer.deliveryDuration
    preorder_detected = _detect_preorder(our_offer)

    if preorder_detected:
        logger.info(
            f"[PREORDER] PreOrder ACTIVE for {product_name} "
            f"({pre_order_days} days)"
        )
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE products
                SET preorder_status = 'active', updated_at = NOW()
                WHERE id = $1
                """,
                product_id,
            )
        await notify_preorder_activated(
            pool, user_id, product_name, pre_order_days, product_id
        )
    else:
        logger.debug(
            f"[PREORDER] PreOrder not yet active for {product_name}"
        )
        await _check_timeout(pool, product)


def _detect_preorder(offer: dict) -> bool:
    """
    Detect if a merchant's offer has preOrder active.

    The public Kaspi offers API uses lowercase "preorder" (not camelCase "preOrder").
    Checks both variants for safety.
    """
    # Check direct preorder field (lowercase — actual Kaspi API format)
    preorder_val = offer.get("preorder") or offer.get("preOrder")
    if preorder_val and int(preorder_val) > 0:
        return True

    # Check availabilities array (MC API uses camelCase "preOrder")
    availabilities = offer.get("availabilities", [])
    for avail in availabilities:
        if isinstance(avail, dict):
            pre_order = avail.get("preOrder") or avail.get("preorder") or 0
            if pre_order and int(pre_order) > 0:
                return True

    return False


async def _check_timeout(pool: asyncpg.Pool, product: dict):
    """Send notification if preorder has been pending for too long."""
    requested_at = product.get('preorder_requested_at')
    if not requested_at:
        return

    # Make timezone-aware if needed
    now = datetime.now(timezone.utc)
    if requested_at.tzinfo is None:
        requested_at = requested_at.replace(tzinfo=timezone.utc)

    elapsed = now - requested_at
    if elapsed > timedelta(hours=TIMEOUT_HOURS):
        # Check if we already sent a timeout notification (avoid spam)
        # Simple approach: only notify once by checking if elapsed is < 25h
        # (so we send exactly once in the 24-25h window)
        if elapsed < timedelta(hours=TIMEOUT_HOURS + 1):
            logger.warning(
                f"[PREORDER] Timeout for {product['name']} "
                f"(requested {elapsed.total_seconds() / 3600:.1f}h ago)"
            )
            await notify_preorder_failed(
                pool,
                product['user_id'],
                product['name'],
                product['id'],
            )
