"""multi store support: max_stores, multi_store_discount on users; store_id, discount_percent on subscriptions

Revision ID: 20260217100000
Revises: 20260215140000
Create Date: 2026-02-17 10:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20260217100000'
down_revision = '20260215140000'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Users: multi-store settings (admin-controlled)
    op.add_column('users', sa.Column('max_stores', sa.Integer(), nullable=False, server_default='1'))
    op.add_column('users', sa.Column('multi_store_discount', sa.Integer(), nullable=False, server_default='0'))

    # Subscriptions: link to specific store + discount tracking
    op.add_column('subscriptions', sa.Column('store_id', postgresql.UUID(), nullable=True))
    op.add_column('subscriptions', sa.Column('discount_percent', sa.Integer(), nullable=False, server_default='0'))

    op.create_foreign_key(
        'fk_subscriptions_store_id',
        'subscriptions', 'kaspi_stores',
        ['store_id'], ['id'],
        ondelete='SET NULL'
    )
    op.create_index('idx_subscriptions_store_id', 'subscriptions', ['store_id'])


def downgrade() -> None:
    op.drop_index('idx_subscriptions_store_id', table_name='subscriptions')
    op.drop_constraint('fk_subscriptions_store_id', 'subscriptions', type_='foreignkey')
    op.drop_column('subscriptions', 'discount_percent')
    op.drop_column('subscriptions', 'store_id')
    op.drop_column('users', 'multi_store_discount')
    op.drop_column('users', 'max_stores')
