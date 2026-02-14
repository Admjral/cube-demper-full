"""Security utility functions for input sanitization."""


def escape_like(value: str) -> str:
    """Escape special characters in LIKE/ILIKE patterns to prevent pattern injection.

    PostgreSQL LIKE treats % and _ as wildcards. User input must be escaped
    so these characters are matched literally.
    """
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def clamp_page_size(page_size: int, max_size: int = 100) -> int:
    """Clamp page_size to a safe maximum to prevent excessive data retrieval."""
    if page_size < 1:
        return 1
    return min(page_size, max_size)


# Whitelist of fields allowed in dynamic UPDATE queries per entity
DEMPING_SETTINGS_FIELDS = frozenset({
    "min_profit", "bot_active", "price_step", "min_margin_percent",
    "check_interval_minutes", "work_hours_start", "work_hours_end",
    "is_enabled", "excluded_merchant_ids",
})

CITY_PRICE_FIELDS = frozenset({
    "price", "min_price", "max_price", "bot_active",
})

SITE_SETTINGS_ALLOWED_KEYS = frozenset({
    "referral_commission_percent", "maintenance_mode", "announcement",
    "default_trial_days", "support_whatsapp_number",
})
