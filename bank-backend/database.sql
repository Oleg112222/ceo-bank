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
INSERT INTO users (username, password_hash, is_admin, passport_surname, passport_name) VALUES
  ('Демко Вікторія-Віолетта', '$2a$10$wE7xJt5nL8qA4GkFhH0p9u.P9vX1sZ6vL8bN4yT2cR7jI5eW3aFq', FALSE, 'Демко', 'Вікторія-Віолетта'),
  ('Белей Кароліна', '$2a$10$T3gR8kM2bS6vF9yC1dE5fO.oH4jL7pW9qA2sX5cV1gZ8uI0bN3hJ', FALSE, 'Белей', 'Кароліна'),
  ('Жук Яна', '$2a$10$Z0vL9mP5sX8qA2bC1dF4gH.iJ6kL9oW3eR7sV5uT2gZ8xI1bN3hK', FALSE, 'Жук', 'Яна'),
  ('Карпецький Володимир', '$2a$10$D9gV2hJ7kP5sX1bC3dF6gH.iJ8kL2oW5eR9sV7uT4gZ0xI3bN5hL', FALSE, 'Карпецький', 'Володимир'),
  ('Новосад Демʼян', '$2a$10$F3hJ8kM2bS7vF1yC5dE9fO.oH6jL9pW1qA4sX7cV3gZ0uI2bN5hM', FALSE, 'Новосад', 'Демʼян'),
  ('Демків Софія', '$2a$10$K8gV4hJ1kP9sX3bC7dF2gH.iJ0kL5oW7eR1sV9uT6gZ2xI5bN7hN', FALSE, 'Демків', 'Софія'),
  ('Яремко Вікторія', '$2a$10$N1hJ2kM7bS4vF6yC9dE3fO.oH8jL1pW3qA6sX2cV8gZ5uI7bN9hP', FALSE, 'Яремко', 'Вікторія'),
  ('Грет Анатолій', '$2a$10$Q5gV6hJ9kP2sX8bC4dF7gH.iJ1kL3oW8eR4sV6uT1gZ3xI8bN0hQ', FALSE, 'Грет', 'Анатолій'),
  ('Небораць Єлизавета', '$2a$10$S9hJ3kM1bS8vF4yC2dE6fO.oH5jL8pW2qA9sX1cV7gZ4uI6bN8hR', FALSE, 'Небораць', 'Єлизавета'),
  ('Небораць Софія', '$2a$10$U7gV8hJ4kP6sX2bC9dF1gH.iJ3kL7oW4eR8sV1uT5gZ6xI0bN2hS', FALSE, 'Небораць', 'Софія'),
  ('Савчин Софія', '$2a$10$W2hJ5kM9bS3vF7yC4dE8fO.oH1jL4pW8qA2sX6cV2gZ0uI4bN6hT', FALSE, 'Савчин', 'Софія'),
  ('Тиха Злата', '$2a$10$Y6gV1hJ7kP8sX4bC6dF3gH.iJ5kL9oW1eR3sV8uT7gZ9xI2bN4hU', FALSE, 'Тиха', 'Злата'),
  ('Округін Матвій', '$2a$10$A0hJ9kM4bS1vF2yC8dE5fO.oH7jL3pW6qA4sX5cV9gZ1uI8bN0hV', FALSE, 'Округін', 'Матвій'),
  ('Оліярник Злата', '$2a$10$C4gV3hJ2kP7sX6bC1dF9gH.iJ0kL8oW3eR5sV2uT4gZ6xI1bN3hW', FALSE, 'Оліярник', 'Злата'),
  ('Леонтьєв Лев', '$2a$10$E8hJ6kM1bS9vF3yC5dE2fO.oH4jL7pW9qA1sX8cV6gZ3uI5bN7hX', FALSE, 'Леонтьєв', 'Лев'),
  ('Горук Юрій', '$2a$10$G1gV5hJ8kP3sX7bC9dF4gH.iJ2kL1oW5eR7sV4uT8gZ0xI9bN1hY', FALSE, 'Горук', 'Юрій'),
  ('Середич Юлія', '$2a$10$I6hJ2kM4bS8vF1yC7dE6fO.oH9jL5pW2qA3sX6cV1gZ5uI2bN4hZ', FALSE, 'Середич', 'Юлія'),
  ('Середич Лілія', '$2a$10$L3gV7hJ1kP5sX9bC3dF8gH.iJ4kL8oW7eR1sV2uT6gZ8xI5bN7iA', FALSE, 'Середич', 'Лілія'),
  ('Фурльовська Яна', '$2a$10$P8hJ4kM6bS2vF5yC1dE3fO.oH7jL2pW5qA9sX1cV8gZ1uI4bN6iB', FALSE, 'Фурльовська', 'Яна'),
  ('Блавацька Діана', '$2a$10$R2gV9hJ8kP1sX3bC6dF5gH.iJ0kL5oW8eR4sV7uT2gZ3xI8bN9iC', FALSE, 'Блавацька', 'Діана'),
  ('Когут Яна', '$2a$10$T7hJ1kM3bS6vF8yC2dE9fO.oH3jL7pW1qA2sX4cV5gZ6uI1bN3iD', FALSE, 'Когут', 'Яна'),
  ('жигайло діана', '$2a$10$V4gV6hJ5kP9sX2bC8dF1gH.iJ5kL9oW4eR8sV1uT7gZ9xI3bN5iE', FALSE, 'жигайло', 'діана'),
  ('Лоїк Юлія', '$2a$10$X9hJ8kM2bS4vF4yC4dE7fO.oH1jL4pW8qA7sX9cV2gZ0uI6bN8iF', FALSE, 'Лоїк', 'Юлія'),
  ('Ксенофонтова Світлана', '$2a$10$Z1gV2hJ7kP6sX7bC1dF3gH.iJ3kL6oW1eR5sV3uT5gZ8xI0bN2iG', FALSE, 'Ксенофонтова', 'Світлана'),
  ('Левандовська Софія', '$2a$10$B5hJ5kM9bS1vF9yC6dE8fO.oH8jL2pW5qA3sX5cV9gZ1uI8bN0iH', FALSE, 'Левандовська', 'Софія'),
  ('Каспрук Тетяна', '$2a$10$D9gV1hJ3kP8sX4bC2dF5gH.iJ6kL9oW2eR7sV1uT4gZ3xI2bN4iI', FALSE, 'Каспрук', 'Тетяна'),
  ('Гуменецька Ірина', '$2a$10$F3hJ7kM5bS3vF2yC8dE1fO.oH4jL7pW8qA6sX9cV3gZ5uI5bN7iJ', FALSE, 'Гуменецька', 'Ірина'),
  ('Задорожний Назар', '$2a$10$H8gV4hJ9kP1sX6bC5dF7gH.iJ1kL3oW4eR9sV2uT8gZ6xI0bN2iK', FALSE, 'Задорожний', 'Назар'),
  ('Костецька Ольга', '$2a$10$K2hJ1kM8bS7vF5yC1dE4fO.oH9jL5pW1qA2sX8cV6gZ4uI7bN9iL', FALSE, 'Костецька', 'Ольга'),
  ('Костецька Анастасія', '$2a$10$M6gV6hJ2kP4sX8bC7dF9gH.iJ3kL7oW6eR1sV4uT2gZ8xI3bN5iM', FALSE, 'Костецька', 'Анастасія'),
  ('Гайдар Марта', '$2a$10$P1hJ9kM5bS8vF2yC3dE6fO.oH5jL8pW2qA4sX7cV9gZ1uI6bN8iN', FALSE, 'Гайдар', 'Марта'),
  ('Миклясевич Софія', '$2a$10$R5gV3hJ7kP2sX5bC9dF1gH.iJ8kL2oW5eR7sV9uT4gZ3xI1bN3iO', FALSE, 'Миклясевич', 'Софія'),
  ('Дубик Вероніка', '$2a$10$T9hJ6kM1bS6vF8yC5dE4fO.oH2jL6pW9qA9sX1cV8gZ5uI4bN6iP', FALSE, 'Дубик', 'Вероніка'),
  ('Коцовський Данило', '$2a$10$V3gV8hJ4kP8sX1bC8dF7gH.iJ4kL9oW1eR3sV6uT3gZ8xI7bN9iQ', FALSE, 'Коцовський', 'Данило'),
  ('Яськів Сергій', '$2a$10$X7hJ2kM7bS2vF4yC2dE2fO.oH7jL3pW5qA6sX8cV5gZ1uI0bN2iR', FALSE, 'Яськів', 'Сергій'),
  ('Циганков Даниїл', '$2a$10$Z1gV5hJ9kP4sX7bC4dF6gH.iJ9kL2oW8eR1sV5uT8gZ3xI5bN7iS', FALSE, 'Циганков', 'Даниїл'),
  ('Калинець Даниїл', '$2a$10$B6hJ8kM3bS9vF1yC9dE8fO.oH4jL7pW2qA3sX1cV4gZ6uI8bN0iT', FALSE, 'Калинець', 'Даниїл'),
  ('Оржехівська Ангеліна', '$2a$10$D9gV2hJ6kP1sX4bC2dF3gH.iJ7kL1oW5eR8sV6uT9gZ0xI3bN5iU', FALSE, 'Оржехівська', 'Ангеліна'),
  ('Білецький Артур', '$2a$10$F4hJ5kM8bS3vF7yC8dE6fO.oH2jL5pW9qA5sX2cV1gZ4uI8bN0iV', FALSE, 'Білецький', 'Артур'),
  ('Москалюк Надія', '$2a$10$H8gV1hJ3kP6sX9bC5dF2gH.iJ5kL8oW1eR4sV7uT3gZ8xI1bN3iW', FALSE, 'Москалюк', 'Надія'),
  ('Іващишин Захар', '$2a$10$K3hJ7kM6bS9vF2yC1dE8fO.oH8jL4pW4qA7sX9cV6gZ1uI4bN6iX', FALSE, 'Іващишин', 'Захар'),
  ('Данило Діана', '$2a$10$M7gV4hJ9kP2sX5bC7dF4gH.iJ1kL7oW7eR2sV3uT9gZ5xI8bN9iY', FALSE, 'Данило', 'Діана'),
  ('Щегольський Олег', '$2a$10$P2hJ1kM5bS6vF8yC3dE1fO.oH4jL9pW1qA5sX6cV2gZ8uI1bN3iZ', FALSE, 'Щегольський', 'Олег'),
  ('Поцілуйко Тетяна', '$2a$10$R6gV6hJ8kP9sX2bC9dF7gH.iJ7kL3oW4eR8sV1uT5gZ1xI4bN6jA', FALSE, 'Поцілуйко', 'Тетяна'),
  ('Демко Ірина', '$2a$10$T1hJ3kM2bS4vF5yC6dE3fO.oH9jL7pW8qA1sX9cV8gZ3uI7bN9jB', FALSE, 'Демко', 'Ірина'),
  ('Проценко Олександра', '$2a$10$V5gV8hJ5kP7sX8bC2dF9gH.iJ2kL5oW1eR4sV2uT4gZ6xI0bN2jC', FALSE, 'Проценко', 'Олександра'),
  ('Щудлюк Соломія', '$2a$10$X9hJ1kM9bS2vF4yC8dE6fO.oH5jL8pW4qA7sX1cV7gZ9uI3bN5jD', FALSE, 'Щудлюк', 'Соломія'),
  ('Рева Ангеліна', '$2a$10$Z4gV4hJ3kP5sX7bC5dF1gH.iJ8kL2oW7eR9sV4uT9gZ2xI6bN8jE', FALSE, 'Рева', 'Ангеліна'),
  ('Остап Заремба', '$2a$10$B8hJ7kM6bS8vF1yC2dE8fO.oH1jL4pW9qA2sX6cV3gZ5uI9bN1jF', FALSE, 'Остап', 'Заремба'),
  ('Боднар Ліля', '$2a$10$D2gV9hJ1kP3sX5bC8dF4gH.iJ6kL9oW2eR5sV1uT6gZ8xI2bN4jG', FALSE, 'Боднар', 'Ліля');