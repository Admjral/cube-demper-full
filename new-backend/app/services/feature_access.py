"""Feature access service for checking user permissions based on subscription and add-ons."""

from typing import Optional, Set, Tuple
from uuid import UUID
import asyncpg
import json
import logging

logger = logging.getLogger(__name__)


class FeatureAccessService:
    """Service for checking user access to features based on subscription and add-ons."""

    # Feature requirements mapping: which plans/addons provide which features
    FEATURE_REQUIREMENTS = {
        'analytics': {'plans': ['basic', 'standard', 'premium']},
        'demping': {'plans': ['basic', 'standard', 'premium']},
        'exclude_own_stores': {'plans': ['basic', 'standard', 'premium']},
        'invoice_glue': {'plans': ['basic', 'standard', 'premium']},
        'orders_view': {'plans': ['basic', 'standard', 'premium']},
        'unit_economics': {'plans': ['basic', 'standard', 'premium']},
        'ai_lawyer': {'plans': ['basic', 'standard', 'premium']},
        'priority_support': {'plans': ['basic', 'standard', 'premium']},
        'preorder': {'plans': ['standard', 'premium'], 'addons': ['preorder']},
        'whatsapp_auto': {'plans': ['standard', 'premium'], 'addons': ['whatsapp']},
        'whatsapp_bulk': {'plans': ['premium'], 'addons': ['whatsapp']},
        'ai_salesman': {'plans': [], 'addons': ['ai_salesman']},
        'niche_search': {'plans': ['standard', 'premium']},
        'city_demping': {'plans': ['standard', 'premium'], 'addons': ['city_demping']},
        'delivery_demping': {'plans': ['premium'], 'addons': ['delivery_demping']},
        'priority_products': {'plans': ['premium']},
    }

    # Plan names for upgrade messages
    PLAN_NAMES = {
        'free': 'Бесплатный',
        'basic': 'Базовый',
        'standard': 'Стандарт',
        'premium': 'Премиум',
    }

    # Add-on names for upgrade messages
    ADDON_NAMES = {
        'ai_salesman': 'ИИ продажник',
        'preorder': 'Предзаказ',
        'whatsapp': 'WhatsApp рассылка',
        'demping_100': 'Демпинг +100 товаров',
        'analytics_unlimited': 'Аналитика безлимит',
        'city_demping': 'Демпер по городам',
        'delivery_demping': 'Демпер по доставке',
    }

    async def get_user_features(self, pool: asyncpg.Pool, user_id: UUID) -> dict:
        """
        Get all features and limits for a user based on their subscription and add-ons.

        Returns:
            dict with keys:
            - plan_code: str | None
            - plan_name: str | None
            - features: list[str]
            - analytics_limit: int (-1 = unlimited)
            - demping_limit: int
            - has_active_subscription: bool
            - is_trial: bool
            - trial_ends_at: datetime | None
            - subscription_ends_at: datetime | None
        """
        async with pool.acquire() as conn:
            # Get ALL active subscriptions with plans (multi-store support)
            subscriptions = await conn.fetch("""
                SELECT s.*, p.code as plan_code, p.name as plan_name, p.features as plan_features,
                       p.analytics_limit as plan_analytics_limit,
                       p.demping_limit as plan_demping_limit,
                       p.price_tiyns as plan_price
                FROM subscriptions s
                LEFT JOIN plans p ON p.id = s.plan_id
                WHERE s.user_id = $1 AND s.status = 'active'
                AND s.current_period_end >= NOW()
                ORDER BY p.price_tiyns DESC NULLS LAST, s.created_at DESC
            """, user_id)

            # Get active add-ons
            addons = await conn.fetch("""
                SELECT ua.*, a.code as addon_code, a.features as addon_features,
                       a.extra_limits, ua.quantity
                FROM user_addons ua
                JOIN addons a ON a.id = ua.addon_id
                WHERE ua.user_id = $1 AND ua.status = 'active'
                AND (ua.expires_at IS NULL OR ua.expires_at >= NOW())
            """, user_id)

        # Compute effective features and limits (aggregate across ALL active subscriptions)
        features: Set[str] = set()
        analytics_limit = 0
        demping_limit = 0
        plan_code = None
        plan_name = None
        is_trial = False
        trial_ends_at = None
        subscription_ends_at = None

        for sub in subscriptions:
            # Use the most expensive plan as the "primary" (first in ORDER BY)
            if plan_code is None:
                plan_code = sub['plan_code']
                plan_name = sub['plan_name']

            # Aggregate features from all subscriptions
            raw_features = sub['plan_features']
            plan_features = json.loads(raw_features) if isinstance(raw_features, str) else (raw_features or [])
            features.update(plan_features)

            # Sum demping limits across all subscriptions
            sub_demping = sub['plan_demping_limit'] or sub.get('demping_limit', 0) or 0
            demping_limit += sub_demping

            # Analytics: -1 (unlimited) wins, otherwise sum
            sub_analytics = sub['plan_analytics_limit'] or sub.get('analytics_limit', 0) or 0
            if sub_analytics == -1:
                analytics_limit = -1
            elif analytics_limit != -1:
                analytics_limit += sub_analytics

            # Trial: true if any subscription is trial
            if sub['is_trial']:
                is_trial = True
                if sub['trial_ends_at'] and (trial_ends_at is None or sub['trial_ends_at'] > trial_ends_at):
                    trial_ends_at = sub['trial_ends_at']

            # Latest expiry across all subscriptions
            if sub['current_period_end'] and (subscription_ends_at is None or sub['current_period_end'] > subscription_ends_at):
                subscription_ends_at = sub['current_period_end']

        # Apply add-ons
        for addon in addons:
            raw_addon_features = addon['addon_features']
            addon_features = json.loads(raw_addon_features) if isinstance(raw_addon_features, str) else (raw_addon_features or [])
            features.update(addon_features)

            raw_extra = addon['extra_limits']
            extra_limits = json.loads(raw_extra) if isinstance(raw_extra, str) else (raw_extra or {})
            quantity = addon['quantity'] or 1

            if 'demping_limit' in extra_limits:
                demping_limit += extra_limits['demping_limit'] * quantity
            if 'analytics_limit' in extra_limits:
                if extra_limits['analytics_limit'] == -1:
                    analytics_limit = -1  # Unlimited
                elif analytics_limit != -1:
                    analytics_limit += extra_limits['analytics_limit'] * quantity

        return {
            'plan_code': plan_code,
            'plan_name': plan_name,
            'features': list(features),
            'analytics_limit': analytics_limit,  # -1 = unlimited
            'demping_limit': demping_limit,
            'has_active_subscription': len(subscriptions) > 0,
            'is_trial': is_trial,
            'trial_ends_at': trial_ends_at,
            'subscription_ends_at': subscription_ends_at,
        }

    async def check_feature_access(
        self,
        pool: asyncpg.Pool,
        user_id: UUID,
        feature: str
    ) -> Tuple[bool, Optional[str]]:
        """
        Check if user has access to a specific feature.

        Returns:
            Tuple of (has_access, upgrade_message)
            - has_access: True if user can use the feature
            - upgrade_message: Message for upgrading (None if has access)
        """
        user_features = await self.get_user_features(pool, user_id)

        if feature in user_features['features']:
            return True, None

        # Generate upgrade message
        requirements = self.FEATURE_REQUIREMENTS.get(feature, {})
        plans = requirements.get('plans', [])
        addons = requirements.get('addons', [])

        message_parts = []
        if plans:
            plan_list = ', '.join(self.PLAN_NAMES.get(p, p) for p in plans)
            message_parts.append(f"тарифе {plan_list}")
        if addons:
            addon_list = ', '.join(self.ADDON_NAMES.get(a, a) for a in addons)
            message_parts.append(f"доп. услуге «{addon_list}»")

        if message_parts:
            message = f"Доступно на {' либо '.join(message_parts)}"
        else:
            message = "Функция недоступна для вашего тарифа"

        return False, message

    async def check_limit(
        self,
        pool: asyncpg.Pool,
        user_id: UUID,
        limit_type: str,  # 'analytics' or 'demping'
        current_count: int
    ) -> Tuple[bool, int, Optional[str]]:
        """
        Check if user is within their limit.

        Args:
            limit_type: 'analytics' or 'demping'
            current_count: Current number of items user has

        Returns:
            Tuple of (within_limit, max_limit, upgrade_message)
            - within_limit: True if user can add more
            - max_limit: The maximum allowed (-1 = unlimited)
            - upgrade_message: Message for upgrading (None if within limit)
        """
        user_features = await self.get_user_features(pool, user_id)

        if limit_type == 'analytics':
            max_limit = user_features['analytics_limit']
        elif limit_type == 'demping':
            max_limit = user_features['demping_limit']
        else:
            return False, 0, "Неизвестный тип лимита"

        if max_limit == -1:  # Unlimited
            return True, -1, None

        if current_count < max_limit:
            return True, max_limit, None

        # Over limit
        if limit_type == 'demping':
            message = f"Лимит демпинга исчерпан ({current_count}/{max_limit}). Приобретите пакет «Демпинг +100 товаров» или повысьте тариф."
        else:
            message = f"Лимит аналитики исчерпан ({current_count}/{max_limit}). Приобретите «Аналитика безлимит» или повысьте тариф."

        return False, max_limit, message


# Singleton instance
feature_access_service = FeatureAccessService()


def get_feature_access_service() -> FeatureAccessService:
    """Get the singleton instance of FeatureAccessService."""
    return feature_access_service
