"""Add order_conversations table for WhatsApp AI upsell context

Revision ID: 20260215120000
Revises: 20260213090000, 20260213100000
Create Date: 2026-02-15 12:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = '20260215120000'
down_revision = ('20260213090000', '20260213100000')  # Merge migration
branch_labels = None
depends_on = None


def upgrade():
    # Merge migration only - table already created manually
    # Table: order_conversations
    # Indexes: idx_order_conversations_phone, expires, status, order_id
    pass


def downgrade():
    # Cannot downgrade merge migration
    pass
