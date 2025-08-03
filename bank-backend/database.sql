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

-- Створення користувачів
-- Пароль для всіх: 123456
-- Створення користувачів з українськими іменами як логінами та унікальними, випадковими паролями
-- Створення користувачів з українськими іменами як логінами та унікальними, випадковими паролями
INSERT INTO users (username, password_hash, is_admin, passport_surname, passport_name) VALUES
('Демко Вікторія-Віолетта', '$2a$10$E1g8f6Y2h3jK4l5mN6oP7e.oYdssL4gVb9hJ2k3l4mN5oP6qR7tY8', FALSE, 'Демко', 'Вікторія-Віолетта'),
('Белей Кароліна', '$2a$10$aB1c2d3e4f5g6h7i8j9k.u0v1w2x3y4z5A6b7c8d9e0f1g2h3i4j', FALSE, 'Белей', 'Кароліна'),
('Жук Яна', '$2a$10$kL9j8h7g6f5e4d3c2b1a.z0y9x8w7v6u5t4s3r2q1p0o9n8m7l6k', FALSE, 'Жук', 'Яна'),
('Карпецький Володимир', '$2a$10$qP0o9n8m7l6k5j4h3g2f.1e2d3c4b5a6z7y8x9w0v1u2t3s4r5q', FALSE, 'Карпецький', 'Володимир'),
('Новосад Демʼян', '$2a$10$sR5t6u7v8w9x0y1z2a3b.4c5d6e7f8g9h0i1j2k3l4m5n6o7p8q', FALSE, 'Новосад', 'Демʼян'),
('Демків Софія', '$2a$10$oP6q7r8s9t0u1v2w3x4y.5z6a7b8c9d0e1f2g3h4i5j6k7l8m9n', FALSE, 'Демків', 'Софія'),
('Яремко Вікторія', '$2a$10$nM9l8k7j6h5g4f3e2d1c.b0a1z2y3x4w5v6u7t8s9r0q1p2o3n4m', FALSE, 'Яремко', 'Вікторія'),
('Грет Анатолій', '$2a$10$pO1n2m3l4k5j6h7g8f9e.d0c1b2a3z4y5x6w7v8u9t0s1r2q3p4o', FALSE, 'Грет', 'Анатолій'),
('Небораць Єлизавета', '$2a$10$qP2o3n4m5l6k7j8h9g0f.e1d2c3b4a5z6y7x8w9v0u1t2s3r4q', FALSE, 'Небораць', 'Єлизавета'),
('Небораць Софія', '$2a$10$rS3t4u5v6w7x8y9z0a1b.c2d3e4f5g6h7i8j9k0l1m2n3o4p5q', FALSE, 'Небораць', 'Софія'),
('Савчин Софія', '$2a$10$tU4v5w6x7y8z9a0b1c2d.e3f4g5h6i7j8k9l0m1n2o3p4q5r6s', FALSE, 'Савчин', 'Софія'),
('Тиха Злата', '$2a$10$uV5w6x7y8z9a0b1c2d3e.f4g5h6i7j8k9l0m1n2o3p4q5r6s7t', FALSE, 'Тиха', 'Злата'),
('Округін Матвій', '$2a$10$vW6x7y8z9a0b1c2d3e4f.g5h6i7j8k9l0m1n2o3p4q5r6s7t8u', FALSE, 'Округін', 'Матвій'),
('Оліярник Злата', '$2a$10$wX7y8z9a0b1c2d3e4f5g.h6i7j8k9l0m1n2o3p4q5r6s7t8u9v', FALSE, 'Оліярник', 'Злата'),
('Леонтьєв Лев', '$2a$10$xY8z9a0b1c2d3e4f5g6h.i7j8k9l0m1n2o3p4q5r6s7t8u9v0w', FALSE, 'Леонтьєв', 'Лев'),
('Горук Юрій', '$2a$10$yZ9a0b1c2d3e4f5g6h7i.j8k9l0m1n2o3p4q5r6s7t8u9v0w1x', FALSE, 'Горук', 'Юрій'),
('Середич Юлія', '$2a$10$zA0b1c2d3e4f5g6h7i8j.k9l0m1n2o3p4q5r6s7t8u9v0w1x2y', FALSE, 'Середич', 'Юлія'),
('Середич Лілія', '$2a$10$aB1c2d3e4f5g6h7i8j9k.l0m1n2o3p4q5r6s7t8u9v0w1x2y3z', FALSE, 'Середич', 'Лілія'),
('Фурльовська Яна', '$2a$10$bC2d3e4f5g6h7i8j9k0l.m1n2o3p4q5r6s7t8u9v0w1x2y3z4a', FALSE, 'Фурльовська', 'Яна'),
('Блавацька Діана', '$2a$10$cD3e4f5g6h7i8j9k0l1m.n2o3p4q5r6s7t8u9v0w1x2y3z4a5b', FALSE, 'Блавацька', 'Діана'),
('Когут Яна', '$2a$10$dE4f5g6h7i8j9k0l1m2n.o3p4q5r6s7t8u9v0w1x2y3z4a5b6c', FALSE, 'Когут', 'Яна'),
('Жигайло Діана', '$2a$10$fG5h6i7j8k9l0m1n2o3p.q4r5s6t7u8v9w0x1y2z3a4b5c6d', FALSE, 'Жигайло', 'Діана'),
('Лоїк Юлія', '$2a$10$gH6i7j8k9l0m1n2o3p4q.r5s6t7u8v9w0x1y2z3a4b5c6d7e', FALSE, 'Лоїк', 'Юлія'),
('Ксенофонтова Світлана', '$2a$10$hI7j8k9l0m1n2o3p4q5r.s6t7u8v9w0x1y2z3a4b5c6d7e8f', FALSE, 'Ксенофонтова', 'Світлана'),
('Левандовська Софія', '$2a$10$iJ8k9l0m1n2o3p4q5r6s.t7u8v9w0x1y2z3a4b5c6d7e8f9g', FALSE, 'Левандовська', 'Софія'),
('Каспрук Тетяна', '$2a$10$jK9l0m1n2o3p4q5r6s7t.u8v9w0x1y2z3a4b5c6d7e8f9g0h', FALSE, 'Каспрук', 'Тетяна'),
('Гуменецька Ірина', '$2a$10$kL0m1n2o3p4q5r6s7t8u.v9w0x1y2z3a4b5c6d7e8f9g0h1i', FALSE, 'Гуменецька', 'Ірина'),
('Задорожний Назар', '$2a$10$lM1n2o3p4q5r6s7t8u9v.w0x1y2z3a4b5c6d7e8f9g0h1i2j', FALSE, 'Задорожний', 'Назар'),
('Костецька Ольга', '$2a$10$mN2o3p4q5r6s7t8u9v0w.x1y2z3a4b5c6d7e8f9g0h1i2j3k', FALSE, 'Костецька', 'Ольга'),
('Костецька Анастасія', '$2a$10$nO3p4q5r6s7t8u9v0w1x.y2z3a4b5c6d7e8f9g0h1i2j3k4l', FALSE, 'Костецька', 'Анастасія'),
('Гайдар Марта', '$2a$10$oP4q5r6s7t8u9v0w1x2y.z3a4b5c6d7e8f9g0h1i2j3k4l5m', FALSE, 'Гайдар', 'Марта'),
('Миклясевич Софія', '$2a$10$pQ5r6s7t8u9v0w1x2y3z.a4b5c6d7e8f9g0h1i2j3k4l5m6n', FALSE, 'Миклясевич', 'Софія'),
('Дубик Вероніка', '$2a$10$qR6s7t8u9v0w1x2y3z4a.b5c6d7e8f9g0h1i2j3k4l5m6n7o', FALSE, 'Дубик', 'Вероніка'),
('Коцовський Данило', '$2a$10$rS7t8u9v0w1x2y3z4a5b.c6d7e8f9g0h1i2j3k4l5m6n7o8p', FALSE, 'Коцовський', 'Данило'),
('Яськів Сергій', '$2a$10$sT8u9v0w1x2y3z4a5b6c.d7e8f9g0h1i2j3k4l5m6n7o8p9q', FALSE, 'Яськів', 'Сергій'),
('Циганков Даниїл', '$2a$10$tU9v0w1x2y3z4a5b6c7d.e8f9g0h1i2j3k4l5m6n7o8p9q0r', FALSE, 'Циганков', 'Даниїл'),
('Калинець Даниїл', '$2a$10$uV0w1x2y3z4a5b6c7d8e.f9g0h1i2j3k4l5m6n7o8p9q0r1s', FALSE, 'Калинець', 'Даниїл'),
('Оржехівська Ангеліна', '$2a$10$vW1x2y3z4a5b6c7d8e9f.g0h1i2j3k4l5m6n7o8p9q0r1s2t', FALSE, 'Оржехівська', 'Ангеліна'),
('Білецький Артур', '$2a$10$wX2y3z4a5b6c7d8e9f0g.h1i2j3k4l5m6n7o8p9q0r1s2t3u', FALSE, 'Білецький', 'Артур'),
('Москалюк Надія', '$2a$10$xY3z4a5b6c7d8e9f0g1h.i2j3k4l5m6n7o8p9q0r1s2t3u4v', FALSE, 'Москалюк', 'Надія'),
('Іващишин Захар', '$2a$10$yZ4a5b6c7d8e9f0g1h2i.j3k4l5m6n7o8p9q0r1s2t3u4v5w', FALSE, 'Іващишин', 'Захар'),
('Данило Діана', '$2a$10$zA5b6c7d8e9f0g1h2i3j.k4l5m6n7o8p9q0r1s2t3u4v5w6x', FALSE, 'Данило', 'Діана'),
('Щегольський Олег', '$2a$10$aB6c7d8e9f0g1h2i3j4k.l5m6n7o8p9q0r1s2t3u4v5w6x7y', FALSE, 'Щегольський', 'Олег'),
('Поцілуйко Тетяна', '$2a$10$bC7d8e9f0g1h2i3j4k5l.m6n7o8p9q0r1s2t3u4v5w6x7y8z', FALSE, 'Поцілуйко', 'Тетяна'),
('Демко Ірина', '$2a$10$cD8e9f0g1h2i3j4k5l6m.n7o8p9q0r1s2t3u4v5w6x7y8z9a', FALSE, 'Демко', 'Ірина'),
('Проценко Олександра', '$2a$10$dE9f0g1h2i3j4k5l6m7n.o8p9q0r1s2t3u4v5w6x7y8z9a0b', FALSE, 'Проценко', 'Олександра'),
('Щудлюк Соломія', '$2a$10$fG0g1h2i3j4k5l6m7n8o.p9q0r1s2t3u4v5w6x7y8z9a0b1c', FALSE, 'Щудлюк', 'Соломія'),
('Рева Ангеліна', '$2a$10$gH1h2i3j4k5l6m7n8o9p.q0r1s2t3u4v5w6x7y8z9a0b1c2d', FALSE, 'Рева', 'Ангеліна'),
('Заремба Остап', '$2a$10$hI2i3j4k5l6m7n8o9p0q.r1s2t3u4v5w6x7y8z9a0b1c2d3e', FALSE, 'Заремба', 'Остап'),
('Боднар Ліля', '$2a$10$iJ3j4k5l6m7n8o9p0q1r.s2t3u4v5w6x7y8z9a0b1c2d3e4f', FALSE, 'Боднар', 'Ліля');
