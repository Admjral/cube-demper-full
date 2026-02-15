"""Add store_points JSONB to kaspi_stores for PP→city mapping

Revision ID: 20260212180000
Revises: 20260212160000
Create Date: 2026-02-12 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '20260212180000'
down_revision: Union[str, None] = '20260212160000'  # Fixed: was incorrectly pointing to 20260213090000
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('kaspi_stores', sa.Column(
        'store_points',
        postgresql.JSONB(astext_type=sa.Text()),
        server_default='{}',
        nullable=True,
        comment='PP→city mapping: {"PP1": {"city_id": "770000000", "city_name": "Астана"}, ...}'
    ))


def downgrade() -> None:
    op.drop_column('kaspi_stores', 'store_points')
