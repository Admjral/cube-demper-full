"""add root_category column to niche_categories

Revision ID: 20260220120000
Revises: 20260219120000
Create Date: 2026-02-20 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20260220120000'
down_revision = '20260219120000'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('niche_categories', sa.Column('root_category', sa.String(100), nullable=True))
    op.create_index('ix_niche_categories_root_category', 'niche_categories', ['root_category'])


def downgrade() -> None:
    op.drop_index('ix_niche_categories_root_category', table_name='niche_categories')
    op.drop_column('niche_categories', 'root_category')
