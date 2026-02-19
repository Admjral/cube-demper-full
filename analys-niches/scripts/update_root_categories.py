"""
Update niche_categories.root_category from Kaspi category tree.

Fetches FULL category tree from Kaspi API (depth=10), recursively collects
ALL subcategory titles under each root, then updates DB.

Usage:
    python update_root_categories.py [--db-url DATABASE_URL]
"""

import asyncio
import sys
from typing import Dict, List

import httpx
import asyncpg

# Kaspi API config
BASE_URL = "https://kaspi.kz"
CITY_CODE = "710000000"  # Алматы

# Map English category code -> Russian name (same as on frontend)
CATEGORY_MAPPING = {
    "Smartphones and gadgets": "Телефоны и гаджеты",
    "Home equipment": "Бытовая техника",
    "TV_Audio": "ТВ, Аудио, Видео",
    "Computers": "Компьютеры",
    "Furniture": "Мебель",
    "Beauty care": "Красота и здоровье",
    "Child goods": "Детские товары",
    "Pharmacy": "Аптека",
    "Construction and repair": "Строительство, ремонт",
    "Sports and outdoors": "Спорт, туризм",
    "Leisure": "Досуг, книги",
    "Car goods": "Автотовары",
    "Jewelry and Bijouterie": "Украшения",
    "Fashion accessories": "Аксессуары",
    "Fashion": "Одежда",
    "Shoes": "Обувь",
    "Home": "Товары для дома и дачи",
    "Gifts and party supplies": "Подарки, товары для праздников",
    "Office and school supplies": "Канцелярские товары",
    "Pet goods": "Товары для животных",
    "Food": "Продукты питания",
}

HEADERS = {
    "Accept": "application/json, text/*",
    "Accept-Language": "ru-RU,ru;q=0.9",
    "Content-Type": "application/json; charset=UTF-8",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "x-ks-city": CITY_CODE,
    "Referer": "https://kaspi.kz/shop/",
}


def collect_all_titles(node: dict) -> List[str]:
    """Recursively collect ALL subcategory titles from a node."""
    titles = []
    title = node.get("title", "").replace("<br/>", " ").strip()
    if title:
        titles.append(title)
    for sub in (node.get("subNodes") or []):
        titles.extend(collect_all_titles(sub))
    return titles


async def fetch_category_tree() -> Dict[str, List[str]]:
    """
    Fetch FULL Kaspi category tree (depth=10) and return mapping:
    root_category_ru_name -> [ALL nested subcategory titles]
    """
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30.0) as client:
        response = await client.get(
            "/yml/main-navigation/n/n/desktop-menu",
            params={"depth": 10, "city": CITY_CODE, "rootType": "desktop"},
            headers=HEADERS,
        )

        if response.status_code != 200:
            print(f"Error fetching categories: {response.status_code}")
            return {}

        data = response.json()
        tree: Dict[str, List[str]] = {}

        for root_node in data.get("subNodes", []):
            root_code = root_node.get("code", "")

            # Map English code to Russian name
            root_name_ru = CATEGORY_MAPPING.get(root_code)
            if not root_name_ru:
                root_title_raw = root_node.get("title", "").replace("<br/>", " ").strip()
                root_name_ru = CATEGORY_MAPPING.get(root_title_raw, root_title_raw)

            # Recursively collect ALL titles from ALL levels under this root
            all_subcategories = []
            for sub_node in root_node.get("subNodes", []):
                all_subcategories.extend(collect_all_titles(sub_node))

            # Deduplicate
            all_subcategories = list(set(all_subcategories))

            if all_subcategories:
                tree[root_name_ru] = all_subcategories
                print(f"  {root_name_ru}: {len(all_subcategories)} total subcategories (all levels)")

        return tree


async def update_database(db_url: str, tree: Dict[str, List[str]]):
    """Update niche_categories.root_category based on tree mapping."""
    conn = await asyncpg.connect(db_url)

    try:
        total_updated = 0

        for root_name, subcategories in tree.items():
            for sub_name in subcategories:
                result = await conn.execute(
                    """
                    UPDATE niche_categories
                    SET root_category = $1
                    WHERE name = $2 AND (root_category IS NULL OR root_category != $1)
                    """,
                    root_name,
                    sub_name,
                )
                count = int(result.split()[-1])
                if count > 0:
                    total_updated += count

        print(f"\nUpdated {total_updated} categories with root_category")

        # Show stats
        stats = await conn.fetch(
            """
            SELECT root_category, COUNT(*) as cnt
            FROM niche_categories
            WHERE root_category IS NOT NULL
            GROUP BY root_category
            ORDER BY cnt DESC
            """
        )
        print("\nRoot category distribution:")
        for row in stats:
            print(f"  {row['root_category']}: {row['cnt']} subcategories")

        # Show unmatched
        unmatched = await conn.fetchval(
            "SELECT COUNT(*) FROM niche_categories WHERE root_category IS NULL"
        )
        total = await conn.fetchval("SELECT COUNT(*) FROM niche_categories")
        matched = total - unmatched
        print(f"\nMatched: {matched}/{total} ({matched*100//total}%)")
        print(f"Unmatched: {unmatched}")

        if unmatched > 0:
            # Show sample unmatched
            samples = await conn.fetch(
                "SELECT name FROM niche_categories WHERE root_category IS NULL ORDER BY name LIMIT 20"
            )
            print("\nSample unmatched categories:")
            for row in samples:
                print(f"  {row['name']}")

    finally:
        await conn.close()


async def main():
    db_url = "postgresql://postgres:postgres@localhost:5432/cubedemper"

    # Override from args
    if len(sys.argv) > 1 and sys.argv[1] == "--db-url":
        db_url = sys.argv[2]

    print("Fetching Kaspi category tree (depth=10, all levels)...")
    tree = await fetch_category_tree()

    if not tree:
        print("No categories fetched, aborting")
        return

    total_subs = sum(len(v) for v in tree.values())
    print(f"\nFetched {len(tree)} root categories with {total_subs} total subcategories")

    print(f"\nUpdating database: {db_url}")
    await update_database(db_url, tree)

    print("\nDone!")


if __name__ == "__main__":
    asyncio.run(main())
