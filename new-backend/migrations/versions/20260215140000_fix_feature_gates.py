"""fix feature gates: add missing features to plans, add missing addons, fix trial_days

Revision ID: 20260215140000
Revises: 20260215120000
Create Date: 2026-02-15 14:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20260215140000'
down_revision = '20260215120000'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # BUG-1: Add missing features to plans JSONB
    # Standard plan: add niche_search, city_demping
    op.execute("""
        UPDATE plans SET features = features || '["niche_search", "city_demping"]'::jsonb
        WHERE code = 'standard'
        AND NOT (features @> '"niche_search"'::jsonb)
    """)

    # Premium plan: add niche_search, city_demping, delivery_demping, priority_products
    op.execute("""
        UPDATE plans SET features = features || '["niche_search", "city_demping", "delivery_demping", "priority_products"]'::jsonb
        WHERE code = 'premium'
        AND NOT (features @> '"niche_search"'::jsonb)
    """)

    # BUG-2: Add missing addons
    op.execute("""
        INSERT INTO addons (code, name, description, price_tiyns, is_recurring, stackable, features, extra_limits)
        VALUES
            ('city_demping', 'Демпер по городам', 'Демпинг цен по городам', 1000000, true, false, '["city_demping"]'::jsonb, NULL),
            ('delivery_demping', 'Демпер по доставке', 'Демпинг цен по доставке', 1000000, true, false, '["delivery_demping"]'::jsonb, NULL)
        ON CONFLICT (code) DO NOTHING
    """)

    # BUG-6: Fix trial_days to 7 in DB (match actual behavior)
    op.execute("""
        UPDATE plans SET trial_days = 7 WHERE code = 'basic'
    """)


def downgrade() -> None:
    # Revert trial_days
    op.execute("UPDATE plans SET trial_days = 3 WHERE code = 'basic'")

    # Remove added addons
    op.execute("DELETE FROM addons WHERE code IN ('city_demping', 'delivery_demping')")

    # Remove added features from premium
    op.execute("""
        UPDATE plans SET features = features - 'niche_search' - 'city_demping' - 'delivery_demping' - 'priority_products'
        WHERE code = 'premium'
    """)

    # Remove added features from standard
    op.execute("""
        UPDATE plans SET features = features - 'niche_search' - 'city_demping'
        WHERE code = 'standard'
    """)
