"""Add delivery demping fields to products

Revision ID: 20260213100000
Revises: 20260212200000
Create Date: 2026-02-13

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '20260213100000'
down_revision: Union[str, None] = '20260212200000'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('products', sa.Column(
        'delivery_demping_enabled',
        sa.Boolean(),
        server_default='false',
        nullable=False,
        comment="When true, demping filters competitors by delivery speed"
    ))
    op.add_column('products', sa.Column(
        'delivery_filter',
        sa.VARCHAR(30),
        server_default='same_or_faster',
        nullable=False,
        comment="Delivery filter: same_or_faster / today_tomorrow / till_3_days / till_5_days"
    ))


def downgrade() -> None:
    op.drop_column('products', 'delivery_filter')
    op.drop_column('products', 'delivery_demping_enabled')
