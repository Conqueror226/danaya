"""Add composite status indexes on records and transfers

Revision ID: b3f9e1c8d042
Revises: 26ace2d4a138
Create Date: 2026-10-13

These indexes cover the most common dashboard query pattern:
    WHERE facility_id = :fid AND status = 'pending'

Without them the query is a full table scan that degrades as the pilot accumulates data.
"""
from alembic import op

revision = 'b3f9e1c8d042'
down_revision = '26ace2d4a138'
branch_labels = None
depends_on = None


def upgrade():
    # Composite index: (facility_id, status) on records
    op.create_index("ix_records_facility_status", "records", ["facility_id", "status"])
    # Plain status index on records (for cross-facility admin queries)
    op.create_index("ix_records_status", "records", ["status"])
    # Transfer indexes: pending items visible to source and destination
    op.create_index("ix_transfers_facility_status", "transfers", ["source_id", "status"])
    op.create_index("ix_transfers_dest_status", "transfers", ["destination_id", "status"])
    op.create_index("ix_transfers_status", "transfers", ["status"])


def downgrade():
    op.drop_index("ix_records_facility_status", table_name="records")
    op.drop_index("ix_records_status", table_name="records")
    op.drop_index("ix_transfers_facility_status", table_name="transfers")
    op.drop_index("ix_transfers_dest_status", table_name="transfers")
    op.drop_index("ix_transfers_status", table_name="transfers")
