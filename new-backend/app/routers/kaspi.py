"""Kaspi router - handles Kaspi store management, authentication, and product sync"""

from fastapi import APIRouter, Body, Depends, HTTPException, status, BackgroundTasks
from typing import Annotated, List, Optional, Dict, Any
from pydantic import BaseModel
import asyncio
import asyncpg
import uuid
import logging
import json
from datetime import datetime, timedelta

from ..schemas.kaspi import (
    KaspiStoreResponse,
    ApiTokenUpdate,
    KaspiAuthRequest,
    KaspiAuthSMSRequest,
    KaspiPhoneAuthRequest,
    KaspiPhoneVerifyRequest,
    StoreSyncRequest,
    ProductUpdateRequest,
    BulkPriceUpdateRequest,
    StoreCreateRequest,
    DempingSettings,
    DempingSettingsUpdate,
    ProductDempingDetails,
    StoreStats,
    SalesAnalytics,
    TopProduct,
    OrderPipeline,
    PipelineGroup,
    OrderBreakdowns,
    BreakdownItem,
)
from ..schemas.products import ProductResponse, ProductListResponse, ProductFilters, ProductAnalytics
from ..core.database import get_db_pool
from ..dependencies import require_feature
from ..services.kaspi_auth_service import (
    authenticate_kaspi,
    verify_sms_code,
    authenticate_kaspi_phone,
    verify_phone_sms_code,
    get_active_session,
    get_active_session_with_refresh,
    KaspiSMSRequiredError,
    KaspiAuthError,
)
from ..services.api_parser import (
    get_products,
    sync_product,
    batch_sync_products,
    parse_product_by_sku,
    fetch_product_image_url,
)
from ..core.security import encrypt_session
from ..utils.security import escape_like, clamp_page_size, DEMPING_SETTINGS_FIELDS, CITY_PRICE_FIELDS

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/stores", response_model=List[KaspiStoreResponse])
async def list_stores(
    current_user: Annotated[dict, require_feature("demping")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """List all Kaspi stores for current user"""
    async with pool.acquire() as conn:
        stores = await conn.fetch(
            """
            SELECT id, user_id, merchant_id, name, api_key, products_count,
                   last_sync, is_active, api_key_valid, created_at, updated_at
            FROM kaspi_stores
            WHERE user_id = $1 AND is_active = TRUE
            ORDER BY created_at DESC
            """,
            current_user['id']
        )

        result = []
        for store in stores:
            api_key_raw = store.get('api_key')
            api_key_str = str(api_key_raw) if api_key_raw else None

            # Generate masked API key for display (e.g., "eIBx...Ay8=")
            api_key_masked = None
            if api_key_str and len(api_key_str) > 8:
                api_key_masked = f"{api_key_str[:4]}...{api_key_str[-4:]}"
            elif api_key_str:
                api_key_masked = f"{api_key_str[:2]}***"

            result.append(KaspiStoreResponse(
                id=str(store['id']),
                user_id=str(store['user_id']),
                merchant_id=store['merchant_id'],
                name=store['name'],
                products_count=store['products_count'],
                last_sync=store['last_sync'],
                is_active=store['is_active'],
                api_key_set=bool(api_key_str),
                api_key_valid=store.get('api_key_valid', True) if api_key_str else True,
                api_key_masked=api_key_masked,
                created_at=store['created_at'],
                updated_at=store['updated_at']
            ))

        return result


@router.patch("/stores/{store_id}/api-token")
async def update_store_api_token(
    store_id: str,
    body: ApiTokenUpdate,
    current_user: Annotated[dict, require_feature("demping")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """
    Save Kaspi REST API token for a store with validation.

    Token is generated in Kaspi MC → Settings → API.
    The token will be validated by making a test API call before saving.
    """
    async with pool.acquire() as conn:
        store = await conn.fetchrow(
            "SELECT id FROM kaspi_stores WHERE id = $1 AND user_id = $2",
            uuid.UUID(store_id), current_user['id']
        )
        if not store:
            raise HTTPException(status_code=404, detail="Магазин не найден")

    # Validate token by making a test API call
    from ..services.kaspi_orders_api import get_kaspi_orders_api, KaspiTokenInvalidError, KaspiOrdersAPIError

    orders_api = get_kaspi_orders_api()
    is_valid = False
    error_message = None

    try:
        # Test the token with a minimal API call
        now = datetime.utcnow()
        test_orders = await orders_api.fetch_orders(
            api_token=body.api_token,
            date_from=now - timedelta(days=1),
            date_to=now,
            states=["NEW"],
            page=0,
            size=1,
        )
        is_valid = True
        logger.info(f"API token validated successfully for store {store_id}")
    except KaspiTokenInvalidError as e:
        error_message = f"Токен недействителен: {str(e)}"
        logger.warning(f"Invalid API token for store {store_id}: {e}")
    except KaspiOrdersAPIError as e:
        error_message = f"Ошибка валидации токена: {str(e)}"
        logger.error(f"Error validating token for store {store_id}: {e}")
    except Exception as e:
        error_message = f"Неожиданная ошибка при валидации: {str(e)}"
        logger.error(f"Unexpected error validating token for store {store_id}: {e}")

    # Save token with validity flag
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE kaspi_stores SET api_key = $1, api_key_valid = $2, updated_at = NOW() WHERE id = $3",
            body.api_token, is_valid, uuid.UUID(store_id)
        )

    # Return result with validation status
    if is_valid:
        return {
            "status": "ok",
            "message": "API токен сохранён и проверен",
            "api_key_valid": True
        }
    else:
        return {
            "status": "warning",
            "message": f"Токен сохранён, но может быть недействителен: {error_message}",
            "api_key_valid": False,
            "error": error_message
        }


@router.get("/stores/token-alerts")
async def get_token_alerts(
    current_user: Annotated[dict, require_feature("demping")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """Get stores with invalid API tokens that need renewal."""
    async with pool.acquire() as conn:
        stores = await conn.fetch(
            """SELECT id, name, merchant_id FROM kaspi_stores
               WHERE user_id = $1 AND api_key IS NOT NULL AND api_key_valid = FALSE""",
            current_user['id']
        )
    return [{"store_id": str(s['id']), "name": s['name'], "merchant_id": s['merchant_id']} for s in stores]


@router.post("/stores/{store_id}/test-api-token")
async def test_store_api_token(
    store_id: str,
    current_user: Annotated[dict, require_feature("demping")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """
    Test if stored API token is valid by making a test request to Kaspi API.

    Returns:
        - valid: bool - whether token works
        - error: Optional[str] - error message if invalid
        - orders_count: Optional[int] - number of recent orders found (if valid)
        - message: str - human-readable message
    """
    async with pool.acquire() as conn:
        store = await conn.fetchrow(
            "SELECT id, api_key FROM kaspi_stores WHERE id = $1 AND user_id = $2",
            uuid.UUID(store_id), current_user['id']
        )
        if not store:
            raise HTTPException(status_code=404, detail="Магазин не найден")

        api_key = store.get('api_key')
        if not api_key:
            raise HTTPException(status_code=400, detail="API токен не установлен")

    # Test the token with a real API call
    from ..services.kaspi_orders_api import get_kaspi_orders_api, KaspiTokenInvalidError, KaspiOrdersAPIError

    orders_api = get_kaspi_orders_api()

    try:
        now = datetime.utcnow()
        orders = await orders_api.fetch_orders(
            api_token=api_key,
            date_from=now - timedelta(days=7),
            date_to=now,
            states=["APPROVED", "ACCEPTED_BY_MERCHANT"],
            page=0,
            size=10,
        )

        # Token is valid - update flag in DB
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE kaspi_stores SET api_key_valid = TRUE WHERE id = $1",
                uuid.UUID(store_id)
            )

        return {
            "valid": True,
            "orders_count": len(orders),
            "message": f"Токен действителен. Найдено заказов: {len(orders)}"
        }

    except KaspiTokenInvalidError as e:
        # Token is invalid - update flag
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE kaspi_stores SET api_key_valid = FALSE WHERE id = $1",
                uuid.UUID(store_id)
            )

        return {
            "valid": False,
            "error": str(e),
            "message": "Токен недействителен или истёк"
        }

    except (KaspiOrdersAPIError, Exception) as e:
        logger.error(f"Error testing API token for store {store_id}: {e}")
        return {
            "valid": False,
            "error": str(e),
            "message": "Ошибка при проверке токена"
        }


@router.post("/auth", status_code=status.HTTP_200_OK)
async def authenticate_store(
    auth_data: KaspiAuthRequest,
    current_user: Annotated[dict, require_feature("demping")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)],
    background_tasks: BackgroundTasks
):
    """
    Authenticate with Kaspi and create/update store.

    Returns:
        - Success: { "status": "success", "store_id": "...", "merchant_id": "..." }
        - SMS Required: { "status": "sms_required", "merchant_id": "..." }
    """
    # Check store limit (dynamic, admin-controlled per user)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT COUNT(*) as cnt, COALESCE((SELECT max_stores FROM users WHERE id = $1), 1) as max_stores FROM kaspi_stores WHERE user_id = $1 AND is_active = TRUE",
            current_user['id']
        )
        if row['cnt'] >= row['max_stores']:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Лимит магазинов: {row['max_stores']}. Обратитесь в поддержку для расширения."
            )

    try:
        # Attempt authentication
        session_data = await authenticate_kaspi(
            email=auth_data.email,
            password=auth_data.password,
            merchant_id=auth_data.merchant_id
        )

        # Extract already-encrypted GUID from session_data
        encrypted_guid = session_data.get('guid')  # Already encrypted by authenticate_kaspi
        merchant_id = session_data.get('merchant_uid')
        shop_name = session_data.get('shop_name', f"Store {merchant_id}")
        store_points = session_data.get('store_points', {})

        # Store in database (wrap encrypted string in JSON object)
        # Also store email/password separately for auto-reauthentication
        async with pool.acquire() as conn:
            # Check if merchant_id already belongs to another user
            existing_owner = await conn.fetchval(
                "SELECT user_id FROM kaspi_stores WHERE merchant_id = $1",
                merchant_id
            )
            if existing_owner and str(existing_owner) != current_user['id']:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Этот магазин уже подключён к другому аккаунту"
                )

            # Try with new columns first, fallback to old schema
            try:
                store = await conn.fetchrow(
                    """
                    INSERT INTO kaspi_stores (user_id, merchant_id, name, guid, kaspi_email, kaspi_password, store_points, is_active)
                    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, true)
                    ON CONFLICT (merchant_id)
                    DO UPDATE SET guid = $4, kaspi_email = $5, kaspi_password = $6, store_points = $7::jsonb, is_active = true, needs_reauth = false, reauth_reason = NULL, updated_at = NOW()
                    RETURNING id, merchant_id
                    """,
                    current_user['id'],
                    merchant_id,
                    shop_name,
                    json.dumps({'encrypted': encrypted_guid}),
                    encrypt_session({'email': auth_data.email}),
                    encrypt_session({'password': auth_data.password}),
                    json.dumps(store_points)
                )
            except Exception as e:
                # Fallback for old schema without store_points column
                logger.warning(f"Could not save store_points (migration may be pending): {e}")
                store = await conn.fetchrow(
                    """
                    INSERT INTO kaspi_stores (user_id, merchant_id, name, guid, kaspi_email, kaspi_password, is_active)
                    VALUES ($1, $2, $3, $4, $5, $6, true)
                    ON CONFLICT (merchant_id)
                    DO UPDATE SET guid = $4, kaspi_email = $5, kaspi_password = $6, is_active = true, needs_reauth = false, reauth_reason = NULL, updated_at = NOW()
                    RETURNING id, merchant_id
                    """,
                    current_user['id'],
                    merchant_id,
                    shop_name,
                    json.dumps({'encrypted': encrypted_guid}),
                    encrypt_session({'email': auth_data.email}),
                    encrypt_session({'password': auth_data.password})
                )

        # Auto-sync products after successful authentication
        background_tasks.add_task(
            _sync_store_products_task,
            store_id=str(store['id']),
            merchant_id=merchant_id
        )
        logger.info(f"Started automatic product sync for store {store['id']}")

        return {
            "status": "success",
            "store_id": str(store['id']),
            "merchant_id": merchant_id
        }

    except KaspiSMSRequiredError as e:
        # SMS verification required
        return {
            "status": "sms_required",
            "merchant_id": e.partial_session.get('merchant_uid'),
            "message": "SMS verification code required"
        }

    except KaspiAuthError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e)
        )

    except HTTPException:
        raise  # Re-raise HTTP exceptions (409 conflict, etc.) as-is

    except Exception as e:
        logger.error(f"Unexpected error during Kaspi auth: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Ошибка аутентификации. Попробуйте позже."
        )


@router.post("/auth/verify-sms", status_code=status.HTTP_200_OK)
async def verify_sms(
    sms_data: KaspiAuthSMSRequest,
    current_user: Annotated[dict, require_feature("demping")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)],
    background_tasks: BackgroundTasks
):
    """Complete Kaspi authentication with SMS code"""
    try:
        # Get partial session from database
        async with pool.acquire() as conn:
            store = await conn.fetchrow(
                """
                SELECT guid FROM kaspi_stores
                WHERE merchant_id = $1 AND user_id = $2
                """,
                sms_data.merchant_id,
                current_user['id']
            )

            if not store or not store['guid']:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="No pending authentication found for this merchant"
                )

            # Verify SMS code
            from ..core.security import decrypt_session
            # Extract encrypted string from JSON object
            guid_data = store['guid']
            if isinstance(guid_data, dict):
                encrypted_guid = guid_data.get('encrypted')
            else:
                # Fallback for old format (plain string)
                encrypted_guid = guid_data

            partial_session = decrypt_session(encrypted_guid)

            complete_session = await verify_sms_code(
                merchant_id=sms_data.merchant_id,
                sms_code=sms_data.sms_code,
                partial_session=partial_session
            )

            # Extract already-encrypted GUID and store_points from complete_session
            encrypted_guid = complete_session.get('guid')  # Already encrypted by verify_sms_code
            store_points = complete_session.get('store_points', {})
            store_id = await conn.fetchval(
                """
                UPDATE kaspi_stores
                SET guid = $1, store_points = $2::jsonb, is_active = true, updated_at = NOW()
                WHERE merchant_id = $3 AND user_id = $4
                RETURNING id
                """,
                json.dumps({'encrypted': encrypted_guid}),
                json.dumps(store_points),
                sms_data.merchant_id,
                current_user['id']
            )

        # Auto-sync products after successful SMS verification
        background_tasks.add_task(
            _sync_store_products_task,
            store_id=str(store_id),
            merchant_id=sms_data.merchant_id
        )
        logger.info(f"Started automatic product sync for store {store_id} after SMS verification")

        return {"status": "success", "merchant_id": sms_data.merchant_id}

    except KaspiAuthError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e)
        )

    except HTTPException:
        raise

    except Exception as e:
        logger.error(f"Unexpected error during SMS verification: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Ошибка верификации SMS. Попробуйте позже."
        )


@router.post("/auth/phone", status_code=status.HTTP_200_OK)
async def authenticate_store_phone(
    auth_data: KaspiPhoneAuthRequest,
    current_user: Annotated[dict, require_feature("demping")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)],
):
    """
    Start phone-based Kaspi authentication. Sends SMS to the phone number.

    Returns:
        - SMS Sent: { "status": "sms_sent", "phone": "7705***" }
    """
    # Check store limit (dynamic, admin-controlled per user)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT COUNT(*) as cnt, COALESCE((SELECT max_stores FROM users WHERE id = $1), 1) as max_stores FROM kaspi_stores WHERE user_id = $1 AND is_active = TRUE",
            current_user['id']
        )
        if row['cnt'] >= row['max_stores']:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Лимит магазинов: {row['max_stores']}. Обратитесь в поддержку для расширения."
            )

    try:
        partial_session = await authenticate_kaspi_phone(phone=auth_data.phone)

        # Store partial session encrypted in a temporary record
        from ..core.security import encrypt_session
        encrypted_partial = encrypt_session(partial_session)

        async with pool.acquire() as conn:
            # Upsert temporary record for phone auth
            await conn.execute(
                """
                INSERT INTO kaspi_stores (user_id, merchant_id, name, guid, is_active)
                VALUES ($1, $2, $3, $4, false)
                ON CONFLICT (merchant_id)
                DO UPDATE SET guid = $4, is_active = false, updated_at = NOW()
                """,
                current_user['id'],
                f"phone_pending_{auth_data.phone}",
                f"Pending ({auth_data.phone[:4]}***)",
                json.dumps({'encrypted': encrypted_partial}),
            )

        masked = auth_data.phone[:4] + "***" + auth_data.phone[-2:]
        return {
            "status": "sms_sent",
            "phone": masked,
            "message": f"SMS-код отправлен на +{auth_data.phone}"
        }

    except KaspiAuthError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Unexpected error during phone auth: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Ошибка отправки SMS. Попробуйте позже."
        )


@router.post("/auth/phone/verify", status_code=status.HTTP_200_OK)
async def verify_phone_auth(
    verify_data: KaspiPhoneVerifyRequest,
    current_user: Annotated[dict, require_feature("demping")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)],
    background_tasks: BackgroundTasks,
):
    """
    Complete phone-based Kaspi authentication with SMS code.

    Returns:
        - Success: { "status": "success", "store_id": "...", "merchant_id": "..." }
    """
    try:
        # Get partial session from temp record
        pending_merchant_id = f"phone_pending_{verify_data.phone}"
        async with pool.acquire() as conn:
            store = await conn.fetchrow(
                """
                SELECT id, guid FROM kaspi_stores
                WHERE merchant_id = $1 AND user_id = $2
                """,
                pending_merchant_id,
                current_user['id']
            )

            if not store or not store['guid']:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Нет ожидающей авторизации для этого номера. Отправьте SMS заново."
                )

            from ..core.security import decrypt_session, encrypt_session
            guid_data = store['guid']
            if isinstance(guid_data, str):
                try:
                    guid_data = json.loads(guid_data)
                except json.JSONDecodeError:
                    pass
            if isinstance(guid_data, dict) and 'encrypted' in guid_data:
                partial_session = decrypt_session(guid_data['encrypted'])
            else:
                partial_session = guid_data

            # Verify SMS code
            complete_session = await verify_phone_sms_code(
                phone=verify_data.phone,
                sms_code=verify_data.sms_code,
                partial_session=partial_session,
            )

            merchant_uid = complete_session['merchant_uid']
            shop_name = complete_session['shop_name']
            encrypted_guid = complete_session['guid']
            store_points = complete_session.get('store_points', {})

            # Check if merchant already belongs to another user
            existing_owner = await conn.fetchval(
                "SELECT user_id FROM kaspi_stores WHERE merchant_id = $1 AND merchant_id != $2",
                merchant_uid, pending_merchant_id
            )
            if existing_owner and str(existing_owner) != str(current_user['id']):
                # Clean up temp record
                await conn.execute(
                    "DELETE FROM kaspi_stores WHERE id = $1",
                    store['id']
                )
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Этот магазин уже подключён к другому аккаунту"
                )

            # Delete temp record
            await conn.execute(
                "DELETE FROM kaspi_stores WHERE id = $1",
                store['id']
            )

            real_store = await conn.fetchrow(
                """
                INSERT INTO kaspi_stores (user_id, merchant_id, name, guid, store_points, is_active)
                VALUES ($1, $2, $3, $4, $5::jsonb, true)
                ON CONFLICT (merchant_id)
                DO UPDATE SET guid = $4, name = $3, store_points = $5::jsonb,
                              is_active = true, needs_reauth = false, reauth_reason = NULL, updated_at = NOW()
                RETURNING id, merchant_id
                """,
                current_user['id'],
                merchant_uid,
                shop_name,
                json.dumps({'encrypted': encrypted_guid}),
                json.dumps(store_points),
            )

        # Auto-sync products
        background_tasks.add_task(
            _sync_store_products_task,
            store_id=str(real_store['id']),
            merchant_id=merchant_uid
        )
        logger.info(f"Phone auth complete for store {real_store['id']} ({shop_name})")

        return {
            "status": "success",
            "store_id": str(real_store['id']),
            "merchant_id": merchant_uid
        }

    except KaspiAuthError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e)
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error during phone verify: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Ошибка верификации SMS. Попробуйте позже."
        )


async def _sync_store_products_task(store_id: str, merchant_id: str):
    """Background task to sync store products"""
    try:
        pool = await get_db_pool()

        async with pool.acquire() as conn:
            # Get session
            store = await conn.fetchrow(
                "SELECT guid FROM kaspi_stores WHERE id = $1",
                uuid.UUID(store_id)
            )

            from ..core.security import decrypt_session
            # Extract encrypted string from JSON object
            guid_data = store['guid']
            logger.info(f"guid_data type: {type(guid_data)}, value: {guid_data}")

            # PostgreSQL may return JSON as string, parse it first
            if isinstance(guid_data, str):
                try:
                    guid_data = json.loads(guid_data)
                    logger.info(f"Parsed JSON string to dict: {type(guid_data)}")
                except json.JSONDecodeError:
                    logger.warning(f"guid_data is not JSON, treating as plain encrypted string")

            if isinstance(guid_data, dict):
                encrypted_guid = guid_data.get('encrypted')
                logger.info(f"Extracted encrypted_guid from dict: {encrypted_guid[:50]}..." if encrypted_guid else "None")
            else:
                # Fallback for old format (plain string)
                encrypted_guid = guid_data
                logger.info(f"Using plain encrypted_guid: {encrypted_guid[:50]}..." if encrypted_guid else "None")

            session = decrypt_session(encrypted_guid)
            logger.debug(f"Decrypted session successfully, type: {type(session)}")

            # Fetch products from Kaspi API
            products = await get_products(merchant_id, session)

            # Upsert products to database
            # NOTE: We do NOT delete old products here because GraphQL and REST API
            # return different kaspi_product_id formats (hex vs numeric_numeric),
            # and deleting by ID mismatch would destroy user settings (bot_active, etc.)
            for product_data in products:
                # Convert availabilities dict to JSON string for PostgreSQL
                availabilities = product_data.get('availabilities')
                if isinstance(availabilities, dict):
                    availabilities = json.dumps(availabilities)

                await conn.execute(
                    """
                    INSERT INTO products (
                        store_id, kaspi_product_id, kaspi_sku, external_kaspi_id,
                        name, price, availabilities, bot_active, category, image_url
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8, $9)
                    ON CONFLICT (store_id, kaspi_product_id)
                    DO UPDATE SET
                        name = $5,
                        price = $6,
                        availabilities = $7,
                        kaspi_sku = COALESCE($3, products.kaspi_sku),
                        external_kaspi_id = COALESCE($4, products.external_kaspi_id),
                        category = COALESCE($8, products.category),
                        image_url = COALESCE($9, products.image_url),
                        updated_at = NOW()
                    """,
                    uuid.UUID(store_id),
                    product_data['kaspi_product_id'],
                    product_data.get('kaspi_sku'),
                    product_data.get('external_kaspi_id'),
                    product_data['name'],
                    product_data['price'],
                    availabilities,
                    product_data.get('category'),
                    product_data.get('image_url'),
                )

            # Update store products count and last sync
            await conn.execute(
                """
                UPDATE kaspi_stores
                SET products_count = $1, last_sync = NOW()
                WHERE id = $2
                """,
                len(products),
                uuid.UUID(store_id)
            )

            logger.info(f"Synced {len(products)} products for store {store_id}")

            # Backfill images for products that don't have them
            missing_images = await conn.fetch(
                """SELECT id, external_kaspi_id FROM products
                   WHERE store_id = $1 AND image_url IS NULL AND external_kaspi_id IS NOT NULL""",
                uuid.UUID(store_id)
            )
            if missing_images:
                logger.info(f"Backfilling images for {len(missing_images)} products in store {store_id}")
                for product in missing_images:
                    try:
                        image_url = await fetch_product_image_url(product['external_kaspi_id'])
                        if image_url:
                            await conn.execute(
                                "UPDATE products SET image_url = $1, updated_at = NOW() WHERE id = $2",
                                image_url, product['id']
                            )
                    except Exception as img_err:
                        logger.warning(f"Image backfill failed for {product['id']}: {img_err}")
                    await asyncio.sleep(0.5)

    except Exception as e:
        logger.error(f"Error syncing store {store_id}: {e}")


@router.get("/products", response_model=ProductListResponse)
async def list_products(
    current_user: Annotated[dict, require_feature("demping")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)],
    filters: ProductFilters = Depends()
):
    """List products with filtering and pagination"""
    async with pool.acquire() as conn:
        # Build query conditions
        conditions = ["k.user_id = $1"]
        params = [current_user['id']]
        param_count = 1

        if filters.store_id:
            param_count += 1
            conditions.append(f"p.store_id = ${param_count}")
            params.append(uuid.UUID(filters.store_id))

        if filters.bot_active is not None:
            if filters.bot_active:
                # "Active" means either regular demping OR delivery demping is on
                conditions.append("(p.bot_active = true OR p.delivery_demping_enabled = true)")
            else:
                # "Inactive" means both are off
                conditions.append("(p.bot_active = false AND COALESCE(p.delivery_demping_enabled, false) = false)")

        if filters.search:
            param_count += 1
            conditions.append(f"p.name ILIKE ${param_count}")
            params.append(f"%{escape_like(filters.search)}%")

        where_clause = " AND ".join(conditions)

        # Get total count
        total = await conn.fetchval(
            f"""
            SELECT COUNT(*)
            FROM products p
            JOIN kaspi_stores k ON k.id = p.store_id
            WHERE {where_clause}
            """,
            *params
        )

        # Get products
        offset = (filters.page - 1) * filters.page_size
        products = await conn.fetch(
            f"""
            SELECT p.id, p.store_id, p.kaspi_product_id, p.kaspi_sku, p.external_kaspi_id,
                   p.name, p.price, p.min_profit, p.bot_active, p.last_check_time,
                   p.availabilities, p.created_at, p.updated_at, p.image_url,
                   COALESCE(p.pre_order_days, 0) as pre_order_days,
                   COALESCE(p.is_priority, false) as is_priority,
                   COALESCE(p.delivery_demping_enabled, false) as delivery_demping_enabled
            FROM products p
            JOIN kaspi_stores k ON k.id = p.store_id
            WHERE {where_clause}
            ORDER BY p.created_at DESC
            LIMIT ${param_count + 1} OFFSET ${param_count + 2}
            """,
            *params, filters.page_size, offset
        )

        product_responses = [
            ProductResponse(
                id=str(p['id']),
                store_id=str(p['store_id']),
                kaspi_product_id=p['kaspi_product_id'],
                kaspi_sku=p['kaspi_sku'],
                external_kaspi_id=p['external_kaspi_id'],
                name=p['name'],
                price=p['price'],
                image_url=p.get('image_url'),
                min_profit=p['min_profit'],
                bot_active=p['bot_active'],
                delivery_demping_enabled=p.get('delivery_demping_enabled', False) or False,
                pre_order_days=p.get('pre_order_days', 0) or 0,
                is_priority=p.get('is_priority', False) or False,
                last_check_time=p['last_check_time'],
                availabilities=json.loads(p['availabilities']) if isinstance(p['availabilities'], str) else p['availabilities'],
                created_at=p['created_at'],
                updated_at=p['updated_at']
            )
            for p in products
        ]

        return ProductListResponse(
            products=product_responses,
            total=total,
            page=filters.page,
            page_size=filters.page_size,
            has_more=(offset + filters.page_size) < total
        )


@router.patch("/products/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: str,
    update_data: ProductUpdateRequest,
    current_user: Annotated[dict, require_feature("demping")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """Update product settings"""
    logger.info(f"PATCH /products/{product_id}: {update_data.model_dump(exclude_none=True)}")
    async with pool.acquire() as conn:
        # Verify ownership
        product = await conn.fetchrow(
            """
            SELECT p.* FROM products p
            JOIN kaspi_stores k ON k.id = p.store_id
            WHERE p.id = $1 AND k.user_id = $2
            """,
            uuid.UUID(product_id),
            current_user['id']
        )

        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Product not found"
            )

        # Build update query
        updates = []
        params = []
        param_count = 0

        if update_data.price is not None:
            param_count += 1
            updates.append(f"price = ${param_count}")
            params.append(update_data.price)

        if update_data.min_profit is not None:
            param_count += 1
            updates.append(f"min_profit = ${param_count}")
            params.append(update_data.min_profit)

        # Skip explicit bot_active if preorder will override it
        if update_data.bot_active is not None and not (update_data.pre_order_days is not None and update_data.pre_order_days > 0):
            # Check demping limit when enabling
            if update_data.bot_active and not product['bot_active']:
                from ..services.feature_access import feature_access_service
                active_count = await conn.fetchval(
                    """
                    SELECT COUNT(*) FROM products p
                    JOIN kaspi_stores k ON k.id = p.store_id
                    WHERE k.user_id = $1 AND p.bot_active = true
                    """,
                    current_user['id']
                )
                within_limit, max_limit, msg = await feature_access_service.check_limit(pool, current_user['id'], 'demping', active_count)
                if not within_limit:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail={"error": "limit_exceeded", "feature": "demping", "current": active_count, "limit": max_limit, "message": msg}
                    )
            param_count += 1
            updates.append(f"bot_active = ${param_count}")
            params.append(update_data.bot_active)
            # Enabling regular demping disables delivery demping (mutually exclusive)
            if update_data.bot_active:
                updates.append("delivery_demping_enabled = false")

        # New product-level demping fields
        if update_data.max_price is not None:
            param_count += 1
            updates.append(f"max_price = ${param_count}")
            params.append(update_data.max_price)

        if update_data.min_price is not None:
            param_count += 1
            updates.append(f"min_price = ${param_count}")
            params.append(update_data.min_price)

        if update_data.price_step_override is not None:
            param_count += 1
            updates.append(f"price_step_override = ${param_count}")
            params.append(update_data.price_step_override)

        if update_data.demping_strategy is not None:
            param_count += 1
            updates.append(f"demping_strategy = ${param_count}")
            params.append(update_data.demping_strategy)

        if update_data.strategy_params is not None:
            param_count += 1
            updates.append(f"strategy_params = ${param_count}")
            params.append(json.dumps(update_data.strategy_params))

        if update_data.pre_order_days is not None:
            param_count += 1
            updates.append(f"pre_order_days = ${param_count}")
            params.append(update_data.pre_order_days)

        if update_data.is_priority is not None:
            # Check feature access: priority_products is Premium only
            if update_data.is_priority:
                from ..services.feature_access import feature_access_service
                has_access, msg = await feature_access_service.check_feature_access(pool, current_user['id'], 'priority_products')
                if not has_access:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail={"error": "feature_not_available", "feature": "priority_products", "message": msg}
                    )
            # Enforce limit: max 200 priority products per store
            # (Offers API = 8 RPS → ~1440 requests per 3 min, pricefeed = 1.5 RPS → ~270 per 3 min)
            if update_data.is_priority:
                priority_count = await conn.fetchval(
                    """
                    SELECT COUNT(*) FROM products
                    WHERE store_id = $1 AND is_priority = TRUE AND id != $2
                    """,
                    product['store_id'],
                    uuid.UUID(product_id)
                )
                if priority_count >= 200:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Maximum 200 priority products per store"
                    )
            param_count += 1
            updates.append(f"is_priority = ${param_count}")
            params.append(update_data.is_priority)

        # Preorder status tracking (independent of is_priority)
        if update_data.pre_order_days is not None:
            if update_data.pre_order_days > 0:
                # Auto-disable demping and track preorder status
                updates.append("bot_active = false")
                updates.append("delivery_demping_enabled = false")
                updates.append("preorder_status = 'pending'")
                updates.append("preorder_requested_at = NOW()")
            else:
                # Cancel preorder
                updates.append("preorder_status = 'none'")
                updates.append("preorder_requested_at = NULL")

        # Delivery demping (mutually exclusive with regular demping)
        # Skip explicit delivery_demping_enabled if preorder already set it to false
        if update_data.delivery_demping_enabled is not None and not (update_data.pre_order_days is not None and update_data.pre_order_days > 0):
            # Check feature access: delivery_demping is Premium only
            if update_data.delivery_demping_enabled:
                from ..services.feature_access import feature_access_service
                has_access, msg = await feature_access_service.check_feature_access(pool, current_user['id'], 'delivery_demping')
                if not has_access:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail={"error": "feature_not_available", "feature": "delivery_demping", "message": msg}
                    )

            param_count += 1
            updates.append(f"delivery_demping_enabled = ${param_count}")
            params.append(update_data.delivery_demping_enabled)

            if update_data.delivery_demping_enabled:
                # Disable regular demping when delivery demping is on
                updates.append("bot_active = false")

        if update_data.delivery_filter is not None:
            param_count += 1
            updates.append(f"delivery_filter = ${param_count}")
            params.append(update_data.delivery_filter)

        if not updates:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields to update"
            )

        param_count += 1
        params.append(uuid.UUID(product_id))

        updated = await conn.fetchrow(
            f"""
            UPDATE products
            SET {', '.join(updates)}, updated_at = NOW()
            WHERE id = ${param_count}
            RETURNING *
            """,
            *params
        )

        # Parse availabilities if it's a JSON string
        availabilities = updated['availabilities']
        if isinstance(availabilities, str):
            availabilities = json.loads(availabilities)

        # If pre_order_days changed, immediately sync to Kaspi (don't wait for worker)
        if update_data.pre_order_days is not None:
            merchant_id = await conn.fetchval(
                "SELECT merchant_id FROM kaspi_stores WHERE id = $1",
                updated['store_id']
            )
            if merchant_id:
                try:
                    session = await get_active_session_with_refresh(merchant_id)
                    if session:
                        await sync_product(
                            product_id=str(updated['id']),
                            new_price=updated['price'],
                            session=session,
                            pre_order_days=update_data.pre_order_days,
                        )
                        logger.info(f"Synced pre_order_days={update_data.pre_order_days} to Kaspi for product {product_id}")
                except Exception as e:
                    logger.warning(f"Failed to sync pre_order_days to Kaspi: {e}")

        return ProductResponse(
            id=str(updated['id']),
            store_id=str(updated['store_id']),
            kaspi_product_id=updated['kaspi_product_id'],
            kaspi_sku=updated['kaspi_sku'],
            external_kaspi_id=updated['external_kaspi_id'],
            name=updated['name'],
            price=updated['price'],
            min_profit=updated['min_profit'],
            bot_active=updated['bot_active'],
            pre_order_days=updated.get('pre_order_days', 0) or 0,
            is_priority=updated.get('is_priority', False) or False,
            last_check_time=updated['last_check_time'],
            availabilities=availabilities,
            created_at=updated['created_at'],
            updated_at=updated['updated_at']
        )


@router.get("/products/{product_id}/demping-details", response_model=ProductDempingDetails)
async def get_product_demping_details(
    product_id: str,
    current_user: Annotated[dict, require_feature("demping")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """Get detailed demping information for a product"""
    async with pool.acquire() as conn:
        # JOIN products + demping_settings + price_history count
        details = await conn.fetchrow(
            """
            SELECT
                p.*,
                ks.store_points,
                COALESCE(ds.price_step, 1) as store_price_step,
                COALESCE(ds.min_margin_percent, 5) as store_min_margin_percent,
                COALESCE(ds.work_hours_start, '09:00') as store_work_hours_start,
                COALESCE(ds.work_hours_end, '21:00') as store_work_hours_end,
                (
                    SELECT COUNT(*)
                    FROM price_history ph
                    WHERE ph.product_id = p.id
                    AND ph.created_at > NOW() - INTERVAL '7 days'
                ) as price_changes_count
            FROM products p
            JOIN kaspi_stores ks ON ks.id = p.store_id
            LEFT JOIN demping_settings ds ON ds.store_id = p.store_id
            WHERE p.id = $1 AND ks.user_id = $2
            """,
            uuid.UUID(product_id),
            current_user['id']
        )

        if not details:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Product not found"
            )

        # Parse strategy_params if it's a string
        strategy_params = details['strategy_params']
        if isinstance(strategy_params, str):
            strategy_params = json.loads(strategy_params)

        # Parse store_points JSONB
        store_points = details.get('store_points') or {}
        if isinstance(store_points, str):
            store_points = json.loads(store_points)

        return ProductDempingDetails(
            product_id=str(details['id']),
            product_name=details['name'],
            kaspi_sku=details['kaspi_sku'],
            current_price=details['price'],
            min_profit=details['min_profit'],
            bot_active=details['bot_active'],
            max_price=details['max_price'],
            min_price=details['min_price'],
            price_step_override=details['price_step_override'],
            demping_strategy=details['demping_strategy'] or 'standard',
            strategy_params=strategy_params,
            pre_order_days=details.get('pre_order_days', 0) or 0,
            is_priority=details.get('is_priority', False) or False,
            preorder_status=details.get('preorder_status', 'none') or 'none',
            delivery_demping_enabled=details.get('delivery_demping_enabled', False) or False,
            delivery_filter=details.get('delivery_filter', 'same_or_faster') or 'same_or_faster',
            store_points=store_points,
            store_price_step=details['store_price_step'],
            store_min_margin_percent=details['store_min_margin_percent'],
            store_work_hours_start=details['store_work_hours_start'],
            store_work_hours_end=details['store_work_hours_end'],
            last_check_time=details['last_check_time'],
            price_changes_count=details['price_changes_count']
        )


@router.post("/products/bulk-update", status_code=status.HTTP_200_OK)
async def bulk_update_products(
    bulk_data: BulkPriceUpdateRequest,
    current_user: Annotated[dict, require_feature("demping")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """Bulk update product prices or settings"""
    async with pool.acquire() as conn:
        # Verify all products belong to user
        product_uuids = [uuid.UUID(pid) for pid in bulk_data.product_ids]

        count = await conn.fetchval(
            """
            SELECT COUNT(*)
            FROM products p
            JOIN kaspi_stores k ON k.id = p.store_id
            WHERE p.id = ANY($1) AND k.user_id = $2
            """,
            product_uuids,
            current_user['id']
        )

        if count != len(bulk_data.product_ids):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Some products do not belong to you"
            )

        # Perform bulk update with parameterized queries
        updates = []
        params = [product_uuids]  # $1 = product IDs
        param_idx = 2

        if bulk_data.bot_active is not None:
            # Check demping limit when bulk-enabling
            if bulk_data.bot_active:
                from ..services.feature_access import feature_access_service
                active_count = await conn.fetchval(
                    """
                    SELECT COUNT(*) FROM products p
                    JOIN kaspi_stores k ON k.id = p.store_id
                    WHERE k.user_id = $1 AND p.bot_active = true AND p.id != ALL($2)
                    """,
                    current_user['id'], product_uuids
                )
                new_total = active_count + len(bulk_data.product_ids)
                within_limit, max_limit, msg = await feature_access_service.check_limit(pool, current_user['id'], 'demping', new_total - 1)
                if not within_limit:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail={"error": "limit_exceeded", "feature": "demping", "current": active_count, "adding": len(bulk_data.product_ids), "limit": max_limit, "message": msg}
                    )
            updates.append(f"bot_active = ${param_idx}")
            params.append(bulk_data.bot_active)
            param_idx += 1

        if bulk_data.price_change_percent is not None:
            updates.append(
                f"price = ROUND(price * (1 + ${param_idx}))::INTEGER"
            )
            params.append(bulk_data.price_change_percent / 100.0)
            param_idx += 1
        elif bulk_data.price_change_tiyns is not None:
            updates.append(f"price = price + ${param_idx}")
            params.append(bulk_data.price_change_tiyns)
            param_idx += 1

        if not updates:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No updates specified"
            )

        result = await conn.execute(
            f"""
            UPDATE products
            SET {', '.join(updates)}, updated_at = NOW()
            WHERE id = ANY($1)
            """,
            *params
        )

        updated_count = int(result.split()[-1])

        return {
            "status": "success",
            "updated_count": updated_count
        }


@router.post("/products/{product_id}/check-demping")
async def check_product_demping(
    product_id: str,
    current_user: Annotated[dict, require_feature("demping")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """
    Manually trigger demping check for a specific product.
    Returns current settings without making changes.
    """
    async with pool.acquire() as conn:
        product = await conn.fetchrow(
            """
            SELECT
                p.*,
                ks.merchant_id,
                COALESCE(ds.price_step, 1) as store_price_step,
                COALESCE(ds.min_margin_percent, 5) as store_min_margin_percent
            FROM products p
            JOIN kaspi_stores ks ON ks.id = p.store_id
            LEFT JOIN demping_settings ds ON ds.store_id = p.store_id
            WHERE p.id = $1 AND ks.user_id = $2
            """,
            uuid.UUID(product_id),
            current_user['id']
        )

        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Product not found"
            )

        current_price = product['price']
        min_price = product['min_price'] or product['min_profit']
        max_price = product['max_price']
        price_step = product['price_step_override'] or product['store_price_step']
        strategy = product['demping_strategy'] or 'standard'

        return {
            "status": "success",
            "product_id": product_id,
            "product_name": product['name'],
            "current_price": current_price,
            "min_price": min_price,
            "max_price": max_price,
            "price_step": price_step,
            "strategy": strategy,
            "bot_active": product['bot_active'],
            "message": "Настройки демпинга получены",
            "last_check_time": product['last_check_time']
        }


@router.post("/products/{product_id}/run-demping")
async def run_product_demping(
    product_id: str,
    current_user: Annotated[dict, require_feature("demping")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """
    Manually run demping for a specific product.
    Fetches competitor prices from Kaspi and updates price if needed.
    """
    async with pool.acquire() as conn:
        # Get product with store info
        product = await conn.fetchrow(
            """
            SELECT
                p.*,
                ks.merchant_id,
                ks.guid,
                COALESCE(ds.price_step, 1) as store_price_step,
                COALESCE(ds.excluded_merchant_ids, '{}') as excluded_merchant_ids
            FROM products p
            JOIN kaspi_stores ks ON ks.id = p.store_id
            LEFT JOIN demping_settings ds ON ds.store_id = p.store_id
            WHERE p.id = $1 AND ks.user_id = $2
            """,
            uuid.UUID(product_id),
            current_user['id']
        )

        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Product not found"
            )

        external_id = product['external_kaspi_id']
        merchant_id = product['merchant_id']
        current_price = product['price']
        min_price = product['min_price'] or product['min_profit'] or 0
        max_price = product['max_price']
        price_step = product['price_step_override'] or product['store_price_step']
        
        # Get excluded merchant IDs (own stores that should not be considered as competitors)
        excluded_merchant_ids = set(product['excluded_merchant_ids'] or [])
        excluded_merchant_ids.add(merchant_id)  # Always exclude our own merchant
        strategy = product['demping_strategy'] or 'standard'

        # Get session for this store (with auto-refresh if expired)
        session = await get_active_session_with_refresh(merchant_id)
        if not session:
            # Try to check if it needs re-auth (column may not exist if migration pending)
            reason = 'unknown'
            try:
                reauth_info = await conn.fetchrow(
                    "SELECT needs_reauth, reauth_reason FROM kaspi_stores WHERE merchant_id = $1",
                    merchant_id
                )
                if reauth_info:
                    reason = reauth_info.get('reauth_reason') or 'unknown'
            except Exception as e:
                logger.warning(f"Could not check reauth status (migration may be pending): {e}")

            if reason == 'sms_required':
                message = f"Требуется SMS верификация. Перейдите в раздел Магазины для повторной авторизации."
            elif reason == 'invalid_credentials':
                message = f"Неверные учётные данные. Обновите логин/пароль в разделе Магазины."
            elif reason == 'credentials_missing':
                message = f"Учётные данные не сохранены. Переавторизуйтесь в разделе Магазины."
            else:
                message = f"Нет активной сессии для магазина {merchant_id}. Требуется повторная авторизация."

            return {
                "status": "error",
                "message": message,
                "product_id": product_id,
                "current_price": current_price,
                "needs_reauth": True,
                "reauth_reason": reason
            }

        # Fetch competitor prices from Kaspi
        try:
            product_data = await parse_product_by_sku(str(external_id), session)
        except Exception as e:
            logger.error(f"Error fetching competitor prices: {e}")
            return {
                "status": "error",
                "message": f"Ошибка получения цен конкурентов: {str(e)}",
                "product_id": product_id,
                "current_price": current_price
            }

        if not product_data:
            return {
                "status": "no_data",
                "message": "Не удалось получить данные о товаре от Kaspi",
                "product_id": product_id,
                "current_price": current_price
            }

        # Extract offers
        offers = product_data.get("offers", []) if isinstance(product_data, dict) else product_data

        if not offers:
            return {
                "status": "no_offers",
                "message": "Нет предложений конкурентов",
                "product_id": product_id,
                "current_price": current_price,
                "offers_count": 0
            }

        # Find minimum competitor price (excluding our offer and excluded merchants)
        min_competitor_price = None
        our_position = None
        sorted_offers = []

        for i, offer in enumerate(offers):
            offer_merchant_id = offer.get("merchantId")
            offer_price = offer.get("price")

            if offer_price is not None:
                is_ours = offer_merchant_id == merchant_id
                is_excluded = offer_merchant_id in excluded_merchant_ids
                sorted_offers.append({
                    "merchant_id": offer_merchant_id,
                    "price": offer_price,
                    "is_ours": is_ours,
                    "is_excluded": is_excluded
                })

                if is_ours:
                    our_position = i + 1
                elif not is_excluded and (min_competitor_price is None or offer_price < min_competitor_price):
                    min_competitor_price = offer_price

        # Sort by price
        sorted_offers.sort(key=lambda x: x['price'])

        if min_competitor_price is None:
            return {
                "status": "no_competitors",
                "message": "Вы единственный продавец (или все конкуренты исключены)",
                "product_id": product_id,
                "current_price": current_price,
                "offers": sorted_offers[:5]
            }

        # Calculate target price based on strategy
        # Filter out excluded offers for strategy calculations
        competitor_offers = [o for o in sorted_offers if not o['is_excluded']]
        
        if strategy == 'always_first':
            target_price = min_competitor_price - price_step  # На price_step дешевле
        elif strategy == 'stay_top_n':
            top_position = (product['strategy_params'] or {}).get('top_position', 3)
            prices = [o['price'] for o in competitor_offers]
            if len(prices) >= top_position:
                target_price = prices[top_position - 1] - price_step
            else:
                target_price = prices[-1] - price_step if prices else current_price
        else:  # standard
            target_price = min_competitor_price - price_step

        # Apply min/max constraints
        # Kaspi не позволяет выставлять цену ниже 10 тенге
        KASPI_MIN_PRICE = 10
        effective_min_price = max(min_price, KASPI_MIN_PRICE) if min_price > 0 else KASPI_MIN_PRICE

        if target_price < effective_min_price:
            # Конкурент ниже нашего минимума
            if current_price > effective_min_price:
                # Мы выше минимума - опускаемся до минимума
                target_price = effective_min_price
            else:
                # Мы уже на минимуме или ниже - ждём повышения конкурента
                return {
                    "status": "waiting",
                    "message": f"Цена конкурента ({min_competitor_price}) ниже нашего минимума ({effective_min_price}). Ждём повышения.",
                    "product_id": product_id,
                    "current_price": current_price,
                    "min_price": effective_min_price,
                    "min_competitor_price": min_competitor_price,
                    "strategy": strategy,
                    "offers": sorted_offers[:5]
                }

        if max_price and target_price > max_price:
            target_price = max_price

        # Check if update is needed
        if target_price == current_price:
            return {
                "status": "no_change",
                "message": f"Изменение не требуется. Целевая цена ({target_price}) = текущей ({current_price})",
                "product_id": product_id,
                "current_price": current_price,
                "target_price": target_price,
                "min_competitor_price": min_competitor_price,
                "strategy": strategy,
                "offers": sorted_offers[:5]
            }

        # Update price via Kaspi API
        try:
            sync_result = await sync_product(
                product_id=str(product['id']),
                new_price=int(target_price),
                session=session
            )

            if not sync_result or not sync_result.get("success"):
                return {
                    "status": "sync_failed",
                    "message": "Не удалось обновить цену в Kaspi",
                    "product_id": product_id,
                    "current_price": current_price,
                    "target_price": target_price
                }

            # Record price change
            await conn.execute(
                """
                INSERT INTO price_history (
                    id, product_id, old_price, new_price,
                    competitor_price, change_reason, created_at
                )
                VALUES (gen_random_uuid(), $1, $2, $3, $4, 'demper', NOW())
                """,
                uuid.UUID(product_id),
                current_price,
                int(target_price),
                int(min_competitor_price)
            )

            # Update product price in DB
            await conn.execute(
                """
                UPDATE products
                SET price = $1, last_check_time = NOW(), updated_at = NOW()
                WHERE id = $2
                """,
                int(target_price),
                uuid.UUID(product_id)
            )

            return {
                "status": "success",
                "message": f"Цена успешно обновлена: {current_price} → {target_price} ₸",
                "product_id": product_id,
                "old_price": current_price,
                "new_price": int(target_price),
                "min_competitor_price": min_competitor_price,
                "strategy": strategy,
                "offers": sorted_offers[:5]
            }

        except Exception as e:
            logger.error(f"Error updating price: {e}")
            return {
                "status": "error",
                "message": f"Ошибка обновления цены: {str(e)}",
                "product_id": product_id,
                "current_price": current_price
            }


@router.get("/analytics", response_model=ProductAnalytics)
async def get_analytics(
    current_user: Annotated[dict, require_feature("analytics")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """Get product analytics for user"""
    async with pool.acquire() as conn:
        stats = await conn.fetchrow(
            """
            SELECT
                COUNT(*) as total_products,
                COUNT(*) FILTER (WHERE p.bot_active = true) as active_demping,
                COALESCE(AVG(p.min_profit), 0)::INTEGER as avg_profit,
                (
                    SELECT COUNT(*)
                    FROM price_history ph
                    JOIN products p2 ON p2.id = ph.product_id
                    JOIN kaspi_stores k2 ON k2.id = p2.store_id
                    WHERE k2.user_id = $1
                      AND ph.created_at >= CURRENT_DATE
                ) as changes_today
            FROM products p
            JOIN kaspi_stores k ON k.id = p.store_id
            WHERE k.user_id = $1
            """,
            current_user['id']
        )

        return ProductAnalytics(
            total_products=stats['total_products'],
            active_demping=stats['active_demping'],
            total_price_changes_today=stats['changes_today'],
            average_profit_margin_tiyns=stats['avg_profit']
        )


# ============================================================================
# Store-Specific Endpoints (REST-style)
# ============================================================================

@router.get("/stores/{store_id}/products", response_model=ProductListResponse)
async def list_store_products(
    store_id: str,
    current_user: Annotated[dict, require_feature("demping")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)],
    filters: ProductFilters = Depends()
):
    """List products for specific store (REST-style endpoint)"""
    # Verify store ownership
    async with pool.acquire() as conn:
        store = await conn.fetchrow(
            "SELECT id FROM kaspi_stores WHERE id = $1 AND user_id = $2",
            uuid.UUID(store_id),
            current_user['id']
        )
        if not store:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Store not found"
            )

    # Set store_id filter and reuse existing list_products logic
    filters.store_id = store_id
    return await list_products(current_user, pool, filters)


@router.get("/stores/{store_id}/demping", response_model=DempingSettings)
async def get_store_demping_settings(
    store_id: str,
    current_user: Annotated[dict, require_feature("demping")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """Get demping settings for store"""
    async with pool.acquire() as conn:
        # Verify ownership
        store = await conn.fetchrow(
            "SELECT id FROM kaspi_stores WHERE id = $1 AND user_id = $2",
            uuid.UUID(store_id),
            current_user['id']
        )
        if not store:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Store not found"
            )

        # Get or create settings
        settings = await conn.fetchrow(
            "SELECT * FROM demping_settings WHERE store_id = $1",
            uuid.UUID(store_id)
        )

        if not settings:
            # Create default settings
            settings = await conn.fetchrow(
                """
                INSERT INTO demping_settings (store_id)
                VALUES ($1)
                RETURNING *
                """,
                uuid.UUID(store_id)
            )

        return DempingSettings(
            id=str(settings['id']),
            store_id=str(settings['store_id']),
            min_profit=settings['min_profit'],
            bot_active=settings['bot_active'],
            price_step=settings['price_step'],
            min_margin_percent=settings['min_margin_percent'],
            check_interval_minutes=settings['check_interval_minutes'],
            work_hours_start=settings['work_hours_start'],
            work_hours_end=settings['work_hours_end'],
            is_enabled=settings['is_enabled'],
            last_check=settings['last_check'],
            created_at=settings['created_at'],
            updated_at=settings['updated_at'],
            excluded_merchant_ids=settings['excluded_merchant_ids'] or []
        )


@router.patch("/stores/{store_id}/demping", response_model=DempingSettings)
async def update_store_demping_settings(
    store_id: str,
    settings_update: DempingSettingsUpdate,
    current_user: Annotated[dict, require_feature("demping")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """Update demping settings for store"""
    async with pool.acquire() as conn:
        # Verify ownership
        store = await conn.fetchrow(
            "SELECT id FROM kaspi_stores WHERE id = $1 AND user_id = $2",
            uuid.UUID(store_id),
            current_user['id']
        )
        if not store:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Store not found"
            )

        # Build UPDATE query dynamically for only the fields provided
        update_dict = settings_update.dict(exclude_unset=True)

        if not update_dict:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields to update"
            )

        # Build SET clause — only allow whitelisted fields
        set_clauses = []
        values = [uuid.UUID(store_id)]
        param_num = 2

        for field, value in update_dict.items():
            if field not in DEMPING_SETTINGS_FIELDS:
                continue
            set_clauses.append(f"{field} = ${param_num}")
            values.append(value)
            param_num += 1

        if not set_clauses:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No valid fields to update"
            )

        # Try to update existing settings
        query = f"""
            UPDATE demping_settings
            SET {', '.join(set_clauses)}
            WHERE store_id = $1
            RETURNING *
        """

        settings = await conn.fetchrow(query, *values)

        # If no settings exist, create with provided values (use only whitelisted fields)
        if not settings:
            filtered_dict = {k: v for k, v in update_dict.items() if k in DEMPING_SETTINGS_FIELDS}
            columns = ['store_id'] + list(filtered_dict.keys())
            placeholders = ['$1'] + [f'${i+2}' for i in range(len(filtered_dict))]

            insert_query = f"""
                INSERT INTO demping_settings ({', '.join(columns)})
                VALUES ({', '.join(placeholders)})
                RETURNING *
            """

            settings = await conn.fetchrow(insert_query, uuid.UUID(store_id), *filtered_dict.values())

        return DempingSettings(
            id=str(settings['id']),
            store_id=str(settings['store_id']),
            min_profit=settings['min_profit'],
            bot_active=settings['bot_active'],
            price_step=settings['price_step'],
            min_margin_percent=settings['min_margin_percent'],
            check_interval_minutes=settings['check_interval_minutes'],
            work_hours_start=settings['work_hours_start'],
            work_hours_end=settings['work_hours_end'],
            is_enabled=settings['is_enabled'],
            last_check=settings['last_check'],
            created_at=settings['created_at'],
            updated_at=settings['updated_at'],
            excluded_merchant_ids=settings['excluded_merchant_ids'] or []
        )


@router.get("/stores/{store_id}/stats", response_model=StoreStats)
async def get_store_stats(
    store_id: str,
    current_user: Annotated[dict, require_feature("analytics")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """Get store statistics"""
    async with pool.acquire() as conn:
        # Verify ownership and get store info
        store = await conn.fetchrow(
            "SELECT * FROM kaspi_stores WHERE id = $1 AND user_id = $2",
            uuid.UUID(store_id),
            current_user['id']
        )
        if not store:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Store not found"
            )

        # Get products stats
        stats = await conn.fetchrow(
            """
            SELECT
                COUNT(*) as total_products,
                COUNT(*) FILTER (WHERE price > 0) as active_products,
                COUNT(*) FILTER (WHERE bot_active = true) as demping_enabled
            FROM products
            WHERE store_id = $1
            """,
            uuid.UUID(store_id)
        )

        # Get orders stats (exclude cancelled/returned)
        orders_stats = await conn.fetchrow(
            """
            SELECT
                COUNT(*) FILTER (WHERE order_date >= CURRENT_DATE) as today_orders,
                COALESCE(SUM(total_price) FILTER (WHERE order_date >= CURRENT_DATE), 0) as today_revenue,
                COALESCE(SUM(
                    (SELECT COALESCE(SUM(quantity), 0) FROM order_items WHERE order_id = orders.id)
                ) FILTER (WHERE order_date >= CURRENT_DATE), 0) as today_items_sold,
                COUNT(*) FILTER (WHERE order_date >= NOW() - INTERVAL '7 days') as week_orders,
                COALESCE(SUM(total_price) FILTER (WHERE order_date >= NOW() - INTERVAL '7 days'), 0) as week_revenue,
                COUNT(*) FILTER (WHERE order_date >= NOW() - INTERVAL '30 days') as month_orders,
                COALESCE(SUM(total_price) FILTER (WHERE order_date >= NOW() - INTERVAL '30 days'), 0) as month_revenue,
                COUNT(*) as total_orders,
                COALESCE(SUM(total_price), 0) as total_revenue
            FROM orders
            WHERE store_id = $1
                AND status NOT IN ('CANCELLED', 'CANCELLING', 'RETURNED')
            """,
            uuid.UUID(store_id)
        )

        today_avg = (
            orders_stats['today_revenue'] // orders_stats['today_orders']
            if orders_stats['today_orders'] > 0 else 0
        )
        avg_order_value = (
            orders_stats['total_revenue'] // orders_stats['total_orders']
            if orders_stats['total_orders'] > 0 else 0
        )

        return StoreStats(
            store_id=store_id,
            store_name=store['name'],
            products_count=stats['total_products'] or 0,
            active_products_count=stats['active_products'] or 0,
            demping_enabled_count=stats['demping_enabled'] or 0,
            today_orders=orders_stats['today_orders'] or 0,
            today_revenue=orders_stats['today_revenue'] or 0,
            today_items_sold=orders_stats['today_items_sold'] or 0,
            today_avg_order=today_avg,
            week_orders=orders_stats['week_orders'] or 0,
            week_revenue=orders_stats['week_revenue'] or 0,
            month_orders=orders_stats['month_orders'] or 0,
            month_revenue=orders_stats['month_revenue'] or 0,
            avg_order_value=avg_order_value,
            last_sync=store['last_sync']
        )


@router.get("/stores/{store_id}/analytics", response_model=SalesAnalytics)
async def get_store_analytics(
    store_id: str,
    current_user: Annotated[dict, require_feature("analytics")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)],
    period: str = '7d'
):
    """Get sales analytics from orders data"""
    # Validate period
    if period not in ['7d', '30d', '90d']:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Period must be one of: 7d, 30d, 90d"
        )

    async with pool.acquire() as conn:
        # Verify ownership
        store = await conn.fetchrow(
            "SELECT * FROM kaspi_stores WHERE id = $1 AND user_id = $2",
            uuid.UUID(store_id),
            current_user['id']
        )
        if not store:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Store not found"
            )

        days = {'7d': 7, '30d': 30, '90d': 90}[period]
        start_date = datetime.utcnow() - timedelta(days=days)

        # Get daily stats from orders table (exclude cancelled/returned)
        daily_data = await conn.fetch(
            """
            SELECT
                DATE(order_date) as date,
                COUNT(*) as orders,
                COALESCE(SUM(total_price), 0) as revenue,
                COALESCE(SUM(
                    (SELECT COALESCE(SUM(quantity), 0) FROM order_items WHERE order_id = orders.id)
                ), 0) as items
            FROM orders
            WHERE store_id = $1 AND order_date >= $2
                AND status NOT IN ('CANCELLED', 'CANCELLING', 'RETURNED')
            GROUP BY DATE(order_date)
            ORDER BY date ASC
            """,
            uuid.UUID(store_id),
            start_date
        )

        # Create a map of date -> stats
        stats_map = {
            row['date'].strftime('%Y-%m-%d'): {
                'date': row['date'].strftime('%Y-%m-%d'),
                'orders': row['orders'],
                'revenue': row['revenue'],
                'items': row['items']
            }
            for row in daily_data
        }

        # Fill in missing days with zeros
        daily_stats = []
        for i in range(days):
            date = (datetime.utcnow() - timedelta(days=days-i-1)).strftime('%Y-%m-%d')
            if date in stats_map:
                daily_stats.append(stats_map[date])
            else:
                daily_stats.append({
                    'date': date,
                    'orders': 0,
                    'revenue': 0,
                    'items': 0
                })

        # Compute summary totals from daily stats
        total_orders = sum(d['orders'] for d in daily_stats)
        total_revenue = sum(d['revenue'] for d in daily_stats)
        total_items_sold = sum(d['items'] for d in daily_stats)
        avg_order_value = total_revenue // total_orders if total_orders > 0 else 0

        return SalesAnalytics(
            store_id=store_id,
            period=period,
            total_orders=total_orders,
            total_revenue=total_revenue,
            total_items_sold=total_items_sold,
            avg_order_value=avg_order_value,
            daily_stats=daily_stats
        )


@router.get("/stores/{store_id}/top-products", response_model=List[TopProduct])
async def get_top_products(
    store_id: str,
    current_user: Annotated[dict, require_feature("analytics")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)],
    limit: int = 10,
    period: str = '7d'
):
    """Get top products by sales from orders"""
    # Clamp limit
    limit = clamp_page_size(limit, max_size=50)
    if period not in ['7d', '30d', '90d']:
        period = '7d'
    days = {'7d': 7, '30d': 30, '90d': 90}[period]
    start_date = datetime.utcnow() - timedelta(days=days)

    async with pool.acquire() as conn:
        # Verify ownership
        store = await conn.fetchrow(
            "SELECT * FROM kaspi_stores WHERE id = $1 AND user_id = $2",
            uuid.UUID(store_id),
            current_user['id']
        )
        if not store:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Store not found"
            )

        # Get top products by sales (from order_items, filtered by period and status)
        products = await conn.fetch(
            """
            SELECT
                COALESCE(p.id, oi.product_id) as id,
                COALESCE(p.kaspi_sku, oi.sku) as kaspi_sku,
                COALESCE(p.name, oi.name) as name,
                COALESCE(p.price, 0) as current_price,
                SUM(oi.quantity) as sales_count,
                SUM(oi.quantity * oi.price) as revenue
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            LEFT JOIN products p ON p.id = oi.product_id
            WHERE o.store_id = $1
                AND o.order_date >= $3
                AND o.status NOT IN ('CANCELLED', 'CANCELLING', 'RETURNED')
            GROUP BY COALESCE(p.id, oi.product_id), COALESCE(p.kaspi_sku, oi.sku),
                     COALESCE(p.name, oi.name), COALESCE(p.price, 0)
            ORDER BY sales_count DESC
            LIMIT $2
            """,
            uuid.UUID(store_id),
            limit,
            start_date
        )

        # If no order data, fallback to products list
        if not products:
            products = await conn.fetch(
                """
                SELECT
                    p.id, p.kaspi_sku, p.name, p.price as current_price,
                    0 as sales_count, 0 as revenue
                FROM products p
                WHERE p.store_id = $1
                ORDER BY p.name
                LIMIT $2
                """,
                uuid.UUID(store_id),
                limit
            )

        return [
            TopProduct(
                id=str(p['id']) if p['id'] else '',
                kaspi_sku=p['kaspi_sku'] or '',
                name=p['name'],
                current_price=p['current_price'],
                sales_count=p['sales_count'] or 0,
                revenue=p['revenue'] or 0
            )
            for p in products
        ]


# Label maps for human-readable breakdown names
PAYMENT_MODE_LABELS = {
    "PAY_WITH_CREDIT": "Кредит",
    "PREPAID": "Безналичная оплата",
}
DELIVERY_MODE_LABELS = {
    "DELIVERY_PICKUP": "Самовывоз",
    "DELIVERY_LOCAL": "Доставка по городу",
    "DELIVERY_REGIONAL_TODOOR": "Kaspi Доставка (область)",
    "DELIVERY_REGIONAL_PICKUP": "Межрегиональный самовывоз",
}

ACTIVE_STATUSES = {"APPROVED_BY_BANK", "ACCEPTED_BY_MERCHANT"}
COMPLETED_STATUSES = {"COMPLETED"}
CANCELLED_STATUSES = {"CANCELLED", "CANCELLING", "RETURNED", "KASPI_DELIVERY_RETURN_REQUESTED"}


@router.get("/stores/{store_id}/order-pipeline", response_model=OrderPipeline)
async def get_order_pipeline(
    store_id: str,
    current_user: Annotated[dict, require_feature("analytics")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)],
    period: str = '7d'
):
    """Get order pipeline with status counts and conversion metrics"""
    if period not in ['7d', '30d', '90d']:
        period = '7d'
    days = {'7d': 7, '30d': 30, '90d': 90}[period]
    start_date = datetime.utcnow() - timedelta(days=days)

    async with pool.acquire() as conn:
        store = await conn.fetchrow(
            "SELECT id FROM kaspi_stores WHERE id = $1 AND user_id = $2",
            uuid.UUID(store_id), current_user['id']
        )
        if not store:
            raise HTTPException(status_code=404, detail="Store not found")

        rows = await conn.fetch(
            """
            SELECT status, COUNT(*) as cnt, COALESCE(SUM(total_price), 0) as rev
            FROM orders
            WHERE store_id = $1 AND order_date >= $2
            GROUP BY status
            """,
            uuid.UUID(store_id), start_date
        )

    active = PipelineGroup(count=0, revenue=0)
    completed = PipelineGroup(count=0, revenue=0)
    cancelled = PipelineGroup(count=0, revenue=0)
    total_count = 0
    total_revenue = 0

    for row in rows:
        s = row['status'] or ''
        c, r = row['cnt'], row['rev']
        total_count += c
        total_revenue += r
        if s in ACTIVE_STATUSES:
            active.count += c
            active.revenue += r
        elif s in COMPLETED_STATUSES:
            completed.count += c
            completed.revenue += r
        elif s in CANCELLED_STATUSES:
            cancelled.count += c
            cancelled.revenue += r
        else:
            # Unknown status — count in total but not in groups
            pass

    decided = completed.count + cancelled.count
    conversion_rate = round((completed.count / decided * 100), 1) if decided > 0 else 0.0
    cancellation_rate = round((cancelled.count / total_count * 100), 1) if total_count > 0 else 0.0

    return OrderPipeline(
        active=active,
        completed=completed,
        cancelled=cancelled,
        total=PipelineGroup(count=total_count, revenue=total_revenue),
        conversion_rate=conversion_rate,
        cancellation_rate=cancellation_rate,
    )


@router.get("/stores/{store_id}/order-breakdowns", response_model=OrderBreakdowns)
async def get_order_breakdowns(
    store_id: str,
    current_user: Annotated[dict, require_feature("analytics")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)],
    period: str = '7d'
):
    """Get order breakdowns by payment mode, delivery mode, and city"""
    if period not in ['7d', '30d', '90d']:
        period = '7d'
    days = {'7d': 7, '30d': 30, '90d': 90}[period]
    start_date = datetime.utcnow() - timedelta(days=days)

    async with pool.acquire() as conn:
        store = await conn.fetchrow(
            "SELECT id FROM kaspi_stores WHERE id = $1 AND user_id = $2",
            uuid.UUID(store_id), current_user['id']
        )
        if not store:
            raise HTTPException(status_code=404, detail="Store not found")

        sid = uuid.UUID(store_id)
        excluded = ('CANCELLED', 'CANCELLING', 'RETURNED')

        # Payment mode breakdown
        payment_rows = await conn.fetch(
            """
            SELECT payment_mode, COUNT(*) as cnt, COALESCE(SUM(total_price), 0) as rev
            FROM orders
            WHERE store_id = $1 AND order_date >= $2
                AND status NOT IN ('CANCELLED', 'CANCELLING', 'RETURNED')
            GROUP BY payment_mode
            ORDER BY cnt DESC
            """,
            sid, start_date
        )

        # Delivery mode breakdown
        delivery_rows = await conn.fetch(
            """
            SELECT delivery_mode, COUNT(*) as cnt, COALESCE(SUM(total_price), 0) as rev
            FROM orders
            WHERE store_id = $1 AND order_date >= $2
                AND status NOT IN ('CANCELLED', 'CANCELLING', 'RETURNED')
            GROUP BY delivery_mode
            ORDER BY cnt DESC
            """,
            sid, start_date
        )

        # City breakdown (first part of delivery_address before comma)
        city_rows = await conn.fetch(
            """
            SELECT
                TRIM(SPLIT_PART(delivery_address, ',', 1)) as city,
                COUNT(*) as cnt,
                COALESCE(SUM(total_price), 0) as rev
            FROM orders
            WHERE store_id = $1 AND order_date >= $2
                AND delivery_address IS NOT NULL AND delivery_address != ''
                AND status NOT IN ('CANCELLED', 'CANCELLING', 'RETURNED')
            GROUP BY TRIM(SPLIT_PART(delivery_address, ',', 1))
            ORDER BY cnt DESC
            """,
            sid, start_date
        )

        # Total delivery cost for seller
        delivery_cost_row = await conn.fetchrow(
            """
            SELECT COALESCE(SUM(delivery_cost), 0) as total
            FROM orders
            WHERE store_id = $1 AND order_date >= $2
                AND status NOT IN ('CANCELLED', 'CANCELLING', 'RETURNED')
            """,
            sid, start_date
        )

    payment = [
        BreakdownItem(
            label=PAYMENT_MODE_LABELS.get(r['payment_mode'] or '', r['payment_mode'] or 'Другое'),
            key=r['payment_mode'] or '',
            count=r['cnt'],
            revenue=r['rev'],
        )
        for r in payment_rows if r['payment_mode']
    ]

    delivery = [
        BreakdownItem(
            label=DELIVERY_MODE_LABELS.get(r['delivery_mode'] or '', r['delivery_mode'] or 'Другое'),
            key=r['delivery_mode'] or '',
            count=r['cnt'],
            revenue=r['rev'],
        )
        for r in delivery_rows if r['delivery_mode']
    ]

    cities = [
        BreakdownItem(
            label=r['city'],
            count=r['cnt'],
            revenue=r['rev'],
        )
        for r in city_rows if r['city']
    ]

    return OrderBreakdowns(
        payment=payment,
        delivery=delivery,
        cities=cities,
        delivery_cost_total=delivery_cost_row['total'] if delivery_cost_row else 0,
    )


# ============================================================================
# Additional Frontend Compatibility Endpoints
# ============================================================================

@router.delete("/stores/{store_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_store(
    store_id: str,
    current_user: Annotated[dict, require_feature("demping")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """Deactivate store (soft delete) — data stays in DB"""
    async with pool.acquire() as conn:
        result = await conn.execute(
            "UPDATE kaspi_stores SET is_active = FALSE WHERE id = $1 AND user_id = $2",
            store_id, current_user['id']
        )
        if result == "UPDATE 0":
            raise HTTPException(status_code=404, detail="Магазин не найден")


async def _sync_products_to_db(
    pool: asyncpg.Pool,
    store_id: str,
    products: List[dict],
    source: str = "rest_api"
) -> int:
    """
    Sync products from REST API to database with FULL data.

    REST API returns COMPLETE product data:
    - attributes.name (название) ✅
    - attributes.price (цена) ✅
    - attributes.sku (артикул) ✅
    - attributes.description (описание) - not saved yet (column doesn't exist)
    - attributes.images (изображения) - not saved yet

    Unlike GraphQL which returns only IDs/SKUs without names.

    Args:
        pool: Database connection pool
        store_id: Store UUID
        products: List of product data from REST API (JSON:API format)
        source: Data source ("rest_api" or "graphql") - not used currently

    Returns:
        Number of products synced
    """
    synced_count = 0

    async with pool.acquire() as conn:
        for product_data in products:
            try:
                product_id = product_data.get("id")
                if not product_id:
                    continue

                attributes = product_data.get("attributes", {})

                # Extract FULL data from REST API
                name = attributes.get("name") or "Товар без названия"  # name is NOT NULL
                price = attributes.get("price") or 0  # price is NOT NULL
                sku = attributes.get("sku") or attributes.get("code")

                # Build image URL from Kaspi CDN
                images = attributes.get("images", [])
                image_url = (
                    f"https://resources.cdn-kaspi.kz/img/m/p/{images[0]}"
                    if images
                    else None
                )

                # Save with full data (UPSERT)
                await conn.execute("""
                    INSERT INTO products (
                        store_id, external_kaspi_id, kaspi_sku, name,
                        price, image_url, updated_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, NOW())
                    ON CONFLICT (store_id, external_kaspi_id)
                    DO UPDATE SET
                        name = EXCLUDED.name,
                        price = EXCLUDED.price,
                        kaspi_sku = EXCLUDED.kaspi_sku,
                        image_url = COALESCE(EXCLUDED.image_url, products.image_url),
                        updated_at = NOW()
                """,
                    uuid.UUID(store_id),
                    product_id,
                    sku,
                    name,
                    price,
                    image_url
                )

                synced_count += 1

            except Exception as e:
                logger.error(f"Error syncing product {product_data.get('id')}: {e}")
                continue

        # Update store's last_sync timestamp
        await conn.execute(
            "UPDATE kaspi_stores SET last_sync = NOW() WHERE id = $1",
            uuid.UUID(store_id)
        )

    logger.info(f"Synced {synced_count}/{len(products)} products to DB with full data (source: {source})")
    return synced_count


@router.post("/stores/{store_id}/sync", status_code=status.HTTP_202_ACCEPTED)
async def sync_store_products_by_id(
    store_id: str,
    background_tasks: BackgroundTasks,
    current_user: Annotated[dict, require_feature("demping")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """
    Sync products for a specific store.

    Priority:
    1. REST API (if api_key available) - returns FULL product data (name, description, price, images)
    2. MC GraphQL (fallback) - returns basic data only (ID/SKU)
    """
    async with pool.acquire() as conn:
        # Verify store ownership and get merchant_id + api_key
        store = await conn.fetchrow(
            "SELECT id, merchant_id, api_key, api_key_valid FROM kaspi_stores WHERE id = $1 AND user_id = $2",
            uuid.UUID(store_id),
            current_user['id']
        )

        if not store:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Store not found"
            )

    api_key = store.get('api_key')
    api_key_valid = store.get('api_key_valid', True)

    # PRIORITY 1: REST API (full product data)
    if api_key and api_key_valid:
        try:
            from ..services.kaspi_products_api import get_kaspi_products_api, KaspiTokenInvalidError, KaspiProductsAPIError

            products_api = get_kaspi_products_api()
            products = await products_api.fetch_products(api_token=api_key)

            # Sync to database with FULL data
            synced_count = await _sync_products_to_db(pool, store_id, products, source="rest_api")

            logger.info(f"Synced {synced_count} products via REST API for store {store_id}")

            return {
                "status": "completed",
                "message": "Product sync completed via REST API",
                "store_id": store_id,
                "products_count": synced_count,
                "source": "rest_api"
            }

        except KaspiTokenInvalidError:
            # Mark token invalid, fallback to GraphQL
            async with pool.acquire() as conn:
                await conn.execute(
                    "UPDATE kaspi_stores SET api_key_valid = FALSE WHERE id = $1",
                    uuid.UUID(store_id)
                )
            logger.warning(f"REST API token invalid for store {store_id}, falling back to GraphQL")

        except KaspiProductsAPIError as e:
            logger.error(f"Error syncing products via REST API for store {store_id}: {e}")

        except Exception as e:
            logger.error(f"Unexpected error syncing products via REST API for store {store_id}: {e}")

    # PRIORITY 2: MC GraphQL fallback (basic data only)
    background_tasks.add_task(
        _sync_store_products_task,
        store_id=store_id,
        merchant_id=store['merchant_id']
    )

    return {
        "status": "accepted",
        "message": "Product sync started in background (GraphQL fallback)",
        "store_id": store_id,
        "source": "graphql"
    }


@router.post("/stores/{store_id}/sync-images")
async def sync_store_images(
    store_id: str,
    current_user: Annotated[dict, require_feature("demping")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """Fetch and save product images for products missing image_url."""
    async with pool.acquire() as conn:
        store = await conn.fetchrow(
            "SELECT id FROM kaspi_stores WHERE id = $1 AND user_id = $2",
            uuid.UUID(store_id),
            current_user['id']
        )
        if not store:
            raise HTTPException(status_code=404, detail="Store not found")

        products = await conn.fetch(
            """SELECT id, external_kaspi_id FROM products
               WHERE store_id = $1 AND image_url IS NULL AND external_kaspi_id IS NOT NULL""",
            uuid.UUID(store_id)
        )

        updated = 0
        for product in products:
            try:
                image_url = await fetch_product_image_url(product['external_kaspi_id'])
                if image_url:
                    await conn.execute(
                        "UPDATE products SET image_url = $1, updated_at = NOW() WHERE id = $2",
                        image_url,
                        product['id']
                    )
                    updated += 1
                    logger.info(f"Image saved for product {product['id']}: {image_url}")
            except Exception as e:
                logger.warning(f"Failed to fetch image for product {product['id']}: {e}")

            # Rate limit delay
            await asyncio.sleep(0.5)

        return {"updated": updated, "total": len(products)}


@router.post("/stores/{store_id}/sync-prices", status_code=status.HTTP_202_ACCEPTED)
async def sync_store_prices(
    store_id: str,
    background_tasks: BackgroundTasks,
    current_user: Annotated[dict, require_feature("demping")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """Sync product prices from Kaspi Offers API into our DB"""
    async with pool.acquire() as conn:
        store = await conn.fetchrow(
            "SELECT id, merchant_id FROM kaspi_stores WHERE id = $1 AND user_id = $2",
            uuid.UUID(store_id),
            current_user['id']
        )

        if not store:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Store not found"
            )

        # Get products with external_kaspi_id
        products = await conn.fetch(
            """
            SELECT id, external_kaspi_id, price
            FROM products
            WHERE store_id = $1 AND external_kaspi_id IS NOT NULL
            """,
            uuid.UUID(store_id)
        )

    if not products:
        return {
            "status": "accepted",
            "message": "No products to sync prices for",
            "store_id": store_id
        }

    background_tasks.add_task(
        _sync_prices_task,
        products=[dict(p) for p in products],
        merchant_uid=store['merchant_id'],
        store_id=store_id
    )

    return {
        "status": "accepted",
        "message": f"Price sync started for {len(products)} products",
        "store_id": store_id
    }


async def _sync_prices_task(products: list, merchant_uid: str, store_id: str):
    """Background task: fetch current prices from Kaspi and update DB"""
    pool = await get_db_pool()
    updated = 0

    for product in products:
        try:
            offers_data = await parse_product_by_sku(
                product_id=str(product['external_kaspi_id'])
            )

            if not offers_data or 'offers' not in offers_data:
                continue

            # Find our offer by merchant_uid
            our_price = None
            for offer in offers_data['offers']:
                mid = offer.get('merchantId') or offer.get('merchant_id') or ''
                if str(mid) == str(merchant_uid):
                    our_price = offer.get('price')
                    break

            if our_price is not None and int(our_price) != product['price']:
                async with pool.acquire() as conn:
                    await conn.execute(
                        "UPDATE products SET price = $1, updated_at = NOW() WHERE id = $2",
                        int(our_price),
                        product['id']
                    )
                    updated += 1

        except Exception as e:
            logger.warning(f"Failed to sync price for product {product['id']}: {e}")
            continue

    logger.info(f"Price sync completed for store {store_id}: {updated}/{len(products)} updated")


@router.get("/products/{product_id}/price-history")
async def get_product_price_history(
    product_id: str,
    current_user: Annotated[dict, require_feature("demping")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)],
    limit: int = 50
):
    """Get price history for a product"""
    limit = clamp_page_size(limit, max_size=200)
    async with pool.acquire() as conn:
        # Verify ownership
        product = await conn.fetchrow(
            """
            SELECT p.id FROM products p
            JOIN kaspi_stores k ON k.id = p.store_id
            WHERE p.id = $1 AND k.user_id = $2
            """,
            uuid.UUID(product_id),
            current_user['id']
        )

        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Product not found"
            )

        # Get price history
        history = await conn.fetch(
            """
            SELECT id, product_id, old_price, new_price, competitor_price,
                   change_reason, created_at
            FROM price_history
            WHERE product_id = $1
            ORDER BY created_at DESC
            LIMIT $2
            """,
            uuid.UUID(product_id),
            limit
        )

        return {
            "history": [
                {
                    "id": str(h['id']),
                    "product_id": str(h['product_id']),
                    "old_price": h['old_price'],
                    "new_price": h['new_price'],
                    "competitor_price": h['competitor_price'],
                    "change_reason": h['change_reason'],
                    "created_at": h['created_at']
                }
                for h in history
            ]
        }


@router.patch("/products/{product_id}/price")
async def update_product_price(
    product_id: str,
    price_update: dict,
    current_user: Annotated[dict, require_feature("demping")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """Update product price (frontend compatibility endpoint)"""
    new_price = price_update.get('price')

    if new_price is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Price is required"
        )

    async with pool.acquire() as conn:
        # Verify ownership and get current price
        product = await conn.fetchrow(
            """
            SELECT p.*, k.user_id FROM products p
            JOIN kaspi_stores k ON k.id = p.store_id
            WHERE p.id = $1 AND k.user_id = $2
            """,
            uuid.UUID(product_id),
            current_user['id']
        )

        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Product not found"
            )

        old_price = product['price']

        # Update price
        updated = await conn.fetchrow(
            """
            UPDATE products
            SET price = $1, updated_at = NOW()
            WHERE id = $2
            RETURNING *
            """,
            new_price,
            uuid.UUID(product_id)
        )

        # Record price change
        await conn.execute(
            """
            INSERT INTO price_history (
                product_id, old_price, new_price, change_reason
            )
            VALUES ($1, $2, $3, 'manual')
            """,
            uuid.UUID(product_id),
            old_price,
            new_price
        )

        return ProductResponse(
            id=str(updated['id']),
            store_id=str(updated['store_id']),
            kaspi_product_id=updated['kaspi_product_id'],
            kaspi_sku=updated['kaspi_sku'],
            external_kaspi_id=updated['external_kaspi_id'],
            name=updated['name'],
            price=updated['price'],
            min_profit=updated['min_profit'],
            bot_active=updated['bot_active'],
            pre_order_days=updated.get('pre_order_days', 0) or 0,
            last_check_time=updated['last_check_time'],
            availabilities=updated['availabilities'],
            created_at=updated['created_at'],
            updated_at=updated['updated_at']
        )


# ============================================================================
# City-based Pricing Endpoints
# ============================================================================

from ..schemas.kaspi import (
    KASPI_CITIES,
    CityInfo,
    ProductCityPriceCreate,
    ProductCityPriceUpdate,
    ProductCityPriceResponse,
    ProductCityPricesRequest,
    ProductWithCityPrices,
    CityDempingResult,
    MultiCityDempingResult,
)


@router.get("/cities", response_model=List[CityInfo])
async def list_cities():
    """Get list of available Kaspi cities"""
    return [
        CityInfo(city_id=city_id, city_name=city_name)
        for city_id, city_name in KASPI_CITIES.items()
    ]


@router.get("/products/{product_id}/city-prices", response_model=List[ProductCityPriceResponse])
async def get_product_city_prices(
    product_id: str,
    current_user: Annotated[dict, require_feature("city_demping")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """Get all city prices for a product"""
    async with pool.acquire() as conn:
        # Verify ownership
        product = await conn.fetchrow(
            """
            SELECT p.id FROM products p
            JOIN kaspi_stores k ON k.id = p.store_id
            WHERE p.id = $1 AND k.user_id = $2
            """,
            uuid.UUID(product_id),
            current_user['id']
        )

        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Product not found"
            )

        # Get city prices
        city_prices = await conn.fetch(
            """
            SELECT * FROM product_city_prices
            WHERE product_id = $1
            ORDER BY city_name
            """,
            uuid.UUID(product_id)
        )

        return [
            ProductCityPriceResponse(
                id=str(cp['id']),
                product_id=str(cp['product_id']),
                city_id=cp['city_id'],
                city_name=cp['city_name'],
                price=cp['price'],
                min_price=cp['min_price'],
                max_price=cp['max_price'],
                bot_active=cp['bot_active'],
                last_check_time=cp['last_check_time'],
                competitor_price=cp['competitor_price'],
                our_position=cp['our_position'],
                created_at=cp['created_at'],
                updated_at=cp['updated_at']
            )
            for cp in city_prices
        ]


@router.post("/products/{product_id}/city-prices", response_model=List[ProductCityPriceResponse])
async def set_product_city_prices(
    product_id: str,
    request: ProductCityPricesRequest,
    current_user: Annotated[dict, require_feature("city_demping")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """Set city prices for a product. Can apply to all cities, specific ones, or auto from store points."""
    async with pool.acquire() as conn:
        # Verify ownership and get product + store_points
        product = await conn.fetchrow(
            """
            SELECT p.*, k.store_points, k.merchant_id FROM products p
            JOIN kaspi_stores k ON k.id = p.store_id
            WHERE p.id = $1 AND k.user_id = $2
            """,
            uuid.UUID(product_id),
            current_user['id']
        )

        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Product not found"
            )

        created_prices = []

        if request.auto_from_store_points:
            # Auto-init cities from store's PP→city mapping
            store_points = product.get('store_points') or {}
            if isinstance(store_points, str):
                store_points = json.loads(store_points)

            if not store_points:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Нет данных о складах. Переподключите магазин для обновления."
                )

            # Use per-city settings from request if provided, otherwise use product defaults
            city_overrides = {c.city_id: c for c in request.cities}

            for pp_key, sp_data in store_points.items():
                if not isinstance(sp_data, dict) or not sp_data.get("enabled", True):
                    continue
                city_id = sp_data.get("city_id")
                city_name = sp_data.get("city_name", "")
                if not city_id:
                    continue

                # Use override if provided, otherwise product defaults
                override = city_overrides.get(city_id)
                row = await conn.fetchrow(
                    """
                    INSERT INTO product_city_prices (
                        product_id, city_id, city_name, price, min_price, max_price, bot_active
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT (product_id, city_id)
                    DO UPDATE SET
                        city_name = $3,
                        price = $4,
                        min_price = $5,
                        max_price = $6,
                        bot_active = $7,
                        updated_at = NOW()
                    RETURNING *
                    """,
                    uuid.UUID(product_id),
                    city_id,
                    city_name,
                    override.price if override else product['price'],
                    override.min_price if override else product.get('min_price'),
                    override.max_price if override else product.get('max_price'),
                    override.bot_active if override else True,
                )
                created_prices.append(row)

        elif request.apply_to_all_cities:
            # Apply same settings to all cities
            # Use first city settings as template, or product defaults
            template = request.cities[0] if request.cities else ProductCityPriceCreate(
                city_id="",
                price=product['price'],
                min_price=product['min_price'],
                max_price=product['max_price'],
                bot_active=product['bot_active']
            )

            for city_id, city_name in KASPI_CITIES.items():
                row = await conn.fetchrow(
                    """
                    INSERT INTO product_city_prices (
                        product_id, city_id, city_name, price, min_price, max_price, bot_active
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT (product_id, city_id)
                    DO UPDATE SET
                        price = $4,
                        min_price = $5,
                        max_price = $6,
                        bot_active = $7,
                        updated_at = NOW()
                    RETURNING *
                    """,
                    uuid.UUID(product_id),
                    city_id,
                    city_name,
                    template.price,
                    template.min_price,
                    template.max_price,
                    template.bot_active
                )
                created_prices.append(row)
        else:
            # Apply specific city settings
            # Load store_points for city_name fallback
            store_points = product.get('store_points') or {}
            if isinstance(store_points, str):
                store_points = json.loads(store_points)
            # Build city_id → city_name map from store_points
            sp_city_names = {}
            for pp_key, sp_data in store_points.items():
                if isinstance(sp_data, dict) and sp_data.get("city_id"):
                    sp_city_names[sp_data["city_id"]] = sp_data.get("city_name", sp_data["city_id"])

            for city_price in request.cities:
                city_name = KASPI_CITIES.get(city_price.city_id) or sp_city_names.get(city_price.city_id)
                if not city_name:
                    city_name = city_price.city_id  # Last resort: use ID as name

                row = await conn.fetchrow(
                    """
                    INSERT INTO product_city_prices (
                        product_id, city_id, city_name, price, min_price, max_price, bot_active
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT (product_id, city_id)
                    DO UPDATE SET
                        price = $4,
                        min_price = $5,
                        max_price = $6,
                        bot_active = $7,
                        updated_at = NOW()
                    RETURNING *
                    """,
                    uuid.UUID(product_id),
                    city_price.city_id,
                    city_name,
                    city_price.price,
                    city_price.min_price,
                    city_price.max_price,
                    city_price.bot_active
                )
                created_prices.append(row)

        # Sync city prices to Kaspi pricefeed
        # Build city_prices dict from saved data (only active cities with prices)
        city_prices_for_sync = {}
        for cp in created_prices:
            if cp['bot_active'] and cp['price'] is not None:
                city_prices_for_sync[cp['city_id']] = cp['price']

        if city_prices_for_sync:
            try:
                merchant_id = product['merchant_id']
                session = await get_active_session_with_refresh(merchant_id)
                if session:
                    if request.run_demping:
                        # Run demping: fetch competitors and adjust prices before syncing
                        external_id = product['external_kaspi_id']
                        price_step = product['price_step_override'] or 1
                        excluded_ids = set()
                        excluded_ids.add(merchant_id)

                        for cp in created_prices:
                            if not cp['bot_active']:
                                continue
                            city_id = cp['city_id']
                            current_price = cp['price'] or product['price']
                            KASPI_MIN_PRICE = 10
                            min_price = max(cp['min_price'] or 0, KASPI_MIN_PRICE)

                            try:
                                product_data = await parse_product_by_sku(str(external_id), session, city_id=city_id)
                                if not product_data:
                                    continue

                                offers = product_data.get("offers", [])
                                min_competitor = None
                                our_pos = None
                                for i, offer in enumerate(offers):
                                    mid = offer.get("merchantId")
                                    op = offer.get("price")
                                    if mid == merchant_id:
                                        our_pos = i + 1
                                    elif mid not in excluded_ids and op is not None:
                                        if min_competitor is None or op < min_competitor:
                                            min_competitor = op

                                # Update competitor info
                                await conn.execute(
                                    "UPDATE product_city_prices SET our_position = $1, competitor_price = $2, last_check_time = NOW() WHERE product_id = $3 AND city_id = $4",
                                    our_pos, min_competitor, uuid.UUID(product_id), city_id
                                )

                                if min_competitor is not None:
                                    target = min_competitor - price_step
                                    if target < min_price:
                                        target = min_price
                                    max_p = cp['max_price']
                                    if max_p and target > max_p:
                                        target = max_p
                                    city_prices_for_sync[city_id] = int(target)
                                    if int(target) != int(current_price):
                                        await conn.execute(
                                            "UPDATE product_city_prices SET price = $1, updated_at = NOW() WHERE product_id = $2 AND city_id = $3",
                                            int(target), uuid.UUID(product_id), city_id
                                        )
                            except Exception as e:
                                logger.error(f"Demping error for city {city_id}: {e}")

                        logger.info(f"Demping completed for product {product_id}: {city_prices_for_sync}")

                    # Sync all city prices to Kaspi (both with and without demping)
                    sync_result = await sync_product(
                        product_id=product_id,
                        new_price=product['price'],
                        session=session,
                        city_prices=city_prices_for_sync,
                    )
                    if sync_result and sync_result.get("success"):
                        logger.info(f"City prices synced to Kaspi for product {product_id}: {city_prices_for_sync}")
                    else:
                        logger.warning(f"Failed to sync city prices to Kaspi for product {product_id}: {sync_result}")
            except Exception as e:
                logger.error(f"Error syncing city prices to Kaspi for product {product_id}: {e}")

        # Re-read updated prices if demping ran
        if request.run_demping and city_prices_for_sync:
            created_prices = await conn.fetch(
                "SELECT * FROM product_city_prices WHERE product_id = $1 ORDER BY city_name",
                uuid.UUID(product_id)
            )

        return [
            ProductCityPriceResponse(
                id=str(cp['id']),
                product_id=str(cp['product_id']),
                city_id=cp['city_id'],
                city_name=cp['city_name'],
                price=cp['price'],
                min_price=cp['min_price'],
                max_price=cp['max_price'],
                bot_active=cp['bot_active'],
                last_check_time=cp['last_check_time'],
                competitor_price=cp['competitor_price'],
                our_position=cp['our_position'],
                created_at=cp['created_at'],
                updated_at=cp['updated_at']
            )
            for cp in created_prices
        ]


@router.patch("/products/{product_id}/city-prices/{city_id}", response_model=ProductCityPriceResponse)
async def update_product_city_price(
    product_id: str,
    city_id: str,
    update_data: ProductCityPriceUpdate,
    current_user: Annotated[dict, require_feature("city_demping")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """Update city price settings for a product"""
    async with pool.acquire() as conn:
        # Verify ownership
        product = await conn.fetchrow(
            """
            SELECT p.id FROM products p
            JOIN kaspi_stores k ON k.id = p.store_id
            WHERE p.id = $1 AND k.user_id = $2
            """,
            uuid.UUID(product_id),
            current_user['id']
        )

        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Product not found"
            )

        # Build update query — only allow whitelisted fields
        update_dict = update_data.dict(exclude_unset=True)
        if not update_dict:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields to update"
            )

        set_clauses = []
        values = [uuid.UUID(product_id), city_id]
        param_num = 3

        for field, value in update_dict.items():
            if field not in CITY_PRICE_FIELDS:
                continue
            set_clauses.append(f"{field} = ${param_num}")
            values.append(value)
            param_num += 1

        if not set_clauses:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No valid fields to update"
            )

        updated = await conn.fetchrow(
            f"""
            UPDATE product_city_prices
            SET {', '.join(set_clauses)}, updated_at = NOW()
            WHERE product_id = $1 AND city_id = $2
            RETURNING *
            """,
            *values
        )

        if not updated:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"City price not found for city {city_id}"
            )

        return ProductCityPriceResponse(
            id=str(updated['id']),
            product_id=str(updated['product_id']),
            city_id=updated['city_id'],
            city_name=updated['city_name'],
            price=updated['price'],
            min_price=updated['min_price'],
            max_price=updated['max_price'],
            bot_active=updated['bot_active'],
            last_check_time=updated['last_check_time'],
            competitor_price=updated['competitor_price'],
            our_position=updated['our_position'],
            created_at=updated['created_at'],
            updated_at=updated['updated_at']
        )


@router.delete("/products/{product_id}/city-prices/{city_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product_city_price(
    product_id: str,
    city_id: str,
    current_user: Annotated[dict, require_feature("city_demping")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """Delete city price for a product"""
    async with pool.acquire() as conn:
        # Verify ownership
        product = await conn.fetchrow(
            """
            SELECT p.id FROM products p
            JOIN kaspi_stores k ON k.id = p.store_id
            WHERE p.id = $1 AND k.user_id = $2
            """,
            uuid.UUID(product_id),
            current_user['id']
        )

        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Product not found"
            )

        result = await conn.execute(
            """
            DELETE FROM product_city_prices
            WHERE product_id = $1 AND city_id = $2
            """,
            uuid.UUID(product_id),
            city_id
        )

        if result == "DELETE 0":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"City price not found for city {city_id}"
            )

    return None


class RunCityDempingRequest(BaseModel):
    city_ids: Optional[List[str]] = None


@router.post("/products/{product_id}/run-city-demping", response_model=MultiCityDempingResult)
async def run_product_city_demping(
    product_id: str,
    current_user: Annotated[dict, require_feature("city_demping")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)],
    request: RunCityDempingRequest = Body(default=RunCityDempingRequest())
):
    """
    Run demping for a product across multiple cities.
    If city_ids is not provided, runs for all configured city prices.
    """
    async with pool.acquire() as conn:
        # Get product with store info
        product = await conn.fetchrow(
            """
            SELECT
                p.*,
                ks.merchant_id,
                ks.guid,
                COALESCE(ds.price_step, 1) as store_price_step,
                COALESCE(ds.excluded_merchant_ids, '{}') as excluded_merchant_ids
            FROM products p
            JOIN kaspi_stores ks ON ks.id = p.store_id
            LEFT JOIN demping_settings ds ON ds.store_id = p.store_id
            WHERE p.id = $1 AND ks.user_id = $2
            """,
            uuid.UUID(product_id),
            current_user['id']
        )

        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Product not found"
            )

        # Get city prices to process
        city_ids = request.city_ids
        if city_ids:
            city_prices = await conn.fetch(
                """
                SELECT * FROM product_city_prices
                WHERE product_id = $1 AND city_id = ANY($2) AND bot_active = true
                """,
                uuid.UUID(product_id),
                city_ids
            )
        else:
            city_prices = await conn.fetch(
                """
                SELECT * FROM product_city_prices
                WHERE product_id = $1 AND bot_active = true
                """,
                uuid.UUID(product_id)
            )

        if not city_prices:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No active city prices configured for this product"
            )

        external_id = product['external_kaspi_id']
        merchant_id = product['merchant_id']
        price_step = product['price_step_override'] or product['store_price_step']
        
        # Get excluded merchant IDs
        excluded_merchant_ids = set(product['excluded_merchant_ids'] or [])
        excluded_merchant_ids.add(merchant_id)
        strategy = product['demping_strategy'] or 'standard'

        # Get session
        session = await get_active_session_with_refresh(merchant_id)
        if not session:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="No active session. Please re-authenticate."
            )

        results = []
        successful_updates = 0
        city_target_prices = {}  # {city_id: target_price} — for batched sync

        # Phase 1: Fetch competitor prices and calculate targets per city
        for city_price in city_prices:
            city_id = city_price['city_id']
            city_name = city_price['city_name']
            current_price = city_price['price'] or product['price']
            KASPI_MIN_PRICE = 10
            min_price = max(city_price['min_price'] or 0, KASPI_MIN_PRICE)
            max_price = city_price['max_price']

            try:
                product_data = await parse_product_by_sku(str(external_id), session, city_id=city_id)

                if not product_data:
                    # Still include current price to avoid overwriting by other cities
                    city_target_prices[city_id] = int(current_price)
                    results.append(CityDempingResult(
                        city_id=city_id, city_name=city_name,
                        status="no_data", message="Не удалось получить данные от Kaspi"
                    ))
                    continue

                offers = product_data.get("offers", [])
                if not offers:
                    city_target_prices[city_id] = int(current_price)
                    results.append(CityDempingResult(
                        city_id=city_id, city_name=city_name,
                        status="no_offers", message="Нет предложений"
                    ))
                    continue

                min_competitor_price = None
                our_position = None

                for i, offer in enumerate(offers):
                    offer_merchant_id = offer.get("merchantId")
                    offer_price = offer.get("price")
                    if offer_merchant_id == merchant_id:
                        our_position = i + 1
                    elif offer_merchant_id not in excluded_merchant_ids and offer_price is not None:
                        if min_competitor_price is None or offer_price < min_competitor_price:
                            min_competitor_price = offer_price

                # Update position/competitor info in DB
                await conn.execute(
                    """
                    UPDATE product_city_prices
                    SET our_position = $1, competitor_price = $2, last_check_time = NOW()
                    WHERE product_id = $3 AND city_id = $4
                    """,
                    our_position, min_competitor_price,
                    uuid.UUID(product_id), city_id
                )

                if min_competitor_price is None:
                    city_target_prices[city_id] = int(current_price)
                    results.append(CityDempingResult(
                        city_id=city_id, city_name=city_name,
                        status="no_competitors",
                        message="Вы единственный продавец (или все конкуренты исключены)",
                        our_position=our_position
                    ))
                    continue

                target_price = min_competitor_price - price_step

                if target_price < min_price:
                    if current_price > min_price:
                        # Competitor below our min — set price to our min (floor)
                        target_price = min_price
                    else:
                        # Already at or below min, keep current price to avoid overwriting
                        city_target_prices[city_id] = int(current_price)
                        results.append(CityDempingResult(
                            city_id=city_id, city_name=city_name,
                            status="waiting",
                            message=f"Конкурент ({min_competitor_price}) ниже минимума ({min_price})",
                            competitor_price=min_competitor_price, our_position=our_position
                        ))
                        continue

                if max_price and target_price > max_price:
                    target_price = max_price

                if target_price == current_price:
                    # No change needed but still include in cityprices to keep price stable
                    city_target_prices[city_id] = int(current_price)
                    results.append(CityDempingResult(
                        city_id=city_id, city_name=city_name,
                        status="no_change", message="Изменение не требуется",
                        old_price=current_price, competitor_price=min_competitor_price,
                        our_position=our_position
                    ))
                    continue

                # Mark for update
                city_target_prices[city_id] = int(target_price)
                results.append(CityDempingResult(
                    city_id=city_id, city_name=city_name,
                    status="pending_sync",
                    message=f"Цена: {current_price} → {target_price} ₸",
                    old_price=current_price, new_price=int(target_price),
                    competitor_price=min_competitor_price, our_position=our_position
                ))

            except Exception as e:
                logger.error(f"Error processing city {city_id}: {e}")
                results.append(CityDempingResult(
                    city_id=city_id, city_name=city_name,
                    status="error", message=str(e)
                ))

        # Phase 2: Single batched sync call with all city prices
        if city_target_prices:
            logger.info(f"Successfully synced product {product_id} with {len(city_target_prices)} city prices: {city_target_prices}")
            sync_result = await sync_product(
                product_id=str(product['id']),
                new_price=product['price'],  # fallback, not used when city_prices set
                session=session,
                city_prices=city_target_prices,
            )

            sync_ok = sync_result and sync_result.get("success")

            # Phase 3: Update DB and finalize results
            for i, r in enumerate(results):
                if r.status == "pending_sync":
                    city_id = r.city_id
                    if sync_ok:
                        # Update city price in DB
                        await conn.execute(
                            """
                            UPDATE product_city_prices
                            SET price = $1, updated_at = NOW()
                            WHERE product_id = $2 AND city_id = $3
                            """,
                            city_target_prices[city_id],
                            uuid.UUID(product_id), city_id
                        )
                        await conn.execute(
                            """
                            INSERT INTO price_history (
                                product_id, old_price, new_price, competitor_price, change_reason
                            ) VALUES ($1, $2, $3, $4, 'demper_city')
                            """,
                            uuid.UUID(product_id),
                            r.old_price, city_target_prices[city_id],
                            r.competitor_price
                        )
                        results[i] = CityDempingResult(
                            city_id=r.city_id, city_name=r.city_name,
                            status="success",
                            message=f"Цена обновлена: {r.old_price} → {city_target_prices[city_id]} ₸",
                            old_price=r.old_price, new_price=city_target_prices[city_id],
                            competitor_price=r.competitor_price, our_position=r.our_position
                        )
                        successful_updates += 1
                    else:
                        results[i] = CityDempingResult(
                            city_id=r.city_id, city_name=r.city_name,
                            status="sync_failed", message="Ошибка обновления в Kaspi"
                        )

        return MultiCityDempingResult(
            product_id=product_id,
            product_name=product['name'],
            results=results,
            total_cities=len(city_prices),
            successful_updates=successful_updates
        )


# ============================================================================
# Order Events - WhatsApp Integration
# ============================================================================

from ..services.kaspi_mc_service import get_kaspi_mc_service, KaspiMCError
from ..services.order_event_processor import (
    get_order_event_processor,
    OrderEvent,
    process_new_kaspi_order,
)


class OrderCustomerResponse(BaseModel):
    """Customer data from order"""
    phone: Optional[str]
    first_name: Optional[str]
    last_name: Optional[str]
    full_name: Optional[str]
    order_state: Optional[str]
    order_total: Optional[float]
    items: List[Dict[str, Any]] = []

    class Config:
        from_attributes = True


class OrderEventRequest(BaseModel):
    """Request to process order event"""
    store_id: str
    order_code: str
    event: str  # order_approved, order_shipped, etc.


class OrderEventResponse(BaseModel):
    """Result of processing order event"""
    status: str
    message_id: Optional[str] = None
    recipient: Optional[str] = None
    error: Optional[str] = None


@router.get("/orders/{store_id}/{order_code}/customer")
async def get_order_customer(
    store_id: str,
    order_code: str,
    current_user: Annotated[dict, require_feature("orders_view")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
) -> OrderCustomerResponse:
    """
    Получить данные покупателя по коду заказа.

    Приоритет:
    1. REST API (если есть api_key) - возвращает РЕАЛЬНЫЙ телефон через Base64 декодирование customer.id
    2. MC GraphQL (fallback) - возвращает маскированный телефон, требует активную сессию
    """
    # Verify store belongs to user and get api_key
    async with pool.acquire() as conn:
        store = await conn.fetchrow(
            "SELECT id, api_key, api_key_valid FROM kaspi_stores WHERE id = $1 AND user_id = $2",
            uuid.UUID(store_id), current_user['id']
        )
        if not store:
            raise HTTPException(status_code=404, detail="Store not found")

    api_key = store.get('api_key')
    api_key_valid = store.get('api_key_valid', True)
    customer_data = None

    # PRIORITY 1: REST API (real phone via Base64 decoding of customer.id)
    if api_key and api_key_valid:
        try:
            from ..services.kaspi_orders_api import get_kaspi_orders_api, KaspiTokenInvalidError

            orders_api = get_kaspi_orders_api()
            customer_data = await orders_api.get_customer_phone(
                api_token=api_key,
                order_code=order_code,
                pool=pool,
            )

            if customer_data:
                logger.info(f"Got customer phone via REST API for order {order_code}")

        except KaspiTokenInvalidError:
            # Token is invalid - mark it and fallback to GraphQL
            async with pool.acquire() as conn:
                await conn.execute(
                    "UPDATE kaspi_stores SET api_key_valid = FALSE WHERE id = $1",
                    uuid.UUID(store_id)
                )
            logger.warning(f"API token invalid for store {store_id}, falling back to GraphQL")

        except Exception as e:
            logger.error(f"Error getting phone via REST API: {e}")

    # PRIORITY 2: MC GraphQL (fallback - masked phone)
    if not customer_data:
        try:
            mc_service = get_kaspi_mc_service()
            customer_data = await mc_service.get_order_customer_phone(
                user_id=str(current_user['id']),
                store_id=store_id,
                order_code=order_code,
                pool=pool,
            )

            if customer_data:
                logger.info(f"Got customer phone via MC GraphQL for order {order_code} (phone may be masked)")

        except KaspiMCError as e:
            raise HTTPException(status_code=400, detail=str(e))

    if not customer_data:
        raise HTTPException(status_code=404, detail="Order not found")

    return OrderCustomerResponse(
        phone=customer_data.get('phone'),
        first_name=customer_data.get('first_name'),
        last_name=customer_data.get('last_name'),
        full_name=customer_data.get('full_name'),
        order_state=customer_data.get('order_state'),
        order_total=customer_data.get('order_total'),
        items=customer_data.get('items', []),
    )


@router.post("/orders/event")
async def process_order_event(
    request: OrderEventRequest,
    current_user: Annotated[dict, require_feature("orders_view")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
) -> OrderEventResponse:
    """
    Обработать событие заказа и отправить WhatsApp сообщение.

    Находит шаблон по trigger_event и отправляет сообщение покупателю.
    """
    # Verify store belongs to user
    async with pool.acquire() as conn:
        store = await conn.fetchrow(
            "SELECT id FROM kaspi_stores WHERE id = $1 AND user_id = $2",
            uuid.UUID(request.store_id), current_user['id']
        )
        if not store:
            raise HTTPException(status_code=404, detail="Store not found")

    # Validate event type
    try:
        event = OrderEvent(request.event)
    except ValueError:
        valid_events = [e.value for e in OrderEvent]
        raise HTTPException(
            status_code=400,
            detail=f"Invalid event type. Valid events: {', '.join(valid_events)}"
        )

    # Process the event
    processor = get_order_event_processor()
    result = await processor.process_order_event(
        user_id=str(current_user['id']),
        store_id=request.store_id,
        order_code=request.order_code,
        event=event,
        pool=pool,
    )

    if not result:
        return OrderEventResponse(status="no_action")

    return OrderEventResponse(
        status=result.get('status', 'unknown'),
        message_id=result.get('message_id'),
        recipient=result.get('recipient'),
        error=result.get('error'),
    )


@router.get("/orders/{store_id}/recent")
async def get_recent_orders(
    store_id: str,
    current_user: Annotated[dict, require_feature("orders_view")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)],
    limit: int = 50,
    state: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Получить список последних заказов магазина из Kaspi MC.

    Args:
        limit: Максимальное количество заказов (по умолчанию 50)
        state: Фильтр по статусу (APPROVED, DELIVERY, COMPLETED и т.д.)
    """
    # Verify store belongs to user
    async with pool.acquire() as conn:
        store = await conn.fetchrow(
            "SELECT id FROM kaspi_stores WHERE id = $1 AND user_id = $2",
            uuid.UUID(store_id), current_user['id']
        )
        if not store:
            raise HTTPException(status_code=404, detail="Store not found")

    try:
        mc_service = get_kaspi_mc_service()
        orders = await mc_service.get_recent_orders(
            user_id=str(current_user['id']),
            store_id=store_id,
            pool=pool,
            limit=limit,
            state_filter=state,
        )
        return orders

    except KaspiMCError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/orders/events/types")
async def get_order_event_types() -> List[Dict[str, str]]:
    """Получить список доступных типов событий для шаблонов WhatsApp"""
    return [
        {"value": OrderEvent.ORDER_APPROVED.value, "label": "Заказ оплачен", "kaspi_state": "APPROVED"},
        {"value": OrderEvent.ORDER_ACCEPTED_BY_MERCHANT.value, "label": "Заказ принят", "kaspi_state": "ACCEPTED_BY_MERCHANT"},
        {"value": OrderEvent.ORDER_SHIPPED.value, "label": "Заказ отправлен", "kaspi_state": "DELIVERY"},
        {"value": OrderEvent.ORDER_DELIVERED.value, "label": "Заказ доставлен", "kaspi_state": "DELIVERED"},
        {"value": OrderEvent.ORDER_COMPLETED.value, "label": "Заказ завершён", "kaspi_state": "COMPLETED"},
        {"value": OrderEvent.ORDER_CANCELLED.value, "label": "Заказ отменён", "kaspi_state": "CANCELLED"},
        {"value": OrderEvent.REVIEW_REQUEST.value, "label": "Запрос отзыва", "kaspi_state": None},
    ]


class OrdersPollingToggle(BaseModel):
    enabled: bool


class OrdersPollingStatus(BaseModel):
    store_id: str
    store_name: str
    orders_polling_enabled: bool
    last_orders_sync: Optional[datetime] = None


@router.get("/stores/{store_id}/orders-polling", response_model=OrdersPollingStatus)
async def get_orders_polling_status(
    store_id: str,
    current_user: Annotated[dict, require_feature("orders_view")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """Получить статус мониторинга заказов для магазина"""
    async with pool.acquire() as conn:
        store = await conn.fetchrow("""
            SELECT id, name, orders_polling_enabled, last_orders_sync
            FROM kaspi_stores
            WHERE id = $1 AND user_id = $2
        """, uuid.UUID(store_id), current_user['id'])

        if not store:
            raise HTTPException(status_code=404, detail="Store not found")

        return OrdersPollingStatus(
            store_id=str(store['id']),
            store_name=store['name'],
            orders_polling_enabled=store['orders_polling_enabled'] or False,
            last_orders_sync=store['last_orders_sync'],
        )


@router.patch("/stores/{store_id}/orders-polling", response_model=OrdersPollingStatus)
async def toggle_orders_polling(
    store_id: str,
    data: OrdersPollingToggle,
    current_user: Annotated[dict, require_feature("orders_view")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """Включить/выключить мониторинг заказов для магазина"""
    async with pool.acquire() as conn:
        store = await conn.fetchrow("""
            UPDATE kaspi_stores
            SET orders_polling_enabled = $1, updated_at = NOW()
            WHERE id = $2 AND user_id = $3
            RETURNING id, name, orders_polling_enabled, last_orders_sync
        """, data.enabled, uuid.UUID(store_id), current_user['id'])

        if not store:
            raise HTTPException(status_code=404, detail="Store not found")

        logger.info(f"Orders polling {'enabled' if data.enabled else 'disabled'} for store {store['name']}")

        return OrdersPollingStatus(
            store_id=str(store['id']),
            store_name=store['name'],
            orders_polling_enabled=store['orders_polling_enabled'],
            last_orders_sync=store['last_orders_sync'],
        )


@router.post("/products/{product_id}/test-preorder")
async def test_preorder(
    product_id: str,
    current_user: Annotated[dict, require_feature("demping")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """
    Test preOrder: send preOrder=7 via JSON pricefeed API, then check public offers API.
    Returns raw Kaspi responses for verification.
    Does NOT modify preorder_status in our database.
    """
    import asyncio as _asyncio

    async with pool.acquire() as conn:
        product = await conn.fetchrow(
            """
            SELECT p.id, p.name, p.price, p.external_kaspi_id,
                   p.pre_order_days, ks.merchant_id
            FROM products p
            JOIN kaspi_stores ks ON ks.id = p.store_id
            WHERE p.id = $1 AND ks.user_id = $2
            """,
            uuid.UUID(product_id),
            current_user['id']
        )

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    merchant_id = product['merchant_id']
    external_id = product['external_kaspi_id']

    # Step 1: Get session
    session = await get_active_session_with_refresh(merchant_id)
    if not session:
        return {"error": "No active session — reauth required", "step": "auth"}

    # Step 2: Send preOrder=7 via sync_product (JSON pricefeed API)
    sync_result = None
    try:
        sync_result = await sync_product(
            product_id=str(product['id']),
            new_price=product['price'],
            session=session,
            pre_order_days=7,  # Test with 7 days
        )
    except Exception as e:
        return {
            "error": f"sync_product failed: {e}",
            "step": "pricefeed",
            "product_name": product['name'],
        }

    # Step 3: Wait a bit, then check public offers API
    public_check = None
    if external_id:
        try:
            await _asyncio.sleep(5)  # Give Kaspi time to process
            public_data = await parse_product_by_sku(str(external_id))
            if public_data and isinstance(public_data, dict):
                offers = public_data.get("offers", [])
                for offer in offers:
                    if offer.get("merchantId") == merchant_id:
                        public_check = {
                            "our_offer_found": True,
                            "merchantId": offer.get("merchantId"),
                            "price": offer.get("price"),
                            "preOrder_direct": offer.get("preOrder"),
                            "availabilities": offer.get("availabilities"),
                            "pickupPoints": offer.get("pickupPoints"),
                            "delivery": offer.get("delivery"),
                        }
                        break
                if not public_check:
                    public_check = {
                        "our_offer_found": False,
                        "total_offers": len(offers),
                        "merchant_ids": [o.get("merchantId") for o in offers[:5]],
                    }
            else:
                public_check = {"error": "No data from public API"}
        except Exception as e:
            public_check = {"error": str(e)}

    return {
        "product_name": product['name'],
        "merchant_id": merchant_id,
        "step_1_pricefeed_sync": sync_result,
        "step_2_public_offers": public_check,
        "note": "Check step_1 'response' field and step_2 for preOrder data"
    }
