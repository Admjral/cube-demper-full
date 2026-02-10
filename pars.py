import asyncio
import aiohttp
from playwright.async_api import async_playwright
import json
from datetime import datetime

class KaspiPhoneParser:
    def __init__(self):
        self.session = None
        self.cookies = {}
        self.merchant_id = "30326683"  # Из твоего ответа
        
    async def login(self):
        """Авторизация в кабинете продавца"""
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context()
            page = await context.new_page()
            
            await page.goto("https://mc.shop.kaspi.kz")
            await page.fill("input[name='phoneNumber']", "ТВОЙ_НОМЕР")
            await page.click("button[type='submit']")
            await page.wait_for_load_state("networkidle")
            
            # Сохраняем cookies и localStorage
            self.cookies = await context.cookies()
            local_storage = await page.evaluate("() => Object.fromEntries(Object.entries(localStorage))")
            
            await browser.close()
    
    async def get_phone(self, order_code):
        """Получаем телефон по коду заказа"""
        url = "https://mc.shop.kaspi.kz/mc/facade/graphql?opName=getOrderDetails"
        
        body = {
            "query": """
            query getOrderDetails($orderCode: String!) {
                merchant(id: "%s") {
                    orderDetail(code: $orderCode) {
                        code
                        customer {
                            phoneNumber
                            firstName
                            lastName
                        }
                    }
                }
            }
            """ % self.merchant_id,
            "variables": {"orderCode": order_code}
        }
        
        headers = {
            "Content-Type": "application/json",
            **{c["name"]: c["value"] for c in self.cookies}
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=body, headers=headers) as resp:
                data = await resp.json()
                customer = data['data']['merchant']['orderDetail']['customer']
                return {
                    'phone': f"+7{customer['phoneNumber']}",
                    'name': f"{customer['firstName']} {customer['lastName']}"
                }

# Использование
async def main():
    parser = KaspiPhoneParser()
    await parser.login()
    
    # Получаем телефоны для всех заказов
    orders = ["790686780", "ДРУГОЙ_ЗАКАЗ"]  # Из твоего списка
    for order in orders:
        phone_data = await parser.get_phone(order)
        print(f"Заказ {order}: {phone_data['phone']} ({phone_data['name']})")
        
        # Сохраняем в Supabase
        # await save_to_supabase(order, phone_data)

asyncio.run(main())

# второй парсер
async def monitor_orders():
    """Опрос новых заказов каждые 30 сек"""
    parser = KaspiPhoneParser()
    await parser.login()
    
    last_orders = set()
    
    while True:
        # Получаем список заказов (другой GraphQL запрос)
        orders = await get_new_orders()  # Реализуй аналогично
        new_orders = orders - last_orders
        
        for order_code in new_orders:
            phone_data = await parser.get_phone(order_code)
            print(f"НОВЫЙ ЗАКАЗ {order_code}: {phone_data}")
            # Отправка SMS/звонок/Supabase
            
        last_orders = orders
        await asyncio.sleep(30)  # Избегаем 526 ошибки
