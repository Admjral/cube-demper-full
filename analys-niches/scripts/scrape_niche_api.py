"""
Скрейпер данных аналитики ниш через HTTP API v3.0

API Endpoints:
- /api/v1/niche/categoryListStatistic - список категорий
- /api/v1/niche/product - товары в категории
- /api/v1/niche/sublingsCategory - подкатегории

v3.0:
- Token Bucket rate limiter — ровный поток N req/s (без всплесков)
- Все 21 категория параллельно, по 1 странице за раз через общий лимитер
- Adaptive: разгоняется при успехе, тормозит при 429/500
- Resume: checkpoint по страницам (CSV + JSON = финальный формат)
"""

import asyncio
import csv
import json
import os
import random
import time
from datetime import datetime, timedelta
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

BASE_URL = "https://app.algatop.kz"
AUTH_COOKIE = "s%3A35528_c2f96756-362e-48c5-8055-d7806956f862.F8MXLt3tIrhY5%2FeLQa6bmgtk4UH4NM8h5WwfFVTfT8M"

DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)

PROGRESS_FILE = DATA_DIR / "scrape_progress.json"
CHECKPOINT_CSV = DATA_DIR / "algatop_products.csv"
CHECKPOINT_JSON = DATA_DIR / "algatop_products.json"


class TokenBucketLimiter:
    """
    Token Bucket: ровный поток запросов.
    rate=15 → максимум 15 req/s, но распределённых равномерно.
    Все 21 корутин делят один лимитер — нет всплесков.
    """

    def __init__(self, rate: float = 15.0, max_rate: float = 25.0, min_rate: float = 2.0):
        self.rate = rate          # текущий req/s
        self.max_rate = max_rate  # потолок
        self.min_rate = min_rate  # пол
        self._interval = 1.0 / rate
        self._lock = asyncio.Lock()
        self._last_time = 0.0
        self.total_requests = 0
        self.total_errors = 0
        self._start_time = time.time()

    async def acquire(self):
        """Ждём своей очереди — пропускаем 1 запрос каждые 1/rate секунд"""
        async with self._lock:
            now = time.time()
            wait = self._last_time + self._interval - now
            if wait > 0:
                await asyncio.sleep(wait)
            self._last_time = time.time()
            self.total_requests += 1

    def speed_up(self):
        """Успех — плавно ускоряемся"""
        self.rate = min(self.max_rate, self.rate * 1.005)
        self._interval = 1.0 / self.rate

    def slow_down(self, factor: float = 0.5):
        """Ошибка — резко тормозим"""
        self.total_errors += 1
        self.rate = max(self.min_rate, self.rate * factor)
        self._interval = 1.0 / self.rate

    def stats(self) -> str:
        elapsed = time.time() - self._start_time
        actual_rps = self.total_requests / elapsed if elapsed > 0 else 0
        return f"{self.rate:.1f} req/s (actual {actual_rps:.1f}), reqs={self.total_requests}, errs={self.total_errors}"


class NicheDataAPI:
    def __init__(self):
        self.client = httpx.AsyncClient(
            base_url=BASE_URL,
            timeout=120.0,
            follow_redirects=True,
            cookies={"auth": AUTH_COOKIE},
            http2=True,
            limits=httpx.Limits(max_connections=60, max_keepalive_connections=30)
        )
        self.categories = []
        self._total_products = 0
        self.limiter = TokenBucketLimiter(rate=15.0, max_rate=25.0, min_rate=2.0)
        self._products_lock = asyncio.Lock()
        self._progress_lock = asyncio.Lock()
        self._progress = {}
        self._csv_lock = asyncio.Lock()
        self._client_lock = asyncio.Lock()
        self._load_progress()

    async def _recreate_client(self):
        """Пересоздать HTTP клиент после ConnectionTerminated"""
        async with self._client_lock:
            try:
                await self.client.aclose()
            except Exception:
                pass
            self.client = httpx.AsyncClient(
                base_url=BASE_URL,
                timeout=120.0,
                follow_redirects=True,
                cookies={"auth": AUTH_COOKIE},
                http2=True,
                limits=httpx.Limits(max_connections=60, max_keepalive_connections=30)
            )
            print("  🔄 HTTP client recreated (connection terminated by server)")

    def _load_progress(self):
        if PROGRESS_FILE.exists():
            with open(PROGRESS_FILE, 'r', encoding='utf-8') as f:
                self._progress = json.load(f)
            done = sum(1 for v in self._progress.values() if v == -1)
            print(f"📂 Загружен прогресс: {done}/{len(self._progress)} категорий готово")

    async def _save_progress(self):
        async with self._progress_lock:
            with open(PROGRESS_FILE, 'w', encoding='utf-8') as f:
                json.dump(self._progress, f, ensure_ascii=False)

    def _get_headers(self) -> dict:
        return {
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
            "Referer": "https://app.algatop.kz/niche",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36"
        }

    async def _request_with_retry(self, method: str, url: str, max_retries: int = 15, **kwargs) -> httpx.Response:
        for attempt in range(max_retries):
            await self.limiter.acquire()
            try:
                response = await self.client.request(method, url, **kwargs)

                if response.status_code == 200:
                    self.limiter.speed_up()
                    return response

                if response.status_code == 429:
                    retry_after = None
                    ra = response.headers.get("Retry-After")
                    if ra:
                        try:
                            retry_after = float(ra)
                        except ValueError:
                            pass
                    self.limiter.slow_down(0.3)
                    wait = retry_after if retry_after else max(3.0, 1.0 / self.limiter.rate * 10)
                    print(f"  ⏳ 429 (attempt {attempt+1}/{max_retries}), wait {wait:.1f}s [{self.limiter.stats()}]")
                    await asyncio.sleep(wait)
                    continue

                if response.status_code in (500, 502, 503, 504):
                    self.limiter.slow_down(0.6)
                    wait = min(60, 2 ** attempt) + random.uniform(0, 1)
                    print(f"  ⚠️ {response.status_code} (attempt {attempt+1}/{max_retries}), wait {wait:.1f}s [{self.limiter.stats()}]")
                    await asyncio.sleep(wait)
                    continue

                return response

            except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.ReadError,
                    httpx.ConnectError, httpx.RemoteProtocolError, httpx.CloseError) as e:
                self.limiter.slow_down(0.7)
                wait = min(60, 2 ** attempt) + random.uniform(0, 1)
                print(f"  ⚠️ {e.__class__.__name__} (attempt {attempt+1}/{max_retries}), wait {wait:.1f}s")
                if isinstance(e, (httpx.RemoteProtocolError, httpx.CloseError)):
                    await self._recreate_client()
                await asyncio.sleep(wait)

        return None  # None = все retry исчерпаны (отличаем от пустого ответа)

    async def get_categories(self, start_date: str = None, end_date: str = None) -> list:
        print("📂 Получение категорий...")
        if not start_date:
            end = datetime.now()
            start = end - timedelta(days=30)
            start_date = start.strftime("%Y%m%d")
            end_date = end.strftime("%Y%m%d")

        response = await self._request_with_retry(
            "GET", "/api/v1/niche/categoryListStatistic",
            params={"startDate": start_date, "endDate": end_date},
            headers=self._get_headers()
        )
        if response.status_code == 200:
            data = response.json()
            self.categories = data if isinstance(data, list) else data.get("data", data.get("categories", []))
            print(f"✅ Найдено {len(self.categories)} категорий")
            return self.categories
        print(f"❌ Ошибка: {response.status_code}")
        return []

    async def get_products(self, category_id: str, start_date: str, end_date: str, page: int = 1):
        """Возвращает dict с products или None при полном провале всех retry"""
        sort_json = json.dumps({
            "type": "revenue", "direction": "desc", "typeName": "По выручке"
        })
        params = {
            "startDate": start_date, "endDate": end_date,
            "page": page, "filter": "{}", "categoryId": category_id,
            "sort": sort_json, "categoryType": ""
        }
        response = await self._request_with_retry(
            "GET", "/api/v1/niche/product",
            params=params, headers=self._get_headers()
        )
        if response is None:
            return None  # Все retry исчерпаны — сигнал "ошибка, не конец данных"
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, dict) and data.get("success"):
                products_data = data.get("data", {})
                if isinstance(products_data, dict):
                    products = products_data.get("products", {})
                    if isinstance(products, dict):
                        return {"products": products.get("lines", []), "totalPages": products.get("totalPages", 1)}
            return data
        print(f"  ⚠️ Ошибка {response.status_code} для кат. {category_id} стр.{page}")
        return None  # Неожиданный статус — тоже ошибка

    # ── CSV append ──

    async def _append_products_to_csv(self, products: list):
        if not products:
            return
        async with self._csv_lock:
            file_exists = CHECKPOINT_CSV.exists() and CHECKPOINT_CSV.stat().st_size > 0
            all_keys = set()
            for p in products:
                all_keys.update(p.keys())
            new_headers = sorted(list(all_keys))

            if file_exists:
                with open(CHECKPOINT_CSV, 'r', encoding='utf-8') as f:
                    existing_headers = next(csv.reader(f), None) or []
                missing = [h for h in new_headers if h not in existing_headers]
                if missing:
                    merged = existing_headers + missing
                    self._rewrite_csv_with_new_headers(merged, products)
                    return
                headers = existing_headers
            else:
                headers = new_headers

            mode = 'a' if file_exists else 'w'
            with open(CHECKPOINT_CSV, mode, newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=headers, extrasaction='ignore')
                if not file_exists:
                    writer.writeheader()
                for p in products:
                    writer.writerow(p)

    def _rewrite_csv_with_new_headers(self, new_headers: list, new_products: list):
        old_rows = []
        if CHECKPOINT_CSV.exists():
            with open(CHECKPOINT_CSV, 'r', encoding='utf-8') as f:
                old_rows = list(csv.DictReader(f))
        with open(CHECKPOINT_CSV, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=new_headers, extrasaction='ignore')
            writer.writeheader()
            for row in old_rows:
                writer.writerow(row)
            for p in new_products:
                writer.writerow(p)

    async def _save_checkpoint_json(self):
        async with self._products_lock:
            data = {
                "scraped_at": datetime.now().isoformat(),
                "total_categories": len(self.categories),
                "total_products": self._total_products,
                "rate_limiter": self.limiter.stats(),
                "progress": self._progress,
                "categories": self.categories
            }
        with open(CHECKPOINT_JSON, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    # ── Скрейпинг одной категории ──

    async def _scrape_category(self, cat: dict, index: int, total: int, start_date: str, end_date: str):
        cat_id = str(cat.get("category_id", cat.get("id", cat.get("code"))))
        cat_name = cat.get("category_name", cat.get("name", f"Category_{cat_id}"))

        last_page = self._progress.get(cat_id, 0)
        if last_page == -1:
            return

        start_page = last_page + 1
        if start_page > 1:
            print(f"  [{index}/{total}] 🔄 {cat_name} — resume со стр. {start_page}")
        else:
            print(f"  [{index}/{total}] 📁 {cat_name} (ID: {cat_id})")

        category_count = 0
        page = start_page
        consecutive_failures = 0
        MAX_FAILURES = 20  # 20 провалов подряд → пауза 60с и снова

        try:
            while True:
                data = await self.get_products(cat_id, start_date, end_date, page)

                # data is None = все retry исчерпаны (ошибка сети/сервера)
                if data is None:
                    consecutive_failures += 1
                    print(f"    [{index}/{total}] {cat_name} стр.{page}: ❌ fail #{consecutive_failures}/{MAX_FAILURES}")
                    if consecutive_failures >= MAX_FAILURES:
                        print(f"    [{index}/{total}] {cat_name}: 💤 {MAX_FAILURES} провалов подряд, пауза 60с...")
                        await asyncio.sleep(60)
                        consecutive_failures = 0
                    continue  # НЕ break — пробуем ту же страницу снова

                products = data.get("products", [])

                # Пустой список НО запрос успешен (200) — реальный конец категории
                if not products:
                    break

                consecutive_failures = 0  # Сброс при успехе

                for p in products:
                    p["_category_id"] = cat_id
                    p["_category_name"] = cat_name

                category_count += len(products)
                self._progress[cat_id] = page
                await self._save_progress()
                await self._append_products_to_csv(products)

                if page % 10 == 0 or len(products) < 20:
                    print(f"    [{index}/{total}] {cat_name} стр.{page}: +{len(products)} (в кат: {category_count}) [{self.limiter.stats()}]")

                if len(products) < 20:
                    break
                page += 1

        except Exception as e:
            print(f"  [{index}/{total}] ❌ {cat_name} стр.{page}: непредвиденная ошибка: {e}")
            print(f"    Прогресс сохранён на стр.{self._progress.get(cat_id, 0)}, продолжит при перезапуске")
            return  # НЕ помечаем как -1, при перезапуске продолжит

        self._progress[cat_id] = -1
        await self._save_progress()

        async with self._products_lock:
            self._total_products += category_count

        print(f"  [{index}/{total}] ✅ {cat_name}: {category_count} товаров")

    # ── Главный метод ──

    async def scrape_all(self, max_categories: int = None):
        print("\n" + "="*60)
        print("ПОЛНЫЙ СКРЕЙПИНГ ALGATOP v3.0 (Token Bucket)")
        print(f"Rate: {self.limiter.stats()}")
        print("="*60)

        end = datetime.now()
        start = end - timedelta(days=30)
        start_date = start.strftime("%Y%m%d")
        end_date = end.strftime("%Y%m%d")
        print(f"📅 Период: {start_date} - {end_date}")

        categories = await self.get_categories(start_date, end_date)
        if not categories:
            return

        if max_categories:
            categories = categories[:max_categories]

        already_done = sum(
            1 for cat in categories
            if self._progress.get(str(cat.get("category_id", cat.get("id", cat.get("code"))))) == -1
        )
        print(f"📊 Категорий: {len(categories)}, готово: {already_done}, осталось: {len(categories) - already_done}")

        if CHECKPOINT_CSV.exists() and CHECKPOINT_CSV.stat().st_size > 0:
            with open(CHECKPOINT_CSV, 'r', encoding='utf-8') as f:
                existing_count = sum(1 for _ in f) - 1  # минус header
            self._total_products = max(0, existing_count)
            print(f"📂 Ранее собрано {self._total_products} товаров в CSV")

        start_time = time.time()

        tasks = [
            asyncio.create_task(self._scrape_category(cat, i, len(categories), start_date, end_date))
            for i, cat in enumerate(categories, 1)
        ]

        checkpoint_task = asyncio.create_task(self._periodic_json_checkpoint(interval=60))

        try:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for i, result in enumerate(results):
                if isinstance(result, Exception):
                    cat_name = categories[i].get("category_name", categories[i].get("name", "?"))
                    print(f"  ❌ Категория {cat_name} упала: {result}")
        finally:
            checkpoint_task.cancel()
            try:
                await checkpoint_task
            except asyncio.CancelledError:
                pass

        elapsed = time.time() - start_time
        self.categories = categories
        await self._save_checkpoint_json()

        # Считаем итого из CSV
        final_count = 0
        if CHECKPOINT_CSV.exists():
            with open(CHECKPOINT_CSV, 'r', encoding='utf-8') as f:
                final_count = sum(1 for _ in f) - 1

        not_done = [cat for cat in categories
                    if self._progress.get(str(cat.get("category_id", cat.get("id", cat.get("code"))))) != -1]

        print(f"\n" + "="*60)
        print(f"✅ СКРЕЙПИНГ ЗАВЕРШЁН за {elapsed:.0f}с ({elapsed/60:.1f} мин)")
        print(f"   Категорий: {len(categories)}")
        print(f"   Товаров в CSV: {final_count}")
        print(f"   {self.limiter.stats()}")
        print(f"   CSV: {CHECKPOINT_CSV}")
        if not_done:
            print(f"   ⚠️ Незавершённые категории ({len(not_done)}): {[c.get('category_name', '?') for c in not_done]}")
            print(f"   Перезапусти скрипт — они продолжатся")
        print("="*60)

        return final_count

    async def _periodic_json_checkpoint(self, interval: int = 60):
        while True:
            await asyncio.sleep(interval)
            await self._save_checkpoint_json()
            done = sum(1 for v in self._progress.values() if v == -1)
            csv_count = 0
            if CHECKPOINT_CSV.exists():
                with open(CHECKPOINT_CSV, 'r', encoding='utf-8') as f:
                    csv_count = sum(1 for _ in f) - 1
            print(f"  💾 checkpoint: {csv_count} товаров в CSV, {done}/{len(self._progress)} кат. [{self.limiter.stats()}]")

    async def close(self):
        await self.client.aclose()


async def main():
    print("=" * 60)
    print("ALGATOP API SCRAPER v3.0")
    print("  - All categories parallel")
    print("  - Token Bucket rate limiter (smooth flow)")
    print("  - Resume from checkpoint")
    print("=" * 60)

    if PROGRESS_FILE.exists():
        with open(PROGRESS_FILE, 'r', encoding='utf-8') as f:
            progress = json.load(f)
        done = sum(1 for v in progress.values() if v == -1)
        print(f"\n📂 Прогресс: {done}/{len(progress)} категорий готово")
        print(f"   Для сброса удали: {PROGRESS_FILE} и {CHECKPOINT_CSV}")

    api = NicheDataAPI()

    try:
        await api.scrape_all(max_categories=None)
        print(f"\n✅ Готово! Данные в:")
        print(f"   CSV: {CHECKPOINT_CSV}")
        print(f"   JSON: {CHECKPOINT_JSON}")

    except KeyboardInterrupt:
        print(f"\n\n⏸️  Прервано! Прогресс сохранён.")

    except Exception as e:
        print(f"❌ Ошибка: {e}")
        import traceback
        traceback.print_exc()

    finally:
        await api.close()


if __name__ == "__main__":
    asyncio.run(main())
