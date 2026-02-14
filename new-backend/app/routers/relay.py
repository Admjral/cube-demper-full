"""
Relay endpoints — used by VPS backend to proxy requests through Railway
to bypass Kaspi IP blocks on datacenter IPs.
"""
import re
import hmac
import httpx
import logging
from urllib.parse import urlparse
from fastapi import APIRouter, HTTPException, Header, status
from pydantic import BaseModel
from typing import Optional

from ..config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

# Allowed hostnames for relay (prevents SSRF)
_ALLOWED_RELAY_HOSTS = {"kaspi.kz", "www.kaspi.kz"}


def _validate_relay_secret(authorization: str) -> None:
    """Constant-time comparison of relay authorization secret."""
    if not settings.offers_relay_secret:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Relay not configured")
    expected = f"Bearer {settings.offers_relay_secret}"
    if not hmac.compare_digest(authorization, expected):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid relay secret")


def _validate_kaspi_url(url: str) -> str:
    """Validate that URL points to kaspi.kz and uses HTTPS. Returns sanitized URL."""
    try:
        parsed = urlparse(url)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid URL")

    if parsed.scheme not in ("https", "http"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only HTTP(S) URLs allowed")

    hostname = (parsed.hostname or "").lower()
    if hostname not in _ALLOWED_RELAY_HOSTS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only kaspi.kz URLs allowed"
        )

    # Force HTTPS
    if parsed.scheme == "http":
        url = "https" + url[4:]

    return url


class RelayParseUrlRequest(BaseModel):
    url: str


class RelayParseUrlResponse(BaseModel):
    html: str
    status_code: int


@router.post("/parse-url", response_model=RelayParseUrlResponse)
async def relay_parse_url(
    request: RelayParseUrlRequest,
    authorization: str = Header(...),
):
    """
    Relay endpoint: fetch a Kaspi URL and return the HTML.
    Used by VPS backend for unit economics parsing.
    Protected by shared secret.
    """
    _validate_relay_secret(authorization)
    validated_url = _validate_kaspi_url(request.url)

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
            }
            response = await client.get(validated_url, headers=headers, follow_redirects=True)
            return RelayParseUrlResponse(html=response.text, status_code=response.status_code)
    except httpx.TimeoutException:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Upstream timeout")
    except Exception as e:
        logger.error(f"Relay parse-url error: {e}")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Upstream request failed")


class RelayOffersRequest(BaseModel):
    product_id: str
    city_id: str


@router.post("/offers")
async def relay_offers(
    request: RelayOffersRequest,
    authorization: str = Header(...),
):
    """
    Relay endpoint: fetch Kaspi offers for a product.
    Used by VPS backend for demper worker.
    """
    _validate_relay_secret(authorization)

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            url = f"https://kaspi.kz/yml/offer-view/offers/{request.product_id}"
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                "Accept": "application/json",
                "Accept-Language": "ru-RU,ru;q=0.9",
                "X-KS-City": request.city_id,
            }
            response = await client.get(url, headers=headers)

            if response.status_code == 403:
                raise HTTPException(status_code=403, detail="Kaspi returned 403 (IP ban)")

            response.raise_for_status()
            return response.json()
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Upstream timeout")
    except Exception as e:
        logger.error(f"Relay offers error: {e}")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Upstream request failed")
