#!/usr/bin/env python3
"""Import AlgaTop products CSV into niche_categories + niche_products tables."""

import asyncio
import csv
import json
import os
import sys
from datetime import datetime

import asyncpg


DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:GzsAzuXUTunuMPNJEPHIdNwUeoUCSfvL@postgres:5432/cubedemper"
)

CSV_PATH = os.environ.get("CSV_PATH", "/app/scripts/algatop_products.csv")


async def main():
    print(f"[IMPORT] Connecting to DB...")
    pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=5)

    # Read CSV
    print(f"[IMPORT] Reading CSV: {CSV_PATH}")
    rows = []
    with open(CSV_PATH, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    print(f"[IMPORT] Read {len(rows)} rows")

    # Step 1: Collect unique categories (parent + subcategory)
    # CSV has: _category_id (parent), _category_name (parent), category_ext_id (sub), category_name (sub)
    parent_cats = {}  # kaspi_id -> name
    sub_cats = {}     # (parent_kaspi_id, sub_kaspi_id) -> sub_name
    for row in rows:
        pid = row["_category_id"]
        pname = row["_category_name"]
        sid = row["category_ext_id"]
        sname = row["category_name"]
        parent_cats[pid] = pname
        if sid and sname:
            sub_cats[(pid, sid)] = sname

    print(f"[IMPORT] Found {len(parent_cats)} parent categories, {len(sub_cats)} subcategories")

    async with pool.acquire() as conn:
        # Clear existing data
        print("[IMPORT] Clearing existing niche data...")
        await conn.execute("DELETE FROM niche_product_history")
        await conn.execute("DELETE FROM niche_products")
        await conn.execute("DELETE FROM niche_categories")

        # Step 2: Insert parent categories
        parent_id_map = {}  # kaspi_id -> uuid
        for kaspi_id, name in parent_cats.items():
            row = await conn.fetchrow(
                """
                INSERT INTO niche_categories (name, kaspi_category_id)
                VALUES ($1, $2)
                RETURNING id
                """,
                name, kaspi_id
            )
            parent_id_map[kaspi_id] = row["id"]

        print(f"[IMPORT] Inserted {len(parent_id_map)} parent categories")

        # Step 3: Insert subcategories
        # Use composite key (parent_kaspi_id:sub_kaspi_id) as kaspi_category_id
        # to avoid duplicates when different parents share sub IDs
        sub_id_map = {}  # (parent_kaspi_id, sub_kaspi_id) -> uuid
        for (pid, sid), sname in sub_cats.items():
            parent_uuid = parent_id_map[pid]
            composite_id = f"{pid}:{sid}"
            row = await conn.fetchrow(
                """
                INSERT INTO niche_categories (name, parent_id, kaspi_category_id)
                VALUES ($1, $2, $3)
                RETURNING id
                """,
                sname, parent_uuid, composite_id
            )
            sub_id_map[(pid, sid)] = row["id"]

        print(f"[IMPORT] Inserted {len(sub_id_map)} subcategories")

        # Step 4: Insert products in batches
        print("[IMPORT] Inserting products...")
        inserted = 0
        skipped = 0
        batch_size = 1000

        for i in range(0, len(rows), batch_size):
            batch = rows[i:i+batch_size]
            values_list = []

            for row in batch:
                pid = row["_category_id"]
                sid = row["category_ext_id"]

                # Get category UUID - prefer subcategory, fallback to parent
                category_uuid = sub_id_map.get((pid, sid)) or parent_id_map.get(pid)
                if not category_uuid:
                    skipped += 1
                    continue

                kaspi_product_id = row.get("product_code", "").strip()
                if not kaspi_product_id:
                    skipped += 1
                    continue

                name = row.get("product_name", "").strip()
                if not name:
                    skipped += 1
                    continue

                brand = row.get("brand_name", "").strip() or None

                # Price
                try:
                    price = int(float(row.get("sale_price", 0)))
                except (ValueError, TypeError):
                    price = 0

                # Reviews
                try:
                    reviews_count = int(row.get("review_qty", 0))
                except (ValueError, TypeError):
                    reviews_count = 0

                # Rating
                try:
                    rating = float(row.get("product_rate", 0))
                except (ValueError, TypeError):
                    rating = 0.0

                # Sellers
                try:
                    sellers_count = int(row.get("merchant_count", 0))
                except (ValueError, TypeError):
                    sellers_count = 0

                # Sales
                try:
                    estimated_sales = int(row.get("sale_qty", 0))
                except (ValueError, TypeError):
                    estimated_sales = 0

                # Revenue
                try:
                    estimated_revenue = int(float(row.get("sale_amount", 0)))
                except (ValueError, TypeError):
                    estimated_revenue = 0

                # Image URL - extract first medium image from JSON list
                image_url = None
                try:
                    images_raw = row.get("preview_image_list", "")
                    if images_raw:
                        images = json.loads(images_raw)
                        if images and isinstance(images, list) and len(images) > 0:
                            image_url = images[0].get("medium") or images[0].get("large") or images[0].get("small")
                except (json.JSONDecodeError, TypeError, IndexError):
                    pass

                # Kaspi URL
                kaspi_url = row.get("product_url", "").strip() or None

                values_list.append((
                    category_uuid, kaspi_product_id, name, brand,
                    price, reviews_count, rating, sellers_count,
                    estimated_sales, estimated_revenue, image_url, kaspi_url
                ))

            # Batch insert
            if values_list:
                await conn.executemany(
                    """
                    INSERT INTO niche_products (
                        category_id, kaspi_product_id, name, brand,
                        price, reviews_count, rating, sellers_count,
                        estimated_sales, estimated_revenue, image_url, kaspi_url
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                    ON CONFLICT (kaspi_product_id) DO UPDATE SET
                        name = EXCLUDED.name,
                        brand = EXCLUDED.brand,
                        price = EXCLUDED.price,
                        reviews_count = EXCLUDED.reviews_count,
                        rating = EXCLUDED.rating,
                        sellers_count = EXCLUDED.sellers_count,
                        estimated_sales = EXCLUDED.estimated_sales,
                        estimated_revenue = EXCLUDED.estimated_revenue,
                        image_url = EXCLUDED.image_url,
                        kaspi_url = EXCLUDED.kaspi_url,
                        updated_at = NOW()
                    """,
                    values_list
                )
                inserted += len(values_list)

            if (i + batch_size) % 10000 == 0 or i + batch_size >= len(rows):
                print(f"[IMPORT] Progress: {min(i + batch_size, len(rows))}/{len(rows)} ({inserted} inserted, {skipped} skipped)")

        print(f"[IMPORT] Total: {inserted} products inserted, {skipped} skipped")

        # Step 5: Update category aggregates
        print("[IMPORT] Updating category aggregates...")
        await conn.execute("""
            UPDATE niche_categories nc SET
                total_products = sub.cnt,
                total_sellers = sub.sellers,
                avg_price = sub.avg_p,
                total_revenue = sub.rev
            FROM (
                SELECT
                    category_id,
                    COUNT(*) as cnt,
                    COALESCE(AVG(sellers_count), 0)::int as sellers,
                    COALESCE(AVG(price), 0)::bigint as avg_p,
                    COALESCE(SUM(estimated_revenue), 0) as rev
                FROM niche_products
                GROUP BY category_id
            ) sub
            WHERE nc.id = sub.category_id
        """)

        # Also update parent categories with sum of subcategories
        await conn.execute("""
            UPDATE niche_categories pc SET
                total_products = sub.cnt,
                total_sellers = sub.sellers,
                avg_price = sub.avg_p,
                total_revenue = sub.rev
            FROM (
                SELECT
                    sc.parent_id,
                    SUM(sc.total_products) as cnt,
                    AVG(sc.total_sellers)::int as sellers,
                    AVG(sc.avg_price)::bigint as avg_p,
                    SUM(sc.total_revenue) as rev
                FROM niche_categories sc
                WHERE sc.parent_id IS NOT NULL
                GROUP BY sc.parent_id
            ) sub
            WHERE pc.id = sub.parent_id
        """)

        # Final counts
        total_cats = await conn.fetchval("SELECT COUNT(*) FROM niche_categories")
        total_prods = await conn.fetchval("SELECT COUNT(*) FROM niche_products")
        print(f"[IMPORT] Done! Categories: {total_cats}, Products: {total_prods}")

    await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
