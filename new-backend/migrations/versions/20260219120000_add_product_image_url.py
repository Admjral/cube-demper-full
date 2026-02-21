"""add image_url column to products table

Revision ID: 20260219120000
Revises: 20260217100000
Create Date: 2026-02-19 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20260219120000'
down_revision = '20260217100000'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('products', sa.Column('image_url', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('products', 'image_url')
