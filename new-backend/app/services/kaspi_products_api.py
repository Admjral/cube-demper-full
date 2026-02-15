"""
Kaspi Products REST API — сервис для получения полных данных о товарах через X-Auth-Token.

Отличия от MC GraphQL:
- Возвращает ПОЛНЫЕ данные товаров (name, description, price, images)
- Авторизация через X-Auth-Token (не session cookies)
- Geo-restricted: работает только с казахстанских IP
- Формат JSON:API
"""
import logging
from typing import Optional, Dict, Any, List

import httpx

from ..config import settings
from ..core.rate_limiter import get_orders_rate_limiter

logger = logging.getLogger(__name__)


class KaspiTokenInvalidError(Exception):
    """API token is invalid or expired (401/403)"""
    pass


class KaspiProductsAPIError(Exception):
    """Generic Kaspi Products API error"""
    pass


class KaspiProductsAPI:
    """REST API для работы с товарами через X-Auth-Token"""

    BASE_URL = "https://kaspi.kz/shop/api/v2"
    TIMEOUT = 30.0

    def _get_headers(self, api_token: str) -> dict:
        return {
            "X-Auth-Token": api_token,
            "Content-Type": "application/vnd.api+json",
            "Accept": "application/vnd.api+json",
            "User-Agent": "Mozilla/5.0",
        }

    def _get_client_kwargs(self) -> dict:
        kwargs: dict = {"timeout": self.TIMEOUT}
        proxy = getattr(settings, 'kaspi_api_proxy', None)
        if proxy:
            kwargs["proxy"] = proxy
        return kwargs

    async def fetch_products(
        self,
        api_token: str,
        page: int = 0,
        size: int = 100,
    ) -> List[dict]:
        """
        Fetch merchant products from Kaspi REST API.

        Endpoint: GET /shop/api/v2/products

        Args:
            api_token: X-Auth-Token from Kaspi MC settings
            page: Page number (0-based)
            size: Page size (max 100)

        Returns:
            List of products with FULL data:
            - id, code, name, price, description
            - images, attributes, etc.

        Raises:
            KaspiTokenInvalidError: If token is invalid/expired
            KaspiProductsAPIError: If API call fails
        """
        headers = self._get_headers(api_token)
        params = {
            "page[number]": page,
            "page[size]": size,
        }

        all_products = []
        max_pages = 100

        try:
            async with httpx.AsyncClient(**self._get_client_kwargs()) as client:
                while page < max_pages:
                    params["page[number]"] = page

                    # Rate limiting: 6 RPS (same as orders API)
                    await get_orders_rate_limiter().acquire()

                    response = await client.get(
                        f"{self.BASE_URL}/products",
                        headers=headers,
                        params=params,
                    )

                    if response.status_code in (401, 403):
                        raise KaspiTokenInvalidError(
                            f"API token invalid or expired (HTTP {response.status_code})"
                        )

                    if response.status_code != 200:
                        error_body = response.text[:500] if response.text else "No response body"
                        logger.warning(
                            f"Kaspi Products API error: {response.status_code}, body: {error_body}"
                        )
                        raise KaspiProductsAPIError(f"HTTP {response.status_code}")

                    data = response.json()
                    products = data.get("data", [])

                    if not products:
                        break

                    all_products.extend(products)

                    # Check pagination
                    total_pages = data.get("meta", {}).get("totalPages", 1)
                    page += 1
                    if page >= total_pages:
                        break

        except httpx.TimeoutException:
            logger.warning("Kaspi Products API timeout (likely geo-restricted, need KZ IP)")
            raise KaspiProductsAPIError("Request timeout — API may be geo-restricted to KZ")
        except httpx.RequestError as e:
            logger.error(f"Kaspi Products API network error: {e}")
            raise KaspiProductsAPIError(f"Network error: {e}")

        logger.info(f"Fetched {len(all_products)} products via REST API")
        return all_products

    async def fetch_product_detail(
        self,
        api_token: str,
        product_id: str,
    ) -> Optional[dict]:
        """
        Fetch single product detail from Kaspi REST API.

        Args:
            api_token: X-Auth-Token
            product_id: Kaspi product ID (from JSON:API 'id' field)

        Returns:
            Product data dict with full attributes or None

        Raises:
            KaspiTokenInvalidError: If token is invalid/expired
        """
        headers = self._get_headers(api_token)
        url = f"{self.BASE_URL}/products/{product_id}"

        try:
            async with httpx.AsyncClient(**self._get_client_kwargs()) as client:
                response = await client.get(url, headers=headers)

                if response.status_code in (401, 403):
                    raise KaspiTokenInvalidError(
                        f"API token invalid or expired (HTTP {response.status_code})"
                    )

                if response.status_code == 404:
                    return None

                if response.status_code != 200:
                    logger.warning(f"Kaspi REST API error for product {product_id}: {response.status_code}")
                    return None

                data = response.json()
                return data.get("data")

        except httpx.TimeoutException:
            logger.warning(f"Timeout fetching product {product_id} (geo-restricted?)")
            return None
        except httpx.RequestError as e:
            logger.error(f"Network error fetching product {product_id}: {e}")
            return None


# Singleton
_kaspi_products_api: Optional[KaspiProductsAPI] = None


def get_kaspi_products_api() -> KaspiProductsAPI:
    global _kaspi_products_api
    if _kaspi_products_api is None:
        _kaspi_products_api = KaspiProductsAPI()
    return _kaspi_products_api
