// Универсальный скрипт для извлечения телефона из заказа Kaspi
// Использование: вставьте в консоль браузера на странице kaspi.kz

(async function getOrderPhone() {
    // Настройки (можно изменить)
    const DEFAULT_TOKEN = 'eIBxz0nEtYtBrZU/lH6KYJLVh21C7rtKFGNkd2hBAy8=';
    const DAYS_BACK = 30; // Искать заказы за последние N дней

    // Получаем код заказа
    let orderCode = prompt('Введите код заказа:');
    if (!orderCode) {
        console.error('❌ Код заказа не указан');
        return;
    }
    orderCode = orderCode.trim();

    // Получаем токен
    let authToken = localStorage.getItem('kaspi_auth_token') ||
                    sessionStorage.getItem('kaspi_auth_token');

    if (!authToken) {
        authToken = prompt('Введите X-Auth-Token:', DEFAULT_TOKEN);
        if (!authToken) {
            console.error('❌ Токен не указан');
            return;
        }
    }

    console.log(`🔍 Ищем заказ ${orderCode}...`);

    try {
        // Шаг 1: Получаем список заказов
        const now = Date.now();
        const dateFrom = now - (DAYS_BACK * 24 * 60 * 60 * 1000);

        const params = new URLSearchParams({
            'page[number]': '0',
            'page[size]': '100',
            'filter[orders][creationDate][$ge]': dateFrom.toString(),
            'filter[orders][creationDate][$le]': now.toString(),
            'filter[orders][state]': 'APPROVED,ACCEPTED_BY_MERCHANT,PICKUP,DELIVERY,DELIVERED,COMPLETED,NEW,KASPI_DELIVERY,ARCHIVE,CANCELLING,CANCELLED'
        });

        const headers = {
            'X-Auth-Token': authToken,
            'Content-Type': 'application/vnd.api+json',
            'Accept': 'application/vnd.api+json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        };

        let allOrders = [];
        let page = 0;
        let hasMore = true;

        // Пагинация (может быть несколько страниц)
        while (hasMore && page < 10) {
            params.set('page[number]', page.toString());

            const listResponse = await fetch(
                `https://kaspi.kz/shop/api/v2/orders?${params}`,
                { headers }
            );

            if (!listResponse.ok) {
                console.error(`❌ Ошибка API: ${listResponse.status}`);
                if (listResponse.status === 401 || listResponse.status === 403) {
                    console.log('💡 Токен недействителен. Получите новый:');
                    console.log('   1. F12 → Network');
                    console.log('   2. Обновите страницу');
                    console.log('   3. Найдите запрос к kaspi.kz/shop/api');
                    console.log('   4. Headers → Request Headers → X-Auth-Token');
                }
                return;
            }

            const data = await listResponse.json();
            const orders = data.data || [];

            if (orders.length === 0) {
                hasMore = false;
                break;
            }

            allOrders = allOrders.concat(orders);

            // Проверяем, есть ли ещё страницы
            const totalPages = data.meta?.totalPages || 1;
            page++;
            if (page >= totalPages) {
                hasMore = false;
            }
        }

        console.log(`📦 Всего найдено ${allOrders.length} заказов`);

        // Находим нужный заказ
        const order = allOrders.find(o => o.attributes?.code === orderCode);

        if (!order) {
            console.error(`❌ Заказ ${orderCode} не найден`);
            console.log(`💡 Проверьте код заказа или увеличьте DAYS_BACK (сейчас ${DAYS_BACK} дней)`);

            // Показываем похожие коды (если есть)
            const similar = allOrders
                .filter(o => o.attributes?.code?.includes(orderCode.slice(0, 4)))
                .map(o => o.attributes.code)
                .slice(0, 5);

            if (similar.length > 0) {
                console.log('🔍 Похожие коды:', similar.join(', '));
            }
            return;
        }

        const orderId = order.id;
        console.log(`✅ Найден ID: ${orderId}`);

        // Шаг 2: Получаем детали заказа
        const detailResponse = await fetch(
            `https://kaspi.kz/shop/api/v2/orders/${orderId}`,
            { headers }
        );

        if (!detailResponse.ok) {
            console.error(`❌ Ошибка получения деталей: ${detailResponse.status}`);
            return;
        }

        const detailData = await detailResponse.json();
        const attrs = detailData.data?.attributes || {};
        const customer = attrs.customer || {};
        const delivery = attrs.deliveryAddress || {};

        // Форматируем телефон
        const rawPhone = customer.cellPhone || '';
        const digits = rawPhone.replace(/\D/g, '');

        let phone = '';
        if (digits.length === 11 && digits.startsWith('7')) {
            phone = `+${digits[0]} (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9)}`;
        } else if (digits.length === 10) {
            phone = `+7 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`;
        } else {
            phone = rawPhone;
        }

        // Товары
        const items = (attrs.entries || []).map(e => ({
            name: e.product?.name || 'Товар',
            quantity: e.quantity || 1,
            price: e.basePrice || 0
        }));

        // Красивый вывод
        console.log('\n╔════════════════════════════════════════════╗');
        console.log('║       ИНФОРМАЦИЯ О ЗАКАЗЕ KASPI            ║');
        console.log('╠════════════════════════════════════════════╣');
        console.log(`║ 📱 Телефон: ${phone.padEnd(29)} ║`);
        console.log(`║ 👤 Клиент: ${(customer.firstName + ' ' + (customer.lastName || '')).trim().padEnd(30)} ║`);
        console.log(`║ 📦 Заказ: ${orderCode.padEnd(31)} ║`);
        console.log(`║ 💰 Сумма: ${(attrs.totalPrice + ' ₸').padEnd(31)} ║`);
        console.log(`║ 📊 Статус: ${(attrs.state || '').padEnd(30)} ║`);
        console.log(`║ 📅 Дата: ${(attrs.creationDate || '').slice(0, 10).padEnd(32)} ║`);

        if (delivery.formattedAddress) {
            const addr = delivery.formattedAddress.slice(0, 38);
            console.log(`║ 📍 Адрес: ${addr.padEnd(30)} ║`);
        }

        console.log('╠════════════════════════════════════════════╣');
        console.log('║ 🛒 ТОВАРЫ:                                 ║');
        items.forEach((item, idx) => {
            const line = `${idx + 1}. ${item.name.slice(0, 25)} × ${item.quantity}`;
            console.log(`║   ${line.padEnd(40)} ║`);
        });
        console.log('╚════════════════════════════════════════════╝\n');

        // Копируем телефон
        const cleanPhone = `+${digits}`;
        try {
            await navigator.clipboard.writeText(cleanPhone);
            console.log(`✅ Телефон ${cleanPhone} скопирован в буфер обмена!`);
        } catch (e) {
            console.log('⚠️ Скопируйте телефон вручную:', cleanPhone);
        }

        // Возвращаем данные для дальнейшего использования
        return {
            phone: cleanPhone,
            phoneFormatted: phone,
            customer: {
                firstName: customer.firstName,
                lastName: customer.lastName,
                fullName: `${customer.firstName || ''} ${customer.lastName || ''}`.trim()
            },
            order: {
                id: orderId,
                code: attrs.code,
                state: attrs.state,
                totalPrice: attrs.totalPrice,
                creationDate: attrs.creationDate,
                deliveryAddress: delivery.formattedAddress
            },
            items: items,
            rawData: detailData
        };

    } catch (error) {
        console.error('❌ Ошибка:', error);
        console.log('💡 Убедитесь, что:');
        console.log('   - Вы находитесь на kaspi.kz');
        console.log('   - Токен действителен');
        console.log('   - Код заказа правильный');
    }
})();
