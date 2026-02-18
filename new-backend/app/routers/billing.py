"""Billing router - subscriptions and payments (TipTopPay integration)"""

from fastapi import APIRouter, Depends, HTTPException, status
from typing import Annotated
import asyncpg
import json
import uuid
import logging
from datetime import datetime, timedelta

from ..schemas.billing import (
    SubscriptionResponse,
    CreateSubscriptionRequest,
    PaymentResponse,
    PaymentListResponse,
    SubscriptionPlan,
)
from ..core.database import get_db_pool
from ..dependencies import get_current_user, get_current_admin_user
from ..config import settings
from ..services.proxy_allocator import proxy_allocator
from ..services.proxy_provider import ensure_proxy_pool_sufficient
from ..services.notification_service import notify_referral_paid

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/plans", response_model=list[SubscriptionPlan])
async def get_subscription_plans(
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """Get available subscription plans (redirects to plans-v2 data)"""
    async with pool.acquire() as conn:
        plans = await conn.fetch("""
            SELECT code, name, price_tiyns, analytics_limit, demping_limit, features
            FROM plans
            WHERE is_active = true
            ORDER BY display_order
        """)

    result = []
    for p in plans:
        features_list = json.loads(p['features']) if isinstance(p['features'], str) else (p['features'] or [])
        result.append(SubscriptionPlan(
            name=p['code'],
            price_tiyns=p['price_tiyns'],
            products_limit=p['demping_limit'] if p['demping_limit'] > 0 else 0,
            features=features_list
        ))
    return result


@router.get("/subscription", response_model=SubscriptionResponse)
async def get_current_subscription(
    current_user: Annotated[dict, Depends(get_current_user)],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """Get current user's subscription"""
    async with pool.acquire() as conn:
        subscription = await conn.fetchrow(
            """
            SELECT id, user_id, plan, status, products_limit,
                   current_period_start, current_period_end,
                   created_at, updated_at
            FROM subscriptions
            WHERE user_id = $1 AND status = 'active'
            ORDER BY created_at DESC
            LIMIT 1
            """,
            current_user['id']
        )

        if not subscription:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No active subscription found"
            )

        return SubscriptionResponse(
            id=str(subscription['id']),
            user_id=str(subscription['user_id']),
            plan=subscription['plan'],
            status=subscription['status'],
            products_limit=subscription['products_limit'],
            current_period_start=subscription['current_period_start'],
            current_period_end=subscription['current_period_end'],
            created_at=subscription['created_at'],
            updated_at=subscription['updated_at']
        )


@router.get("/subscription/stores")
async def get_subscription_stores(
    current_user: Annotated[dict, Depends(get_current_user)],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """Get user's stores with their subscription status.
    Returns each store with its linked subscription info (plan, status, expiry, discount).
    """
    async with pool.acquire() as conn:
        user_row = await conn.fetchrow(
            "SELECT max_stores, multi_store_discount FROM users WHERE id = $1",
            current_user['id']
        )
        max_stores = user_row['max_stores'] if user_row else 1
        discount = user_row['multi_store_discount'] if user_row else 0

        stores = await conn.fetch(
            """
            SELECT
                ks.id as store_id, ks.name, ks.merchant_id, ks.is_active,
                s.plan, s.status as sub_status,
                s.current_period_end as expires_at,
                s.discount_percent
            FROM kaspi_stores ks
            LEFT JOIN subscriptions s ON s.store_id = ks.id AND s.status = 'active' AND s.current_period_end >= NOW()
            WHERE ks.user_id = $1
            ORDER BY ks.created_at ASC
            """,
            current_user['id']
        )

        result = []
        for s in stores:
            result.append({
                "store_id": str(s['store_id']),
                "name": s['name'],
                "merchant_id": s['merchant_id'],
                "is_active": s['is_active'],
                "plan": s['plan'],
                "status": s['sub_status'] or "no_subscription",
                "expires_at": s['expires_at'].isoformat() if s['expires_at'] else None,
                "discount_percent": s['discount_percent'] if s['discount_percent'] is not None else discount,
            })

        return {
            "stores": result,
            "max_stores": max_stores,
            "multi_store_discount": discount
        }


@router.post("/subscribe", response_model=SubscriptionResponse, status_code=status.HTTP_201_CREATED)
async def create_subscription(
    subscription_request: CreateSubscriptionRequest,
    current_user: Annotated[dict, Depends(get_current_admin_user)],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """Create new subscription (admin only until payment integration)"""
    plan_code = subscription_request.plan
    # Support legacy 'pro' code → map to 'premium'
    if plan_code == 'pro':
        plan_code = 'premium'

    if plan_code not in ['basic', 'standard', 'premium']:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid plan. Must be 'basic', 'standard', or 'premium'"
        )

    store_uuid = uuid.UUID(subscription_request.store_id) if subscription_request.store_id else None

    async with pool.acquire() as conn:
        # Get plan details from DB
        plan_row = await conn.fetchrow(
            "SELECT id, price_tiyns, demping_limit, analytics_limit FROM plans WHERE code = $1 AND is_active = true",
            plan_code
        )
        if not plan_row:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Plan not found")

        # Validate store belongs to user (if store_id provided)
        if store_uuid:
            store_owner = await conn.fetchval(
                "SELECT user_id FROM kaspi_stores WHERE id = $1",
                store_uuid
            )
            if not store_owner or str(store_owner) != str(current_user['id']):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Store not found")

        products_limit = plan_row['demping_limit']
        price_tiyns = plan_row['price_tiyns']

        # Determine discount for additional stores
        discount_percent = 0
        if store_uuid:
            user_row = await conn.fetchrow(
                "SELECT max_stores, multi_store_discount FROM users WHERE id = $1",
                current_user['id']
            )
            other_active = await conn.fetchval(
                """SELECT COUNT(*) FROM subscriptions
                WHERE user_id = $1 AND status = 'active' AND current_period_end >= NOW()
                AND (store_id IS NULL OR store_id != $2)""",
                current_user['id'], store_uuid
            )
            if other_active > 0 and user_row:
                discount_percent = user_row['multi_store_discount'] or 0
                price_tiyns = int(price_tiyns * (100 - discount_percent) / 100)

        # Deactivate old subscriptions (only for this store, or all if no store_id)
        if store_uuid:
            await conn.execute(
                "UPDATE subscriptions SET status = 'cancelled' WHERE user_id = $1 AND store_id = $2 AND status = 'active'",
                current_user['id'], store_uuid
            )
        else:
            await conn.execute(
                "UPDATE subscriptions SET status = 'cancelled' WHERE user_id = $1 AND status = 'active'",
                current_user['id']
            )

        # Create new subscription
        now = datetime.now()
        subscription = await conn.fetchrow(
            """
            INSERT INTO subscriptions (
                user_id, plan_id, plan, status, products_limit,
                analytics_limit, demping_limit,
                current_period_start, current_period_end,
                store_id, discount_percent
            )
            VALUES ($1, $2, $3, 'active', $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
            """,
            current_user['id'],
            plan_row['id'],
            plan_code,
            products_limit,
            plan_row['analytics_limit'],
            plan_row['demping_limit'],
            now,
            now + timedelta(days=30),
            store_uuid,
            discount_percent
        )

        # Create payment record (with discounted price)
        await conn.execute(
            """
            INSERT INTO payments (user_id, amount, status, plan)
            VALUES ($1, $2, 'completed', $3)
            """,
            current_user['id'],
            price_tiyns,
            plan_code
        )

        # Auto-credit referral commission
        if price_tiyns > 0:
            try:
                referrer = await conn.fetchrow(
                    "SELECT u.id, u.email FROM users u WHERE u.id = (SELECT referred_by FROM users WHERE id = $1)",
                    current_user['id']
                )
                if referrer:
                    commission_pct_row = await conn.fetchval(
                        "SELECT value FROM site_settings WHERE key = 'referral_commission_percent'"
                    )
                    commission_pct = int(commission_pct_row) if commission_pct_row else 20
                    commission_amount = int(price_tiyns * commission_pct / 100)
                    if commission_amount > 0:
                        await conn.execute("""
                            INSERT INTO referral_transactions
                                (id, user_id, referred_user_id, type, amount, description, status, created_at)
                            VALUES ($1, $2, $3, 'income', $4, $5, 'completed', NOW())
                        """,
                            uuid.uuid4(),
                            referrer['id'],
                            current_user['id'],
                            commission_amount,
                            f"Комиссия {commission_pct}% за подписку {plan_code}"
                        )
                        logger.info(
                            f"[REFERRAL] Credited {commission_amount} tiyns to referrer {referrer['id']} "
                            f"for user {current_user['id']} plan {plan_code}"
                        )
                        await notify_referral_paid(
                            pool, referrer['id'], current_user.get('email', ''), commission_amount
                        )
            except Exception as e:
                logger.error(f"[REFERRAL] Failed to credit commission: {e}")

    # ✅ Allocate 100 proxies to user after successful subscription
    user_id = uuid.UUID(current_user['id'])

    try:
        # Ensure proxy pool has enough proxies
        logger.info(f"Checking proxy pool before allocating to user {user_id}")
        await ensure_proxy_pool_sufficient(required_count=500)

        # Allocate proxies with per-module distribution (70/25/5/0)
        proxies_by_module = await proxy_allocator.allocate_proxies_to_user(
            user_id=user_id,
            count=100
        )

        total_allocated = sum(len(proxies) for proxies in proxies_by_module.values())
        logger.info(
            f"Allocated {total_allocated} proxies to user {user_id} "
            f"({plan_code} plan): "
            f"{len(proxies_by_module.get('demper', []))} demper, "
            f"{len(proxies_by_module.get('orders', []))} orders, "
            f"{len(proxies_by_module.get('catalog', []))} catalog"
        )

    except Exception as e:
        logger.error(f"Failed to allocate proxies to user {user_id}: {e}")
        # Don't fail the subscription - just log the error
        # Admin can manually allocate proxies later

    return SubscriptionResponse(
        id=str(subscription['id']),
        user_id=str(subscription['user_id']),
        plan=subscription['plan'],
        status=subscription['status'],
        products_limit=subscription['products_limit'],
        current_period_start=subscription['current_period_start'],
        current_period_end=subscription['current_period_end'],
        created_at=subscription['created_at'],
        updated_at=subscription['updated_at']
    )


@router.get("/payments", response_model=PaymentListResponse)
async def list_payments(
    current_user: Annotated[dict, Depends(get_current_user)],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)],
    page: int = 1,
    page_size: int = 20
):
    """List payment history"""
    offset = (page - 1) * page_size

    async with pool.acquire() as conn:
        # Get total count
        total = await conn.fetchval(
            "SELECT COUNT(*) FROM payments WHERE user_id = $1",
            current_user['id']
        )

        # Get payments
        payments = await conn.fetch(
            """
            SELECT id, user_id, amount, status, plan,
                   tiptoppay_transaction_id, created_at, updated_at
            FROM payments
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
            """,
            current_user['id'],
            page_size,
            offset
        )

        payment_responses = [
            PaymentResponse(
                id=str(p['id']),
                user_id=str(p['user_id']),
                amount=p['amount'],
                status=p['status'],
                plan=p['plan'],
                tiptoppay_transaction_id=p['tiptoppay_transaction_id'],
                created_at=p['created_at'],
                updated_at=p['updated_at']
            )
            for p in payments
        ]

        return PaymentListResponse(
            payments=payment_responses,
            total=total,
            page=page,
            page_size=page_size
        )


@router.post("/cancel", status_code=status.HTTP_200_OK)
async def cancel_subscription(
    current_user: Annotated[dict, Depends(get_current_user)],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """Cancel current subscription"""
    async with pool.acquire() as conn:
        result = await conn.execute(
            """
            UPDATE subscriptions
            SET status = 'cancelled'
            WHERE user_id = $1 AND status = 'active'
            """,
            current_user['id']
        )

        if result == "UPDATE 0":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No active subscription to cancel"
            )

    return {"status": "success", "message": "Subscription cancelled"}


# --- New tariff system endpoints ---

from ..services.feature_access import get_feature_access_service


@router.get("/features")
async def get_user_features(
    current_user: Annotated[dict, Depends(get_current_user)],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """Get current user's features and limits based on subscription and add-ons."""
    service = get_feature_access_service()
    features = await service.get_user_features(pool, current_user['id'])
    return features


@router.get("/plans-v2")
async def get_plans_v2(
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """Get available plans from database (new tariff system)."""
    async with pool.acquire() as conn:
        plans = await conn.fetch("""
            SELECT id, code, name, price_tiyns, analytics_limit, demping_limit,
                   features, trial_days, display_order
            FROM plans
            WHERE is_active = true AND code != 'free'
            ORDER BY display_order
        """)

    return [
        {
            "id": str(p['id']),
            "code": p['code'],
            "name": p['name'],
            "price": p['price_tiyns'] / 100,  # Convert to tenge
            "analytics_limit": p['analytics_limit'],
            "demping_limit": p['demping_limit'],
            "features": json.loads(p['features']) if isinstance(p['features'], str) else (p['features'] or []),
            "trial_days": p['trial_days'],
        }
        for p in plans
    ]


@router.get("/addons")
async def get_addons(
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """Get available add-ons from database."""
    async with pool.acquire() as conn:
        addons = await conn.fetch("""
            SELECT id, code, name, description, price_tiyns, is_recurring,
                   stackable, features, extra_limits
            FROM addons
            WHERE is_active = true
            ORDER BY price_tiyns
        """)

    return [
        {
            "id": str(a['id']),
            "code": a['code'],
            "name": a['name'],
            "description": a['description'],
            "price": a['price_tiyns'] / 100,  # Convert to tenge
            "is_recurring": a['is_recurring'],
            "stackable": a['stackable'],
            "features": json.loads(a['features']) if isinstance(a['features'], str) else (a['features'] or []),
            "extra_limits": json.loads(a['extra_limits']) if isinstance(a['extra_limits'], str) else a['extra_limits'],
        }
        for a in addons
    ]


@router.post("/activate-trial")
async def activate_trial(
    current_user: Annotated[dict, Depends(get_current_user)],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """
    Activate a free trial of the basic plan for the current user.
    Only works if user has never had a real plan (plan_id IS NULL).
    """
    user_id = current_user['id']

    async with pool.acquire() as conn:
        # Check if user already has/had a subscription with a real plan (not free)
        existing = await conn.fetchrow("""
            SELECT id FROM subscriptions
            WHERE user_id = $1 AND plan_id IS NOT NULL AND plan != 'free'
            LIMIT 1
        """, user_id)

        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Пробный период уже был использован"
            )

        # Anti-abuse: check if any of the user's stores (by merchant_id)
        # have already been used for a trial on ANY account
        store_trial_used = await conn.fetchrow("""
            SELECT s.merchant_id
            FROM kaspi_stores ks_current
            JOIN kaspi_stores s ON s.merchant_id = ks_current.merchant_id
                AND s.user_id != $1
            JOIN subscriptions sub ON sub.user_id = s.user_id
                AND sub.plan_id IS NOT NULL
                AND sub.is_trial = TRUE
            WHERE ks_current.user_id = $1
            LIMIT 1
        """, user_id)

        if store_trial_used:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Пробный период уже был использован для этого магазина"
            )

        # Anti-abuse: check if this phone number was already used for a trial on another account
        user_phone = current_user.get('phone')
        if user_phone:
            phone_trial_used = await conn.fetchrow("""
                SELECT u2.id
                FROM users u2
                JOIN subscriptions sub ON sub.user_id = u2.id
                WHERE u2.phone = $1
                  AND u2.id != $2
                  AND sub.is_trial = TRUE
                  AND sub.plan_id IS NOT NULL
                LIMIT 1
            """, user_phone, user_id)

            if phone_trial_used:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Пробный период уже был использован для этого номера телефона"
                )

        # Get the basic plan (the only one with trial_days > 0)
        plan = await conn.fetchrow("""
            SELECT id, code, name, analytics_limit, demping_limit, features, trial_days
            FROM plans
            WHERE code = 'basic' AND is_active = true
        """)

        if not plan or plan['trial_days'] <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Пробный период недоступен"
            )

        now = datetime.utcnow()
        trial_days = plan['trial_days']
        period_end = now + timedelta(days=trial_days)

        # Deactivate any existing free subscriptions
        await conn.execute("""
            UPDATE subscriptions SET status = 'cancelled'
            WHERE user_id = $1 AND status = 'active'
        """, user_id)

        # Create trial subscription
        sub_id = await conn.fetchval("""
            INSERT INTO subscriptions (
                user_id, plan_id, plan, status, products_limit,
                analytics_limit, demping_limit,
                current_period_start, current_period_end,
                is_trial, trial_ends_at
            ) VALUES (
                $1, $2, $3, 'active', $4, $5, $6, $7, $8, TRUE, $8
            )
            RETURNING id
        """,
            user_id,
            plan['id'],
            plan['code'],
            plan['analytics_limit'],
            plan['analytics_limit'],
            plan['demping_limit'],
            now,
            period_end,
        )

        logger.info(f"[TRIAL] User {user_id} activated trial: plan={plan['code']}, days={trial_days}")

        return {
            "status": "success",
            "subscription_id": str(sub_id),
            "plan": plan['code'],
            "plan_name": plan['name'],
            "trial_days": trial_days,
            "expires_at": period_end.isoformat(),
        }
