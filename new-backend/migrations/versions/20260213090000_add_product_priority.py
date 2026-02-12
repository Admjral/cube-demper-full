"""Add is_priority column to products table

Revision ID: 20260213090000
Revises: 20260212160000
Create Date: 2026-02-13

Priority products are checked every 3 minutes instead of the default interval.
Max 10 priority products per store.
"""
from alembic import op

# revision identifiers
revision = '20260213090000'
down_revision = '20260212160000'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE products ADD COLUMN IF NOT EXISTS is_priority BOOLEAN NOT NULL DEFAULT FALSE;
        CREATE INDEX IF NOT EXISTS idx_products_is_priority
        ON products(is_priority) WHERE is_priority = TRUE;
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_products_is_priority;")
    op.execute("ALTER TABLE products DROP COLUMN IF EXISTS is_priority;")
