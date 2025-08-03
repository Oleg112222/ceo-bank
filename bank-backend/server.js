// --- ІМПОРТ НЕОБХІДНИХ БІБЛІОТЕК ---
// 'dotenv' для завантаження змінних середовища з файлу .env
require('dotenv').config();
// 'express' - основний фреймворк для створення веб-сервера
const express = require('express');
// 'cors' для того, щоб дозволити запити з вашого сайту (фронтенду) до сервера (бекенду)
const cors = require('cors');
// 'bcryptjs' для безпечного хешування (шифрування) паролів
const bcrypt = require('bcryptjs');
// 'pg' - драйвер для підключення до бази даних PostgreSQL
const { Pool } = require('pg');

// --- НАЛАШТУВАННЯ ДОДАТКУ EXPRESS ---
const app = express();
// Дозволяємо всі CORS-запити. На продакшені можна налаштувати більш безпечно.
app.use(cors());
// Дозволяємо серверу приймати дані у форматі JSON
app.use(express.json());

// --- ПІДКЛЮЧЕННЯ ДО БАЗИ ДАНИХ ---
// Створюємо пул з'єднань з базою даних, використовуючи посилання з файлу .env
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Якщо ви використовуєте Render для хостингу, може знадобитися SSL
  ssl: {
    rejectUnauthorized: false,
  },
});

// Перевірка з'єднання з базою даних
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Помилка підключення до бази даних:', err.stack);
  }
  client.release();
  console.log('✅ База даних успішно підключена!');
});


// --- ДОПОМІЖНІ ФУНКЦІЇ ---

// Функція для отримання всіх налаштувань з БД
async function getSettings() {
    const settings = {};
    const result = await pool.query('SELECT key, value FROM settings');
    result.rows.forEach(row => {
        settings[row.key] = row.value;
    });
    return settings;
}

// --- МАРШРУТИ API (API ROUTES) ---

// Це "ендпоінти" або URL-адреси, на які ваш сайт буде надсилати запити.

/*
 * =================================================================
 * АУТЕНТИФІКАЦІЯ
 * =================================================================
 */

// Маршрут для входу користувача
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Ім\'я користувача та пароль є обов\'язковими' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({ message: 'Користувача не знайдено' });
    }

    // Порівнюємо наданий пароль з хешем у базі даних
    const isPasswordCorrect = await bcrypt.compare(password, user.password_hash);
    console.log(password);
    console.log(user.password_hash);

    if (!isPasswordCorrect) {
      return res.status(401).json({ message: 'Неправильний пароль' });
    }
    
    if (user.is_blocked) {
        return res.status(403).json({ message: 'Ваш акаунт заблоковано' });
    }

    // Видаляємо хеш пароля перед відправкою даних користувача на клієнт
    delete user.password_hash;
    res.json({ user });

  } catch (error) {
    console.error('Помилка входу:', error);
    res.status(500).json({ message: 'Внутрішня помилка сервера' });
  }
});


/*
 * =================================================================
 * ОТРИМАННЯ ДАНИХ ДЛЯ КЛІЄНТА (ФРОНТЕНДУ)
 * =================================================================
 */

// Комплексний маршрут для отримання всіх початкових даних гри
app.get('/api/game-data', async (req, res) => {
    try {
        // Паралельно виконуємо всі запити до бази даних
        const [
            shopItemsRes,
            tasksRes,
            scheduleRes,
            ceoNewsRes,
            exchangeAssetsRes,
            insuranceOptionsRes,
            settingsRes,
            teamsRes
        ] = await Promise.all([
            pool.query('SELECT * FROM shop_items ORDER BY id'),
            pool.query('SELECT * FROM tasks ORDER BY id'),
            pool.query('SELECT * FROM schedule ORDER BY id'),
            pool.query('SELECT * FROM ceo_news WHERE expiry_date IS NULL OR expiry_date > NOW() ORDER BY created_at DESC'),
            pool.query('SELECT * FROM exchange_assets'),
            pool.query('SELECT * FROM insurance_options ORDER BY cost'),
            pool.query('SELECT key, value FROM settings'),
            pool.query('SELECT * FROM teams')
        ]);

        // Форматуємо налаштування у зручний об'єкт
        const settings = {};
        settingsRes.rows.forEach(row => {
            settings[row.key] = row.value;
        });

        // Форматуємо активи біржі
        const exchange = {
            companies: exchangeAssetsRes.rows.filter(a => a.type === 'company'),
            crypto: exchangeAssetsRes.rows.filter(a => a.type === 'crypto'),
        };

        // Збираємо всі дані в один об'єкт
        const gameData = {
            shopItems: shopItemsRes.rows,
            tasks: tasksRes.rows,
            schedule: scheduleRes.rows,
            ceoNews: ceoNewsRes.rows,
            exchange,
            insurance: { options: insuranceOptionsRes.rows },
            settings,
            teams: teamsRes.rows,
            // Додаємо сюди інші глобальні дані, якщо потрібно
        };

        res.json(gameData);

    } catch (error) {
        console.error('Помилка отримання ігрових даних:', error);
        res.status(500).json({ message: 'Внутрішня помилка сервера' });
    }
});

// Отримання даних конкретного користувача після входу
app.get('/api/user-data/:username', async (req, res) => {
    const { username } = req.params;
    try {
        // Отримуємо основні дані користувача
        const userRes = await pool.query('SELECT id, username, balance, loyalty_points, photo, passport_surname, passport_name, passport_dob, passport_number, passport_room, team_id FROM users WHERE username = $1', [username]);
        if (userRes.rows.length === 0) {
            return res.status(404).json({ message: 'Користувача не знайдено' });
        }
        const user = userRes.rows[0];

        // Паралельно завантажуємо пов'язані дані
        const [
            transactionsRes,
            notificationsRes,
            loanRes,
            insuranceRes,
            portfolioRes,
            completedTasksRes,
            lotteryTicketsRes
        ] = await Promise.all([
            pool.query('SELECT * FROM transactions WHERE user_id = $1 ORDER BY date DESC LIMIT 50', [user.id]),
            pool.query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC', [user.id]),
            pool.query('SELECT * FROM loans WHERE user_id = $1', [user.id]),
            pool.query('SELECT * FROM user_insurance WHERE user_id = $1', [user.id]),
            pool.query('SELECT a.ticker, a.type, p.quantity FROM user_portfolio p JOIN exchange_assets a ON p.asset_id = a.id WHERE p.user_id = $1', [user.id]),
            pool.query('SELECT task_id FROM user_completed_tasks WHERE user_id = $1', [user.id]),
            pool.query('SELECT item_id, ticket_number FROM lottery_tickets WHERE user_id = $1', [user.id])
        ]);

        // Форматуємо дані у відповідь
        const userData = {
            ...user,
            transactions: transactionsRes.rows,
            notifications: notificationsRes.rows,
            loan: loanRes.rows[0] || null,
            insurance: insuranceRes.rows[0] || null,
            stocks: portfolioRes.rows.filter(p => p.type === 'company').reduce((acc, p) => ({ ...acc, [p.ticker]: parseFloat(p.quantity) }), {}),
            crypto: portfolioRes.rows.filter(p => p.type === 'crypto').reduce((acc, p) => ({ ...acc, [p.ticker]: parseFloat(p.quantity) }), {}),
            completedTasks: completedTasksRes.rows.map(r => r.task_id),
            lotteryTickets: lotteryTicketsRes.rows,
        };
        
        res.json(userData);

    } catch (error) {
        console.error(`Помилка отримання даних для користувача ${username}:`, error);
        res.status(500).json({ message: 'Внутрішня помилка сервера' });
    }
});


/*
 * =================================================================
 * ОСНОВНІ ДІЇ КОРИСТУВАЧА
 * =================================================================
 */

// Маршрут для переказу коштів
app.post('/api/transfer', async (req, res) => {
    const { senderUsername, recipientUsername, amount } = req.body;

    if (amount <= 0) {
        return res.status(400).json({ message: 'Сума має бути більшою за нуль' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // Починаємо транзакцію

        // Отримуємо дані відправника
        const senderRes = await client.query('SELECT id, balance, loyalty_points FROM users WHERE username = $1', [senderUsername]);
        const sender = senderRes.rows[0];

        if (!sender) return res.status(404).json({ message: 'Відправника не знайдено' });
        if (sender.balance < amount) return res.status(400).json({ message: 'Недостатньо коштів' });

        // Отримуємо дані отримувача
        const recipientRes = await client.query('SELECT id, balance FROM users WHERE username = $1', [recipientUsername]);
        const recipient = recipientRes.rows[0];
        if (!recipient) return res.status(404).json({ message: 'Отримувача не знайдено' });

        // Оновлюємо баланси
        const newSenderBalance = sender.balance - amount;
        const newRecipientBalance = recipient.balance + amount;
        const loyaltyPointsToAdd = Math.floor(amount / 100);

        await client.query('UPDATE users SET balance = $1, loyalty_points = loyalty_points + $2 WHERE id = $3', [newSenderBalance, loyaltyPointsToAdd, sender.id]);
        await client.query('UPDATE users SET balance = $1 WHERE id = $2', [newRecipientBalance, recipient.id]);

        // Записуємо транзакції
        await client.query(
            'INSERT INTO transactions (user_id, action, amount, is_positive, comment) VALUES ($1, $2, $3, $4, $5)',
            [sender.id, `Переказ до ${recipientUsername}`, amount, false, `Переказ для ${recipientUsername}`]
        );
        await client.query(
            'INSERT INTO transactions (user_id, action, amount, is_positive, comment) VALUES ($1, $2, $3, $4, $5)',
            [recipient.id, `Отримано від ${senderUsername}`, amount, true, `Переказ від ${senderUsername}`]
        );
        
        // Створюємо сповіщення для отримувача
        await client.query(
            'INSERT INTO notifications (user_id, text) VALUES ($1, $2)',
            [recipient.id, `Ви отримали переказ ${amount.toFixed(2)} грн від ${senderUsername}.`]
        );

        await client.query('COMMIT'); // Завершуємо транзакцію
        res.json({ success: true, message: 'Переказ успішний' });

    } catch (error) {
        await client.query('ROLLBACK'); // Відкочуємо зміни у разі помилки
        console.error('Помилка переказу:', error);
        res.status(500).json({ message: 'Внутрішня помилка сервера' });
    } finally {
        client.release(); // Повертаємо з'єднання в пул
    }
});

// Маршрут для покупки в магазині
app.post('/api/checkout', async (req, res) => {
    const { username, cart, usedLoyaltyPoints } = req.body;
    
    if (!cart || cart.length === 0) {
        return res.status(400).json({ message: 'Кошик порожній' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const userRes = await client.query('SELECT id, balance, loyalty_points FROM users WHERE username = $1', [username]);
        const user = userRes.rows[0];

        let subtotal = 0;
        const itemIds = cart.map(item => item.id);
        const shopItemsRes = await client.query('SELECT * FROM shop_items WHERE id = ANY($1::int[])', [itemIds]);
        const shopItems = shopItemsRes.rows;

        // Перевіряємо наявність товару та розраховуємо суму
        for (const cartItem of cart) {
            const itemData = shopItems.find(i => i.id == cartItem.id);
            if (!itemData || itemData.quantity < cartItem.quantity) {
                throw new Error(`Товару "${itemData?.name || 'невідомий'}" недостатньо на складі.`);
            }
            subtotal += (itemData.discount_price || itemData.price) * cartItem.quantity;
        }

        const finalTotal = subtotal - usedLoyaltyPoints;
        if (user.balance < finalTotal || user.loyalty_points < usedLoyaltyPoints) {
             throw new Error('Недостатньо коштів або балів лояльності.');
        }

        // Оновлюємо баланс та бали користувача
        const pointsFromPurchase = Math.floor(subtotal / 100);
        await client.query(
            'UPDATE users SET balance = balance - $1, loyalty_points = loyalty_points - $2 + $3 WHERE id = $4',
            [finalTotal, usedLoyaltyPoints, pointsFromPurchase, user.id]
        );

        // Оновлюємо кількість товарів та записуємо транзакцію
        const itemsDetails = [];
        for (const cartItem of cart) {
            const itemData = shopItems.find(i => i.id == cartItem.id);
            await client.query(
                'UPDATE shop_items SET quantity = quantity - $1, popularity = popularity + $2 WHERE id = $3',
                [cartItem.quantity, cartItem.quantity, itemData.id]
            );
            itemsDetails.push({ itemId: itemData.id, itemName: itemData.name, quantity: cartItem.quantity, price: (itemData.discount_price || itemData.price) });
        }

        await client.query(
            'INSERT INTO transactions (user_id, action, amount, is_positive, comment, details) VALUES ($1, $2, $3, $4, $5, $6)',
            [user.id, 'Покупка в магазині', finalTotal, false, `Використано ${usedLoyaltyPoints} балів`, JSON.stringify({ items: itemsDetails })]
        );

        await client.query('COMMIT');
        res.json({ success: true, message: 'Покупка успішна' });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Помилка покупки:', error);
        res.status(500).json({ message: error.message || 'Внутрішня помилка сервера' });
    } finally {
        client.release();
    }
});

// Маршрут для створення депозиту
app.post('/api/deposit', async (req, res) => {
    const { userId, amount } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const userRes = await client.query('SELECT balance, deposit_amount FROM users WHERE id = $1', [userId]);
        const user = userRes.rows[0];
        if (user.balance < amount) throw new Error('Недостатньо коштів');
        if (user.deposit_amount > 0) throw new Error('У вас вже є активний депозит');

        const depositEndTime = new Date(Date.now() + 24 * 3600 * 1000); // Депозит на 24 години

        await client.query('UPDATE users SET balance = balance - $1, deposit_amount = $2, deposit_end_time = $3 WHERE id = $4', [amount, amount, depositEndTime, userId]);
        await client.query('INSERT INTO transactions (user_id, action, amount, is_positive, comment) VALUES ($1, $2, $3, false, $4)', [userId, 'Депозит', amount, `Відкрито депозит на ${amount.toFixed(2)} грн`]);

        await client.query('COMMIT');
        res.json({ success: true, depositEndTime });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(400).json({ message: error.message });
    } finally {
        client.release();
    }
});


// Маршрут для запиту кредиту
app.post('/api/loans/request', async (req, res) => {
    const { userId, amount } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const settingsRes = await client.query("SELECT value FROM settings WHERE key = 'loanConfig'");
        const loanConfig = settingsRes.rows[0].value;

        const userLoanRes = await client.query('SELECT amount FROM loans WHERE user_id = $1', [userId]);
        const currentDebt = userLoanRes.rows.length > 0 ? userLoanRes.rows[0].amount : 0;

        if (currentDebt + amount > loanConfig.maxAmount) {
            throw new Error('Запит перевищує максимальний кредитний ліміт.');
        }

        if (loanConfig.autoApprove) {
            const interestRate = loanConfig.interestRate;
            await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [amount, userId]);
            
            // Оновлюємо або вставляємо запис про кредит
            await client.query(`
                INSERT INTO loans (user_id, amount, interest_rate, taken_date) 
                VALUES ($1, $2, $3, NOW())
                ON CONFLICT (user_id) DO UPDATE SET amount = loans.amount + $2;
            `, [userId, amount, interestRate]);

            await client.query('INSERT INTO transactions (user_id, action, amount, is_positive, comment) VALUES ($1, $2, $3, true, $4)', [userId, 'Отримання кредиту', amount, `Кредит під ${interestRate}%`]);
            await client.query('INSERT INTO notifications (user_id, text) VALUES ($1, $2)', [userId, `✅ Ваш запит на кредит на суму ${amount.toFixed(2)} грн було схвалено.`]);
        } else {
            await client.query('INSERT INTO pending_loans (user_id, amount) VALUES ($1, $2)', [userId, amount]);
            await client.query('INSERT INTO notifications (user_id, text) VALUES ($1, $2)', [userId, `⏳ Ваш запит на кредит на суму ${amount.toFixed(2)} грн відправлено на розгляд.`]);
        }

        await client.query('COMMIT');
        res.json({ success: true, autoApproved: loanConfig.autoApprove });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(400).json({ message: error.message });
    } finally {
        client.release();
    }
});

// Маршрут для погашення кредиту
app.post('/api/loans/repay', async (req, res) => {
    const { userId, amount } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const userRes = await client.query('SELECT balance FROM users WHERE id = $1', [userId]);
        const user = userRes.rows[0];
        if (user.balance < amount) throw new Error('Недостатньо коштів');
        
        const loanRes = await client.query('SELECT amount FROM loans WHERE user_id = $1', [userId]);
        const loan = loanRes.rows[0];
        if (!loan || loan.amount <= 0) throw new Error('У вас немає активного кредиту.');
        
        const repayAmount = Math.min(amount, loan.amount);
        
        await client.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [repayAmount, userId]);
        await client.query('UPDATE loans SET amount = amount - $1 WHERE user_id = $2', [repayAmount, userId]);
        await client.query('INSERT INTO transactions (user_id, action, amount, is_positive, comment) VALUES ($1, $2, $3, false, $4)', [userId, 'Погашення кредиту', repayAmount, 'Сплата боргу']);

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(400).json({ message: error.message });
    } finally {
        client.release();
    }
});

// Маршрут для покупки страховки
app.post('/api/insurance/buy', async (req, res) => {
    const { userId, optionId } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const optionRes = await client.query('SELECT * FROM insurance_options WHERE id = $1', [optionId]);
        const option = optionRes.rows[0];
        if (!option) throw new Error('Опцію страхування не знайдено');
        
        const userRes = await client.query('SELECT balance FROM users WHERE id = $1', [userId]);
        const user = userRes.rows[0];
        if (user.balance < option.cost) throw new Error('Недостатньо коштів');
        
        const durationHours = parseInt(option.duration.replace('h', '')) || 0;
        const durationDays = parseInt(option.duration.replace('d', '')) || 0;
        const durationMs = (durationHours * 3600 + durationDays * 86400) * 1000;
        
        const currentInsuranceRes = await client.query('SELECT end_time FROM user_insurance WHERE user_id = $1', [userId]);
        const now = Date.now();
        const currentEndTime = currentInsuranceRes.rows.length > 0 ? new Date(currentInsuranceRes.rows[0].end_time).getTime() : now;
        const newEndTime = new Date((currentEndTime > now ? currentEndTime : now) + durationMs);
        
        await client.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [option.cost, userId]);
        await client.query(`
            INSERT INTO user_insurance (user_id, end_time) VALUES ($1, $2)
            ON CONFLICT (user_id) DO UPDATE SET end_time = $2;
        `, [userId, newEndTime]);
        await client.query('INSERT INTO transactions (user_id, action, amount, is_positive, comment) VALUES ($1, $2, $3, false, $4)', [userId, 'Покупка страховки', option.cost, `Поліс на ${option.duration}`]);

        await client.query('COMMIT');
        res.json({ success: true, newEndTime });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(400).json({ message: error.message });
    } finally {
        client.release();
    }
});

// Маршрут для подачі завдання на перевірку
app.post('/api/tasks/submit', async (req, res) => {
    const { userId, taskId, fileUrl } = req.body;
    try {
        await pool.query('INSERT INTO task_submissions (user_id, task_id, file_url) VALUES ($1, $2, $3)', [userId, taskId, fileUrl]);
        await pool.query('INSERT INTO notifications (user_id, text) VALUES ($1, $2)', [userId, 'Ваше завдання надіслано на перевірку.']);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ message: 'Помилка подачі завдання' });
    }
});


/*
 * =================================================================
 * АУКЦІОН ТА БІРЖА
 * =================================================================
 */

// Отримання поточного стану аукціону
app.get('/api/auction', async (req, res) => {
    try {
        const settingsRes = await pool.query("SELECT value FROM settings WHERE key = 'auctionState'");
        const auctionState = settingsRes.rows[0].value;
        res.json(auctionState);
    } catch (error) {
        res.status(500).json({ message: 'Помилка отримання даних аукціону' });
    }
});

// Зробити ставку на аукціоні
app.post('/api/auction/bid', async (req, res) => {
    const { userId, amount } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const userRes = await client.query('SELECT balance FROM users WHERE id = $1', [userId]);
        if (userRes.rows[0].balance < amount) throw new Error('Недостатньо коштів');
        
        // Логіка повернення коштів попередньому лідеру
        const auctionStateRes = await client.query("SELECT value FROM settings WHERE key = 'auctionState'");
        const auctionState = auctionStateRes.rows[0].value;
        const bids = auctionState.bids || [];
        const highestBid = bids.sort((a, b) => b.amount - a.amount)[0];

        if (amount <= (highestBid?.amount || 0)) throw new Error('Ставка має бути вищою за поточну');

        if (highestBid) {
            const previousLeaderRes = await client.query('SELECT id FROM users WHERE username = $1', [highestBid.username]);
            const previousLeaderId = previousLeaderRes.rows[0].id;
            await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [highestBid.amount, previousLeaderId]);
            await client.query('INSERT INTO notifications (user_id, text) VALUES ($1, $2)', [previousLeaderId, `Вашу ставку ${highestBid.amount.toFixed(2)} грн на аукціоні перебито!`]);
        }

        // Заморожуємо кошти поточного гравця
        await client.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [amount, userId]);
        
        // Оновлюємо стан аукціону
        const user = await client.query('SELECT username FROM users WHERE id = $1', [userId]);
        const newBid = { username: user.rows[0].username, amount, date: new Date().toISOString() };
        bids.push(newBid);
        auctionState.bids = bids;
        
        await client.query("UPDATE settings SET value = $1 WHERE key = 'auctionState'", [auctionState]);

        await client.query('COMMIT');
        res.json({ success: true, auctionState });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(400).json({ message: error.message });
    } finally {
        client.release();
    }
});

// Купівля/продаж активів на біржі
app.post('/api/exchange/trade', async (req, res) => {
    const { userId, ticker, type, quantity, action } = req.body; // action: 'buy' or 'sell'
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const assetRes = await client.query('SELECT * FROM exchange_assets WHERE ticker = $1', [ticker]);
        const asset = assetRes.rows[0];
        if (!asset) throw new Error('Актив не знайдено');

        const userRes = await client.query('SELECT id, balance FROM users WHERE id = $1', [userId]);
        const user = userRes.rows[0];
        
        const portfolioRes = await client.query('SELECT quantity FROM user_portfolio WHERE user_id = $1 AND asset_id = $2', [userId, asset.id]);
        const userAssetQuantity = portfolioRes.rows.length > 0 ? parseFloat(portfolioRes.rows[0].quantity) : 0;

        if (action === 'buy') {
            const totalCost = asset.price * quantity;
            if (user.balance < totalCost) throw new Error('Недостатньо коштів');
            
            await client.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [totalCost, userId]);
            await client.query(`
                INSERT INTO user_portfolio (user_id, asset_id, quantity) VALUES ($1, $2, $3)
                ON CONFLICT (user_id, asset_id) DO UPDATE SET quantity = user_portfolio.quantity + $3;
            `, [userId, asset.id, quantity]);
            await client.query('INSERT INTO transactions (user_id, action, amount, is_positive, comment) VALUES ($1, $2, $3, false, $4)', [userId, `Купівля ${asset.type}`, totalCost, `Купівля ${quantity} ${asset.ticker}`]);
        } else { // sell
            if (userAssetQuantity < quantity) throw new Error('Недостатньо активів для продажу');
            
            const totalGain = asset.price * quantity;
            await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [totalGain, userId]);
            await client.query('UPDATE user_portfolio SET quantity = quantity - $1 WHERE user_id = $2 AND asset_id = $3', [quantity, userId, asset.id]);
            await client.query('INSERT INTO transactions (user_id, action, amount, is_positive, comment) VALUES ($1, $2, $3, true, $4)', [userId, `Продаж ${asset.type}`, totalGain, `Продаж ${quantity} ${asset.ticker}`]);
        }

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(400).json({ message: error.message });
    } finally {
        client.release();
    }
});

/*
 * =================================================================
 * ЧАТ ПІДТРИМКИ
 * =================================================================
 */

// Отримати історію чату для користувача
app.get('/api/chat/history/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const adminRes = await pool.query("SELECT id FROM users WHERE is_admin = TRUE LIMIT 1");
        const adminId = adminRes.rows[0].id;
        const messages = await pool.query(
            "SELECT * FROM chat_messages WHERE (sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1) ORDER BY created_at ASC",
            [userId, adminId]
        );
        res.json(messages.rows);
    } catch (error) {
        res.status(500).json({ message: "Помилка завантаження чату" });
    }
});

// Надіслати повідомлення
app.post('/api/chat/message', async (req, res) => {
    const { senderId, recipientId, message } = req.body;
    try {
        await pool.query(
            "INSERT INTO chat_messages (sender_id, recipient_id, message) VALUES ($1, $2, $3)",
            [senderId, recipientId, message]
        );
        res.status(201).json({ success: true });
    } catch (error) {
        res.status(500).json({ message: "Помилка відправки повідомлення" });
    }
});


/*
 * =================================================================
 * МАРШРУТИ ДЛЯ АДМІН-ПАНЕЛІ
 * =================================================================
 */

// Отримання всіх користувачів
app.get('/api/admin/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, username, balance, loyalty_points, is_blocked, team_id FROM users WHERE is_admin = FALSE ORDER BY username');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: 'Помилка сервера' });
    }
});

// Створення нового користувача
app.post('/api/admin/users', async (req, res) => {
    const { username, password, balance, loyaltyPoints } = req.body;
    try {
        const passwordHash = await bcrypt.hash(password, 10);
        const newUser = await pool.query(
            'INSERT INTO users (username, password_hash, balance, loyalty_points) VALUES ($1, $2, $3, $4) RETURNING *',
            [username, passwordHash, balance, loyaltyPoints]
        );
        delete newUser.rows[0].password_hash;
        res.status(201).json(newUser.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Помилка створення користувача' });
    }
});

// Оновлення користувача
app.put('/api/admin/users/:id', async (req, res) => {
    const { id } = req.params;
    const { balance, loyaltyPoints, isBlocked, teamId, newPassword } = req.body;
    try {
        let query = 'UPDATE users SET balance = $1, loyalty_points = $2, is_blocked = $3, team_id = $4';
        const values = [balance, loyaltyPoints, isBlocked, teamId || null];
        
        if (newPassword) {
            const passwordHash = await bcrypt.hash(newPassword, 10);
            query += ', password_hash = $5';
            values.push(passwordHash);
        }
        
        query += ' WHERE id = $' + (values.length + 1) + ' RETURNING *';
        values.push(id);

        const updatedUser = await pool.query(query, values);
        delete updatedUser.rows[0].password_hash;
        res.json(updatedUser.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Помилка оновлення користувача' });
    }
});

// Керування завданнями (адмін)
app.post('/api/admin/tasks/submission', async (req, res) => {
    const { submissionId, status } = req.body; // status: 'approved' or 'rejected'
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const submissionRes = await client.query('SELECT * FROM task_submissions WHERE id = $1', [submissionId]);
        const submission = submissionRes.rows[0];
        if (!submission || submission.status !== 'pending') throw new Error('Завдання не знайдено або вже оброблено');

        const taskRes = await client.query('SELECT * FROM tasks WHERE id = $1', [submission.task_id]);
        const task = taskRes.rows[0];

        if (status === 'approved') {
            await client.query('UPDATE users SET balance = balance + $1, loyalty_points = loyalty_points + $2 WHERE id = $3', [task.reward, task.loyalty_points, submission.user_id]);
            await client.query('INSERT INTO user_completed_tasks (user_id, task_id) VALUES ($1, $2)', [submission.user_id, submission.task_id]);
            await client.query('INSERT INTO transactions (user_id, action, amount, is_positive, comment) VALUES ($1, $2, $3, true, $4)', [submission.user_id, 'Винагорода за завдання', task.reward, task.name]);
            await client.query('INSERT INTO notifications (user_id, text) VALUES ($1, $2)', [submission.user_id, `✅ Ваше завдання "${task.name}" було схвалено!`]);
        } else {
            await client.query('INSERT INTO notifications (user_id, text) VALUES ($1, $2)', [submission.user_id, `❌ Ваше завдання "${task.name}" було відхилено.`]);
        }
        
        await client.query('UPDATE task_submissions SET status = $1 WHERE id = $2', [status, submissionId]);
        
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(400).json({ message: error.message });
    } finally {
        client.release();
    }
});

// Керування аукціоном (адмін)
app.post('/api/admin/auction/toggle', async (req, res) => {
    const { isActive, endTime } = req.body;
    try {
        const auctionStateRes = await pool.query("SELECT value FROM settings WHERE key = 'auctionState'");
        const auctionState = auctionStateRes.rows[0].value;
        
        auctionState.isActive = isActive;
        auctionState.endTime = endTime || null;
        if (isActive) { // Якщо починаємо новий аукціон, чистимо старі ставки
            auctionState.bids = [];
            auctionState.winner = null;
        }
        
        await pool.query("UPDATE settings SET value = $1 WHERE key = 'auctionState'", [auctionState]);
        res.json({ success: true, auctionState });
    } catch (error) {
        res.status(500).json({ message: 'Помилка оновлення стану аукціону' });
    }
});

// Надсилання глобального сповіщення
app.post('/api/admin/notifications/global', async (req, res) => {
    const { text } = req.body;
    try {
        const usersRes = await pool.query("SELECT id FROM users WHERE is_admin = FALSE");
        const userIds = usersRes.rows.map(u => u.id);
        
        const insertPromises = userIds.map(id => 
            pool.query("INSERT INTO notifications (user_id, text) VALUES ($1, $2)", [id, text])
        );
        await Promise.all(insertPromises);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ message: 'Помилка відправки' });
    }
});

// Надсилання CEO News
app.post('/api/admin/ceo-news', async (req, res) => {
    const { text, durationHours } = req.body;
    try {
        let expiryDate = null;
        if (durationHours) {
            expiryDate = new Date(Date.now() + durationHours * 3600 * 1000);
        }
        await pool.query("INSERT INTO ceo_news (text, expiry_date) VALUES ($1, $2)", [text, expiryDate]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ message: 'Помилка відправки новини' });
    }
});

// Оновлення налаштувань
app.post('/api/admin/settings', async (req, res) => {
    const { key, value } = req.body;
    try {
        await pool.query(
            "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2",
            [key, value]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ message: 'Помилка збереження налаштувань' });
    }
});


// --- ІГРОВИЙ ЦИКЛ (GAME TICK) ---
// Ця функція буде виконуватися періодично для автоматичних дій
async function gameTick() {
    console.log('Виконується ігровий цикл...');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Перевірка завершених депозитів
        const depositsRes = await client.query("SELECT id, deposit_amount FROM users WHERE deposit_end_time IS NOT NULL AND deposit_end_time <= NOW()");
        for (const user of depositsRes.rows) {
            const returnAmount = user.deposit_amount * 1.10; // +10%
            const profit = returnAmount - user.deposit_amount;
            await client.query("UPDATE users SET balance = balance + $1, deposit_amount = 0, deposit_end_time = NULL, deposit_earnings = deposit_earnings + $2 WHERE id = $3", [returnAmount, profit, user.id]);
            await client.query('INSERT INTO transactions (user_id, action, amount, is_positive, comment) VALUES ($1, $2, $3, true, $4)', [user.id, 'Повернення депозиту', returnAmount, `+${profit.toFixed(2)} грн прибутку`]);
            await client.query('INSERT INTO notifications (user_id, text) VALUES ($1, $2)', [user.id, `✅ Депозит завершено! Ви отримали ${returnAmount.toFixed(2)} грн.`]);
        }

        // 2. Перевірка завершених аукціонів
        const auctionStateRes = await client.query("SELECT value FROM settings WHERE key = 'auctionState'");
        const auctionState = auctionStateRes.rows[0].value;
        if (auctionState.isActive && auctionState.endTime && new Date(auctionState.endTime) <= new Date()) {
            auctionState.isActive = false;
            const winnerBid = (auctionState.bids || []).sort((a,b) => b.amount - a.amount)[0];
            if (winnerBid) {
                auctionState.winner = winnerBid;
                const winnerRes = await client.query('SELECT id FROM users WHERE username = $1', [winnerBid.username]);
                await client.query('INSERT INTO notifications (user_id, text) VALUES ($1, $2)', [winnerRes.rows[0].id, `🎉 Ви виграли аукціон зі ставкою ${winnerBid.amount.toFixed(2)} грн!`]);
            }
            await client.query("UPDATE settings SET value = $1 WHERE key = 'auctionState'", [auctionState]);
        }
        
        // 3. Оновлення цін на біржі (проста симуляція)
        const assets = await client.query("SELECT id, price FROM exchange_assets");
        for (const asset of assets.rows) {
            const changePercent = (Math.random() - 0.49) * 2; // +/- 1%
            const newPrice = Math.max(0.01, asset.price * (1 + changePercent / 100));
            await client.query("UPDATE exchange_assets SET price = $1 WHERE id = $2", [newPrice, asset.id]);
        }

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Помилка в ігровому циклі:", error);
    } finally {
        client.release();
    }
}

// Запускаємо ігровий цикл кожну хвилину
setInterval(gameTick, 60000);


// --- ЗАПУСК СЕРВЕРА ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущено на порті ${PORT}`);
});
