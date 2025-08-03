-- Видаляємо старі таблиці, якщо вони існують, для чистого старту
DROP TABLE IF EXISTS 
    transactions, shop_items, tasks, task_submissions, user_completed_tasks,
    teams, chat_messages, notifications, lottery_tickets,
    auction_bids, special_lot_bids, loans, pending_loans, user_portfolio, exchange_assets, 
    insurance_options, user_insurance, economic_events, schedule, ceo_news, settings, users CASCADE;

-- Таблиця для команд
CREATE TABLE teams (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL
);

-- Таблиця для користувачів
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    balance NUMERIC(15, 2) DEFAULT 100.00,
    loyalty_points INTEGER DEFAULT 10,
    is_blocked BOOLEAN DEFAULT FALSE,
    deposit_earnings NUMERIC(15, 2) DEFAULT 0.00,
    total_sent NUMERIC(15, 2) DEFAULT 0.00,
    deposit_amount NUMERIC(15, 2) DEFAULT 0.00,
    deposit_end_time TIMESTAMPTZ,
    photo VARCHAR(255),
    passport_surname VARCHAR(100),
    passport_name VARCHAR(100),
    passport_dob VARCHAR(50),
    passport_number VARCHAR(50),
    passport_room VARCHAR(50),
    last_scholarship_date TIMESTAMPTZ,
    team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL, -- Посилання на команду
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Таблиця для транзакцій
CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(255),
    amount NUMERIC(15, 2),
    is_positive BOOLEAN,
    comment TEXT,
    details JSONB, -- Для деталей покупки, тощо
    date TIMESTAMPTZ DEFAULT NOW()
);

-- Таблиця для товарів у магазині
CREATE TABLE shop_items (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    discount_price NUMERIC(10, 2),
    quantity INTEGER NOT NULL,
    category VARCHAR(100),
    description TEXT,
    image VARCHAR(255),
    is_lottery BOOLEAN DEFAULT FALSE,
    lottery_max_tickets_user INTEGER,
    popularity INTEGER DEFAULT 0
);

-- Таблиця для лотерейних квитків, куплених користувачами
CREATE TABLE lottery_tickets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    item_id INTEGER REFERENCES shop_items(id) ON DELETE CASCADE,
    ticket_number INTEGER NOT NULL,
    purchase_date TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(item_id, ticket_number) -- Кожен номер квитка унікальний для конкретної лотереї
);

-- Таблиця для завдань
CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    reward NUMERIC(10, 2),
    loyalty_points INTEGER,
    requires_approval BOOLEAN DEFAULT FALSE,
    requires_file BOOLEAN DEFAULT FALSE,
    completion_criteria JSONB -- Для автоматичних завдань
);

-- Таблиця для поданих на перевірку завдань
CREATE TABLE task_submissions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected
    file_url VARCHAR(255),
    submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Таблиця для відстеження виконаних завдань
CREATE TABLE user_completed_tasks (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, task_id)
);

-- Таблиця для налаштувань гри
CREATE TABLE settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB
);

-- Таблиця для розкладу
CREATE TABLE schedule (
    id SERIAL PRIMARY KEY,
    time_range VARCHAR(100),
    activity TEXT
);

-- Таблиця для новин від CEO
CREATE TABLE ceo_news (
    id SERIAL PRIMARY KEY,
    text TEXT,
    expiry_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Таблиця для кредитів
CREATE TABLE loans (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    amount NUMERIC(15, 2) NOT NULL,
    interest_rate NUMERIC(5, 2) NOT NULL,
    taken_date TIMESTAMPTZ NOT NULL
);

-- Таблиця для запитів на кредит
CREATE TABLE pending_loans (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    amount NUMERIC(15, 2) NOT NULL,
    requested_at TIMESTAMPTZ DEFAULT NOW()
);

-- Таблиця для активів на біржі (акції та криптовалюта)
CREATE TABLE exchange_assets (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    ticker VARCHAR(10) UNIQUE NOT NULL,
    type VARCHAR(20) NOT NULL, -- 'company' або 'crypto'
    price NUMERIC(15, 2) NOT NULL
);

-- Таблиця для портфелів користувачів
CREATE TABLE user_portfolio (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    asset_id INTEGER REFERENCES exchange_assets(id) ON DELETE CASCADE,
    quantity NUMERIC(15, 5) NOT NULL,
    UNIQUE(user_id, asset_id)
);

-- Таблиця для опцій страхування
CREATE TABLE insurance_options (
    id SERIAL PRIMARY KEY,
    duration VARCHAR(50) NOT NULL, -- '1h', '3d', etc.
    cost NUMERIC(10, 2) NOT NULL
);

-- Таблиця для застрахованих користувачів
CREATE TABLE user_insurance (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    end_time TIMESTAMPTZ NOT NULL
);

-- Таблиця для ставок на загальному аукціоні
CREATE TABLE auction_bids (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    amount NUMERIC(15, 2) NOT NULL,
    bid_time TIMESTAMPTZ DEFAULT NOW()
);

-- Таблиця для сповіщень користувачів
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Таблиця для повідомлень в чаті підтримки
CREATE TABLE chat_messages (
    id SERIAL PRIMARY KEY,
    sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    recipient_id INTEGER REFERENCES users(id) ON DELETE CASCADE, -- Може бути NULL для повідомлень в загальний чат
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Початкове заповнення деяких даних
INSERT INTO settings (key, value) VALUES 
('auctionState', '{ "isActive": false, "endTime": null, "winner": null, "specialLot": null, "bids": [] }'),
('loanConfig', '{ "interestRate": 5, "maxAmount": 1000, "autoApprove": true, "termDays": 1 }'),
('featureToggles', '{ "transfers": true, "shop": true, "auction": true, "loans": true, "exchange": true, "insurance": true, "rewards": true, "support": true, "deposit": true, "lottery": true, "dynamicEvents": true, "schedule": true }');

-- Створення першого адміністратора
-- Логін: admin
-- Пароль: admin
INSERT INTO users (username, password_hash, is_admin, balance, loyalty_points) VALUES
('admin', '$2a$10$N9qo8uLOickgx2ZMRZoMye.IKbeumMcKNknkBz6zuiMzhIgzB6S7.', TRUE, 999999, 999);