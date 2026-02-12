"""Add preorder_status and preorder_requested_at to products

Revision ID: 20260212200000
Revises: 20260212180000
Create Date: 2026-02-12 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '20260212200000'
down_revision: Union[str, None] = '20260212180000'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('products', sa.Column(
        'preorder_status',
        sa.VARCHAR(20),
        server_default='none',
        nullable=False,
        comment="Preorder status: none / pending / active"
    ))
    op.add_column('products', sa.Column(
        'preorder_requested_at',
        sa.DateTime(timezone=True),
        nullable=True,
        comment="When user requested preorder (for timeout tracking)"
    ))
    op.create_index(
        'idx_products_preorder_pending',
        'products',
        ['preorder_status'],
        postgresql_where=sa.text("preorder_status = 'pending'")
    )


def downgrade() -> None:
    op.drop_index('idx_products_preorder_pending', table_name='products')
    op.drop_column('products', 'preorder_requested_at')
    op.drop_column('products', 'preorder_status')
