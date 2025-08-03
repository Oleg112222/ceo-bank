// --- ІМПОРТ НЕОБХІДНИХ БІБЛІОТЕК ---
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

// --- НАЛАШТУВАННЯ ДОДАТКУ EXPRESS ---
const app = express();
app.use(cors());
app.use(express.json());

// --- ПІДКЛЮЧЕННЯ ДО БАЗИ ДАНИХ ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// --- ФУНКЦІЯ ДЛЯ АВТОМАТИЧНОГО СТВОРЕННЯ АДМІНА ---
async function createInitialAdminIfNeeded() {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT id FROM users WHERE is_admin = TRUE LIMIT 1');
        if (res.rows.length === 0) {
            console.log('Адміністратор не знайдений. Створюємо нового...');
            const adminUsername = 'admin';
            const adminPassword = 'admin123'; // Пароль для входу
            
            const passwordHash = await bcrypt.hash(adminPassword, 10);
            
            await client.query(
                'INSERT INTO users (username, password_hash, is_admin, balance, loyalty_points) VALUES ($1, $2, TRUE, 999999, 999)',
                [adminUsername, passwordHash]
            );
            console.log(`✅ Створено початкового адміністратора!`);
            console.log(`   Логін: ${adminUsername}`);
            console.log(`   Пароль: ${adminPassword}`);
        } else {
            console.log('Адміністратор вже існує. Пропускаємо створення.');
        }
    } catch (error) {
        console.error('Помилка при створенні початкового адміністратора:', error);
    } finally {
        client.release();
    }
}

// Перевірка з'єднання з базою даних та запуск створення адміна
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Помилка підключення до бази даних:', err.stack);
  }
  console.log('✅ База даних успішно підключена!');
  release();
  createInitialAdminIfNeeded();
});


// --- ДОПОМІЖНІ ФУНКЦІЇ ---
async function getSettings() {
    const settings = {};
    const result = await pool.query('SELECT key, value FROM settings');
    result.rows.forEach(row => {
        settings[row.key] = row.value;
    });
    return settings;
}

// --- МАРШРУТИ API (API ROUTES) ---

/*
 * =================================================================
 * АУТЕНТИФІКАЦІЯ
 * =================================================================
 */
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
    const isPasswordCorrect = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordCorrect) {
      return res.status(401).json({ message: 'Неправильний пароль' });
    }
    if (user.is_blocked) {
        return res.status(403).json({ message: 'Ваш акаунт заблоковано' });
    }
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
app.get('/api/game-data', async (req, res) => {
    try {
        const [
            shopItemsRes, tasksRes, scheduleRes, ceoNewsRes,
            exchangeAssetsRes, insuranceOptionsRes, settingsRes, teamsRes
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

        const settings = {};
        settingsRes.rows.forEach(row => { settings[row.key] = row.value; });

        const exchange = {
            companies: exchangeAssetsRes.rows.filter(a => a.type === 'company'),
            crypto: exchangeAssetsRes.rows.filter(a => a.type === 'crypto'),
        };

        const gameData = {
            shopItems: shopItemsRes.rows,
            tasks: tasksRes.rows,
            schedule: scheduleRes.rows,
            ceoNews: ceoNewsRes.rows,
            exchange,
            insurance: { options: insuranceOptionsRes.rows },
            settings,
            teams: teamsRes.rows,
        };
        res.json(gameData);
    } catch (error) {
        console.error('Помилка отримання ігрових даних:', error);
        res.status(500).json({ message: 'Внутрішня помилка сервера' });
    }
});

app.get('/api/user-data/:username', async (req, res) => {
    const { username } = req.params;
    try {
        const userRes = await pool.query('SELECT id, username, balance, loyalty_points, photo, passport_surname, passport_name, passport_dob, passport_number, passport_room, team_id FROM users WHERE username = $1', [username]);
        if (userRes.rows.length === 0) {
            return res.status(404).json({ message: 'Користувача не знайдено' });
        }
        const user = userRes.rows[0];

        const [
            transactionsRes, notificationsRes, loanRes, insuranceRes,
            portfolioRes, completedTasksRes, lotteryTicketsRes
        ] = await Promise.all([
            pool.query('SELECT * FROM transactions WHERE user_id = $1 ORDER BY date DESC LIMIT 50', [user.id]),
            pool.query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC', [user.id]),
            pool.query('SELECT * FROM loans WHERE user_id = $1', [user.id]),
            pool.query('SELECT * FROM user_insurance WHERE user_id = $1', [user.id]),
            pool.query('SELECT a.ticker, a.type, p.quantity FROM user_portfolio p JOIN exchange_assets a ON p.asset_id = a.id WHERE p.user_id = $1', [user.id]),
            pool.query('SELECT task_id FROM user_completed_tasks WHERE user_id = $1', [user.id]),
            pool.query('SELECT item_id, ticket_number FROM lottery_tickets WHERE user_id = $1', [user.id])
        ]);

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
app.post('/api/transfer', async (req, res) => {
    const { senderUsername, recipientUsername, amount } = req.body;
    if (amount <= 0) {
        return res.status(400).json({ message: 'Сума має бути більшою за нуль' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const senderRes = await client.query('SELECT id, balance, loyalty_points FROM users WHERE username = $1', [senderUsername]);
        const sender = senderRes.rows[0];
        if (!sender) return res.status(404).json({ message: 'Відправника не знайдено' });
        if (sender.balance < amount) return res.status(400).json({ message: 'Недостатньо коштів' });
        const recipientRes = await client.query('SELECT id, balance FROM users WHERE username = $1', [recipientUsername]);
        const recipient = recipientRes.rows[0];
        if (!recipient) return res.status(404).json({ message: 'Отримувача не знайдено' });
        const newSenderBalance = sender.balance - amount;
        const newRecipientBalance = recipient.balance + amount;
        const loyaltyPointsToAdd = Math.floor(amount / 100);
        await client.query('UPDATE users SET balance = $1, loyalty_points = loyalty_points + $2 WHERE id = $3', [newSenderBalance, loyaltyPointsToAdd, sender.id]);
        await client.query('UPDATE users SET balance = $1 WHERE id = $2', [newRecipientBalance, recipient.id]);
        await client.query('INSERT INTO transactions (user_id, action, amount, is_positive, comment) VALUES ($1, $2, $3, $4, $5)',[sender.id, `Переказ до ${recipientUsername}`, amount, false, `Переказ для ${recipientUsername}`]);
        await client.query('INSERT INTO transactions (user_id, action, amount, is_positive, comment) VALUES ($1, $2, $3, $4, $5)',[recipient.id, `Отримано від ${senderUsername}`, amount, true, `Переказ від ${senderUsername}`]);
        await client.query('INSERT INTO notifications (user_id, text) VALUES ($1, $2)',[recipient.id, `Ви отримали переказ ${amount.toFixed(2)} грн від ${senderUsername}.`]);
        await client.query('COMMIT');
        res.json({ success: true, message: 'Переказ успішний' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Помилка переказу:', error);
        res.status(500).json({ message: 'Внутрішня помилка сервера' });
    } finally {
        client.release();
    }
});

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
        const pointsFromPurchase = Math.floor(subtotal / 100);
        await client.query('UPDATE users SET balance = balance - $1, loyalty_points = loyalty_points - $2 + $3 WHERE id = $4', [finalTotal, usedLoyaltyPoints, pointsFromPurchase, user.id]);
        const itemsDetails = [];
        for (const cartItem of cart) {
            const itemData = shopItems.find(i => i.id == cartItem.id);
            await client.query('UPDATE shop_items SET quantity = quantity - $1, popularity = popularity + $2 WHERE id = $3', [cartItem.quantity, cartItem.quantity, itemData.id]);
            itemsDetails.push({ itemId: itemData.id, itemName: itemData.name, quantity: cartItem.quantity, price: (itemData.discount_price || itemData.price) });
        }
        await client.query('INSERT INTO transactions (user_id, action, amount, is_positive, comment, details) VALUES ($1, $2, $3, $4, $5, $6)', [user.id, 'Покупка в магазині', finalTotal, false, `Використано ${usedLoyaltyPoints} балів`, JSON.stringify({ items: itemsDetails })]);
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

// --- ІГРОВИЙ ЦИКЛ (GAME TICK) ---
async function gameTick() {
    console.log('Виконується ігровий цикл...');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const depositsRes = await client.query("SELECT id, deposit_amount FROM users WHERE deposit_end_time IS NOT NULL AND deposit_end_time <= NOW()");
        for (const user of depositsRes.rows) {
            const returnAmount = user.deposit_amount * 1.10;
            const profit = returnAmount - user.deposit_amount;
            await client.query("UPDATE users SET balance = balance + $1, deposit_amount = 0, deposit_end_time = NULL, deposit_earnings = deposit_earnings + $2 WHERE id = $3", [returnAmount, profit, user.id]);
            await client.query('INSERT INTO transactions (user_id, action, amount, is_positive, comment) VALUES ($1, $2, $3, true, $4)', [user.id, 'Повернення депозиту', returnAmount, `+${profit.toFixed(2)} грн прибутку`]);
            await client.query('INSERT INTO notifications (user_id, text) VALUES ($1, $2)', [user.id, `✅ Депозит завершено! Ви отримали ${returnAmount.toFixed(2)} грн.`]);
        }
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
        const assets = await client.query("SELECT id, price FROM exchange_assets");
        for (const asset of assets.rows) {
            const changePercent = (Math.random() - 0.49) * 2;
            const newPrice = Math.max(0.01, parseFloat(asset.price) * (1 + changePercent / 100));
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

setInterval(gameTick, 60000);

// --- ЗАПУСК СЕРВЕРА ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущено на порті ${PORT}`);
});
// ```

// ### Крок 2: Завантажте зміни на GitHub

// 1.  Відкрийте термінал у папці вашого проєкту.
// 2.  Виконайте ці команди:
//     ```bash
//     git add server.js
//     git commit -m "Final fix for server code"
//     git push
//     ```

// ### Крок 3: Перевірте результат

// 1.  Зайдіть на Render і дочекайтеся, поки ваш **Web Service** автоматично оновиться.
// 2.  Перейдіть у вкладку **"Logs"** вашого Web Service.
// 3.  Прокрутіть логи до кінця. Ви маєте побачити повідомлення про створення адміністратора.
// 4.  Тепер відкрийте вашу адмін-панель (`/admin.html`) і увійдіть з даними:
//     * **Логін:** `admin`
//     * **Пароль:** `admin123`

// Цього разу все має спрацювати бездоган