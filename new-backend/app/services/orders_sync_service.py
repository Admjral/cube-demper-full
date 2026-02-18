"""
Periodic orders sync service - fetches orders from Kaspi REST API
and saves them to the database. Accumulates customer contacts.

Runs as a background task in the backend (not in workers).
Cycle: every 8 minutes. Requires valid API token (X-Auth-Token).
Stores without API token are skipped.
"""
import logging
import asyncio
from datetime import datetime, timedelta

import asyncpg

from .kaspi_orders_api import get_kaspi_orders_api, KaspiTokenInvalidError, KaspiOrdersAPIError
from .api_parser import sync_orders_to_db

logger = logging.getLogger(__name__)

# Sync interval in seconds (8 minutes for faster order detection)
SYNC_INTERVAL = 480

# Delay between processing each store (seconds)
STORE_DELAY = 0.3

# Initial delay before first sync (let the app fully start)
INITIAL_DELAY = 60

# Max concurrent stores (Semaphore limit)
MAX_CONCURRENT_STORES = 12


async def periodic_orders_sync(pool: asyncpg.Pool):
    """
    Background task that periodically syncs active orders from Kaspi.

    Runs indefinitely, syncing all active stores every SYNC_INTERVAL seconds.
    Each store is processed sequentially with delays to respect rate limits.
    """
    logger.info(f"[ORDERS_SYNC] Starting periodic orders sync (interval: {SYNC_INTERVAL}s)")

    # Wait for app to fully initialize
    await asyncio.sleep(INITIAL_DELAY)

    while True:
        try:
            await _run_sync_cycle(pool)
        except Exception as e:
            logger.error(f"[ORDERS_SYNC] Unexpected error in sync cycle: {e}")

        logger.info(f"[ORDERS_SYNC] Next cycle in {SYNC_INTERVAL}s")
        await asyncio.sleep(SYNC_INTERVAL)


async def _run_sync_cycle(pool: asyncpg.Pool):
    """Run one full sync cycle across all active stores."""
    cycle_start = datetime.utcnow()

    # Get all active stores with valid sessions + check for api_key
    async with pool.acquire() as conn:
        stores = await conn.fetch("""
            SELECT id, user_id, merchant_id, name, api_key, api_key_valid
            FROM kaspi_stores
            WHERE is_active = TRUE
              AND needs_reauth = FALSE
              AND guid IS NOT NULL
              AND merchant_id IS NOT NULL
        """)

    if not stores:
        logger.info("[ORDERS_SYNC] No active stores to sync")
        return

    logger.info(f"[ORDERS_SYNC] Starting cycle for {len(stores)} stores")

    total_synced = 0
    total_errors = 0

    sem = asyncio.Semaphore(MAX_CONCURRENT_STORES)

    async def _sync_one(store):
        nonlocal total_synced, total_errors

        store_id = str(store['id'])
        user_id = str(store['user_id'])
        merchant_id = store['merchant_id']
        store_name = store['name'] or merchant_id
        # api_key может быть None, строкой или dict (asyncpg quirk)
        api_key_raw = store.get('api_key')
        logger.debug(f"[ORDERS_SYNC] {merchant_id}: api_key_raw type={type(api_key_raw)}, value={api_key_raw!r}")
        api_key = str(api_key_raw) if api_key_raw else None
        logger.debug(f"[ORDERS_SYNC] {merchant_id}: api_key (after str)={api_key!r}")
        api_key_valid = store.get('api_key_valid', True)

        async with sem:
            # Skip stores without valid API token
            if not api_key or not api_key_valid:
                logger.debug(f"[ORDERS_SYNC] {store_name}: no valid API token, skipping")
                return

            try:
                rest_api = get_kaspi_orders_api()
                now = datetime.utcnow()
                date_from = now - timedelta(days=14)

                # Fetch active orders
                orders = await rest_api.fetch_orders(
                    api_token=api_key,
                    date_from=date_from,
                    date_to=now,
                    size=100,
                )

                # Also fetch archived orders to catch COMPLETED transitions
                try:
                    archive_orders = await rest_api.fetch_orders(
                        api_token=api_key,
                        date_from=now - timedelta(days=3),
                        date_to=now,
                        states=["ARCHIVE"],
                        size=100,
                    )
                    if archive_orders:
                        existing_ids = {o.get("id") for o in orders}
                        for ao in archive_orders:
                            if ao.get("id") not in existing_ids:
                                orders.append(ao)
                except Exception as e:
                    logger.debug(f"[ORDERS_SYNC] {store_name}: archive fetch failed: {e}")

                logger.info(f"[ORDERS_SYNC] {store_name}: {len(orders)} orders via REST API")

                if orders:
                    result = await sync_orders_to_db(store_id, orders, user_id=user_id)
                    synced = result.get('inserted', 0) + result.get('updated', 0)
                    contacts = result.get('contacts_added', 0)
                    total_synced += synced
                    logger.info(
                        f"[ORDERS_SYNC] {store_name}: {synced} orders synced "
                        f"({result.get('inserted', 0)} new, {result.get('updated', 0)} updated"
                        f"{f', {contacts} contacts' if contacts else ''})"
                    )
                else:
                    logger.debug(f"[ORDERS_SYNC] {store_name}: no active orders")

            except KaspiTokenInvalidError:
                total_errors += 1
                logger.warning(f"[ORDERS_SYNC] {store_name}: API token invalid, marking as invalid")
                async with pool.acquire() as conn:
                    await conn.execute(
                        "UPDATE kaspi_stores SET api_key_valid = FALSE WHERE id = $1",
                        store['id']
                    )
            except KaspiOrdersAPIError as e:
                total_errors += 1
                logger.warning(f"[ORDERS_SYNC] {store_name}: REST API error - {e}")
            except Exception as e:
                total_errors += 1
                logger.error(f"[ORDERS_SYNC] {store_name}: unexpected error - {e}", exc_info=True)

            # Delay between stores to spread load
            await asyncio.sleep(STORE_DELAY)

    await asyncio.gather(*[_sync_one(s) for s in stores])

    elapsed = (datetime.utcnow() - cycle_start).total_seconds()
    logger.info(
        f"[ORDERS_SYNC] Cycle complete in {elapsed:.0f}s: "
        f"{len(stores)} stores, {total_synced} orders synced, {total_errors} errors"
    )
