// --- Глобальні налаштування та стан ---

// ВАЖЛИВО: Перед публікацією на Render, замініть 'http://localhost:3000'
// на реальну адресу вашого бекенд-сервісу на Render.
const API_URL = 'http://localhost:3000/api'; 

// Глобальний стан, що зберігається на стороні клієнта
let appData = {
    user: null, // Дані поточного користувача (завантажуються з сервера)
    shopItems: [],
    tasks: [],
    teams: [],
    schedule: [],
    ceoNews: [],
    auction: {},
    settings: {},
    loans: {},
    exchange: { companies: [], crypto: [] },
    insurance: { options: [] },
};

// --- Стан UI ---
let cart = [];
let aiChatHistory = [];
let html5QrCode = null;
let expenseChartInstance = null;
let stockChartInstance = null;
let activityChartInstance = null; // Для адмін-панелі
let confirmedActionCallback = null;
let selectedUserForEditing = null; // Для адмін-панелі
let currentEditShopItemId = null; // Для адмін-панелі


// --- ДОПОМІЖНІ ФУНКЦІЇ ---

// Функція для надсилання запитів на сервер
async function apiRequest(endpoint, method = 'GET', body = null) {
    try {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
            },
        };
        if (body) {
            options.body = JSON.stringify(body);
        }
        const response = await fetch(`${API_URL}${endpoint}`, options);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `Помилка сервера: ${response.status}`);
        }
        if (response.status === 204) {
            return null;
        }
        return await response.json();
    } catch (error) {
        console.error(`Помилка API запиту до ${endpoint}:`, error);
        alert(`Сталася помилка: ${error.message}`);
        throw error;
    }
}


// --- АУТЕНТИФІКАЦІЯ ---

async function login() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    try {
        const response = await apiRequest('/login', 'POST', { username, password });
        localStorage.setItem('currentUser', JSON.stringify(response.user));
        await initializeUserSession(username);
    } catch (error) {
        // Помилка вже оброблена в apiRequest і показана користувачу
    }
}

async function adminLogin() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    try {
        const response = await apiRequest('/login', 'POST', { username, password });
        if (!response.user.is_admin) {
            return alert('Доступ дозволено лише для адміністраторів.');
        }
        localStorage.setItem('currentAdminUser', JSON.stringify(response.user));
        document.getElementById('login').style.display = 'none';
        document.getElementById('adminPanel').style.display = 'flex';
        showSection('dashboard');
    } catch (error) {
        // Помилка вже оброблена в apiRequest і показана користувачу
    }
}

function logout() {
    localStorage.removeItem('currentUser');
    appData.user = null;
    document.getElementById('login').style.display = 'flex';
    document.getElementById('app-content').style.display = 'none';
    document.getElementById('menu').style.display = 'none';
    document.getElementById('bottom-bar').style.display = 'none';
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    closeAllModals();
}

function adminLogout() {
    localStorage.removeItem('currentAdminUser');
    document.getElementById('adminPanel').style.display = 'none';
    document.getElementById('login').style.display = 'flex';
}

// --- ІНІЦІАЛІЗАЦІЯ СЕСІЇ ТА ДАНИХ ---

async function initializeUserSession(username) {
    try {
        const [gameData, userData] = await Promise.all([
            apiRequest('/game-data'),
            apiRequest(`/user-data/${username}`)
        ]);
        
        appData = { ...appData, ...gameData, user: userData };

        cart = JSON.parse(localStorage.getItem(`cart_${username}`)) || [];
        aiChatHistory = JSON.parse(localStorage.getItem(`aiChatHistory_${username}`)) || [];

        document.getElementById('login').style.display = 'none';
        document.getElementById('app-content').style.display = 'block';
        document.getElementById('menu').style.display = 'flex';
        document.getElementById('bottom-bar').style.display = 'flex';
        
        html5QrCode = new Html5Qrcode("qr-reader");

        updateAllDisplays();
        updateFeatureVisibility();
    } catch (error) {
        console.error("Не вдалося ініціалізувати сесію:", error);
        logout();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const savedUser = JSON.parse(localStorage.getItem('currentUser'));
    const savedAdmin = JSON.parse(localStorage.getItem('currentAdminUser'));

    if (document.getElementById('app-content') && savedUser && !savedUser.is_admin) {
        initializeUserSession(savedUser.username);
    } else if (document.getElementById('adminPanel') && savedAdmin && savedAdmin.is_admin) {
        appData.user = savedAdmin; // Зберігаємо дані адміна
        document.getElementById('login').style.display = 'none';
        document.getElementById('adminPanel').style.display = 'flex';
        showSection('dashboard');
    }
});


// --- ОСНОВНІ ДІЇ КОРИСТУВАЧА (з підключенням до API) ---

function confirmSendMoney() {
    const amount = parseFloat(document.getElementById('sendAmount').value);
    const recipient = document.getElementById('sendTo').value.trim();
    if (isNaN(amount) || amount <= 0) return alert('Введіть коректну суму.');
    if (!recipient) return alert('Введіть отримувача.');
    if (appData.user.balance < amount) return alert('Недостатньо коштів.');

    document.getElementById('confirmMessage').textContent = `Надіслати ${amount.toFixed(2)} грн до ${recipient}?`;
    confirmedActionCallback = () => executeSendMoney(amount, recipient);
    openModal('confirmModal');
}

async function executeSendMoney(amount, recipient) {
    try {
        await apiRequest('/transfer', 'POST', {
            senderUsername: appData.user.username,
            recipientUsername: recipient,
            amount: amount,
        });
        alert('Кошти успішно надіслано!');
        await refreshUserData();
        closeModal('sendMoneyModal');
    } catch (error) {}
}

function checkoutCart() {
    let subtotal = cart.reduce((sum, cartItem) => {
        const itemData = appData.shopItems.find(i => i.id == cartItem.id);
        if (!itemData) return sum;
        return sum + (itemData.discount_price || itemData.price) * cartItem.quantity;
    }, 0);
    const loyaltyDiscount = appData.settings.featureToggles?.value?.loyaltyDiscountsEnabled ? Math.min(subtotal, appData.user.loyalty_points || 0) : 0;
    const finalTotal = subtotal - loyaltyDiscount;

    document.getElementById('confirmMessage').textContent = `Оформити покупку на ${finalTotal.toFixed(2)} грн?`;
    confirmedActionCallback = () => executeCheckout(finalTotal, loyaltyDiscount);
    openModal('confirmModal');
}

async function executeCheckout(totalAmount, usedLoyaltyPoints) {
    try {
        await apiRequest('/checkout', 'POST', {
            username: appData.user.username,
            cart: cart,
            usedLoyaltyPoints: usedLoyaltyPoints
        });
        alert('Покупку успішно оформлено!');
        cart = [];
        localStorage.setItem(`cart_${appData.user.username}`, JSON.stringify(cart));
        await refreshUserData();
        closeModal('cartModal');
    } catch (error) {}
}

async function makeDeposit() {
    const amount = parseFloat(document.getElementById('depositAmount').value);
    if (isNaN(amount) || amount <= 0) return alert('Введіть коректну суму.');
    try {
        await apiRequest('/deposit', 'POST', { userId: appData.user.id, amount });
        alert(`Депозит на ${amount.toFixed(2)} грн успішно створено!`);
        await refreshUserData();
        closeModal('depositModal');
    } catch (error) {}
}

async function requestLoan() {
    const amount = parseFloat(document.getElementById('loanRequestAmount').value);
    if (isNaN(amount) || amount <= 0) return alert('Введіть коректну суму.');

    document.getElementById('confirmMessage').textContent = `Подати запит на кредит на ${amount.toFixed(2)} грн?`;
    confirmedActionCallback = async () => {
        try {
            const result = await apiRequest('/loans/request', 'POST', { userId: appData.user.id, amount });
            if (result.autoApproved) {
                alert('Кредит успішно отримано.');
            } else {
                alert('Ваш запит на кредит відправлено на розгляд.');
            }
            await refreshUserData();
            closeModal('loanModal');
        } catch (error) {}
    };
    openModal('confirmModal');
}

async function repayLoan() {
    const amount = parseFloat(document.getElementById('loanRepayAmount').value);
    if (isNaN(amount) || amount <= 0) return alert('Введіть коректну суму.');
    try {
        await apiRequest('/loans/repay', 'POST', { userId: appData.user.id, amount });
        alert('Частину кредиту погашено.');
        await refreshUserData();
        populateLoanModal();
    } catch (error) {}
}

async function buyInsurance(optionId) {
    const option = appData.insurance.options.find(opt => opt.id == optionId);
    document.getElementById('confirmMessage').textContent = `Купити страховий поліс на ${option.duration} за ${option.cost.toFixed(2)} грн?`;
    confirmedActionCallback = async () => {
        try {
            await apiRequest('/insurance/buy', 'POST', { userId: appData.user.id, optionId });
            alert('Страховий поліс успішно придбано/подовжено!');
            await refreshUserData();
            populateInsuranceOptions();
            closeModal('confirmModal');
        } catch (error) {}
    };
    openModal('confirmModal');
}

async function submitTaskForApproval(taskId) {
    const task = appData.tasks.find(t => t.id == taskId);
    if (!task) return;

    let fileUrl = null;
    if (task.requires_file) {
        const fileInput = document.getElementById('taskFileInput');
        if (fileInput.files.length === 0) {
            return alert("Будь ласка, прикріпіть файл для цього завдання.");
        }
        fileUrl = fileInput.files[0].name;
    }
    
    try {
        await apiRequest('/tasks/submit', 'POST', { userId: appData.user.id, taskId, fileUrl });
        alert('Завдання надіслано на перевірку!');
        await refreshUserData();
        closeModal('taskDetailModal');
        populateTasksList();
    } catch (error) {}
}

async function placeGeneralAuctionBid() {
    const amount = parseFloat(document.getElementById('auctionBidAmount').value);
    if (isNaN(amount) || amount <= 0) return alert('Введіть коректну суму.');

    document.getElementById('confirmMessage').textContent = `Зробити ставку на ${amount.toFixed(2)} грн?`;
    confirmedActionCallback = async () => {
        try {
            await apiRequest('/auction/bid', 'POST', { userId: appData.user.id, amount });
            alert('Вашу ставку прийнято!');
            await refreshUserData();
            await populateAuctionModal();
        } catch (error) {}
    };
    openModal('confirmModal');
}

async function performStockAction(ticker, type) {
    const quantity = parseFloat(document.getElementById('stockActionAmount').value);
    const action = document.getElementById('stockActionType').value;
    if (isNaN(quantity) || quantity <= 0) return alert('Введіть коректну кількість.');
    try {
        await apiRequest('/exchange/trade', 'POST', {
            userId: appData.user.id, ticker, type, quantity, action
        });
        alert(`Операцію "${action}" з ${quantity} ${ticker} успішно виконано.`);
        await refreshUserData();
        showStockDetail(ticker, type);
    } catch (error) {}
}


// --- ФУНКЦІЇ ОНОВЛЕННЯ ІНТЕРФЕЙСУ ---

async function refreshUserData() {
    try {
        const userData = await apiRequest(`/user-data/${appData.user.username}`);
        appData.user = userData;
        updateAllDisplays();
    } catch (error) {
        console.error("Не вдалося оновити дані користувача:", error);
    }
}

function updateAllDisplays() {
    if (!appData.user) return;
    document.getElementById('greeting').textContent = `Вітаємо, ${appData.user.passport_name || appData.user.username}!`;
    updateBalanceDisplay();
    updateTransactionHistoryDisplay();
    updateNewsTicker();
    generateAndDisplayCardNumber();
    generateAndDisplayCVV();
    updateCartModalItemCount();
    checkNotifications();
}

function updateBalanceDisplay() {
    if (!appData.user) return;
    const balanceValue = (appData.user.balance || 0).toFixed(2);
    ['balance', 'balanceDeposit', 'balanceSendMoney', 'balanceShop', 'balanceExchange']
        .forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = balanceValue;
        });
}

function updateTransactionHistoryDisplay(showAll = false) {
    if (!appData.user) return;
    const listDiv = document.getElementById('transactionList');
    const transactions = (appData.user.transactions || [])
        .map(t => ({ ...t, date: new Date(t.date) }))
        .sort((a, b) => b.date - a.date);

    const toDisplay = showAll ? transactions : transactions.slice(0, 5);
    if (toDisplay.length === 0) {
        listDiv.innerHTML = '<p class="no-transactions">Транзакцій ще немає.</p>';
        document.getElementById('moreBtn').style.display = 'none';
        return;
    }
    
    const grouped = toDisplay.reduce((acc, t) => {
        const dateKey = t.date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
        if (!acc[dateKey]) acc[dateKey] = [];
        acc[dateKey].push(t);
        return acc;
    }, {});

    listDiv.innerHTML = Object.keys(grouped).map(dateKey => `
        <div class="transaction-date-group">${dateKey}</div>
        ${grouped[dateKey].map(t => `
        <div class="transaction-item">
            <div class="transaction-icon">${getTransactionIconByAction(t.action)}</div>
            <div class="transaction-info">
            <span class="transaction-action">${t.action}</span>
            <span class="transaction-comment">${t.comment || ''}</span>
            <span class="transaction-time">${t.date.toLocaleTimeString('uk-UA', {hour: '2-digit', minute:'2-digit'})}</span>
            </div>
            <span class="transaction-amount ${t.is_positive ? 'positive' : 'negative'}">${t.is_positive ? '+' : '−'}${parseFloat(t.amount).toFixed(2)}</span>
        </div>
        `).join('')}
    `).join('');

    document.getElementById('moreBtn').style.display = transactions.length > 5 && !showAll ? 'block' : 'none';
}

function updateNewsTicker() {
    const ticker = document.getElementById('ceoNewsTicker');
    const content = document.getElementById('news-content');
    const activeNews = appData.ceoNews[0];

    if (activeNews) {
        content.innerHTML = `<p>${activeNews.text}</p>`;
        ticker.style.display = 'block';
    } else {
        ticker.style.display = 'none';
    }
}

function populateShopItems() {
    const shopGrid = document.getElementById('shopItems');
    shopGrid.innerHTML = appData.shopItems.map(item => {
        const hasDiscount = item.discount_price && item.discount_price < item.price;
        return `
            <div class="shop-item-card" onclick="handleAddToCartClick(event, ${item.id})">
              <img src="${item.image || 'https://placehold.co/140x140'}" alt="${item.name}" class="shop-item-image">
              <h4 class="shop-item-name">${item.name} ${item.is_lottery ? '🎟️' : ''}</h4>
              <div class="shop-item-price-container">
                ${hasDiscount ? `<span class="shop-item-price-original">${parseFloat(item.price).toFixed(2)} грн</span>` : ''}
                <span class="shop-item-price">${parseFloat(hasDiscount ? item.discount_price : item.price).toFixed(2)} грн</span>
              </div>
              <button class="action-button add-to-cart-button">Додати</button>
            </div>`;
    }).join('');
}

function populatePersonalInfoModal() {
    const u = appData.user;
    document.getElementById('passportPhoto').src = u.photo || './logo.png';
    document.getElementById('passportSurname').textContent = u.passport_surname || '';
    document.getElementById('passportName').textContent = u.passport_name || '';
    document.getElementById('passportDOB').textContent = u.passport_dob || '';
    document.getElementById('passportNumber').textContent = u.passport_number || '';
    document.getElementById('passportRoom').textContent = u.passport_room || '';
    document.getElementById('loyaltyPoints').textContent = u.loyalty_points || 0;
    renderUserCharts();
}

async function populateAuctionModal() {
    const auctionState = await apiRequest('/auction');
    appData.auction = auctionState;
    const { isActive, endTime, bids, specialLot } = auctionState;
    
    if (isActive) {
        document.getElementById('auctionTimer').textContent = `До кінця: ${endTime ? new Date(endTime).toLocaleTimeString() : 'Ручний режим'}`;
        const highestBid = (bids || []).sort((a,b) => b.amount - a.amount)[0];
        document.getElementById('highestBidInfo').textContent = `${(highestBid?.amount || 0).toFixed(2)} грн ${highestBid ? `(${highestBid.username})` : ''}`;
    } else {
        document.getElementById('auctionTimer').textContent = 'Аукціон неактивний';
    }

    if (specialLot && new Date(specialLot.endTime) > new Date()) {
        document.getElementById('specialAuctionContainer').style.display = 'block';
        document.getElementById('noSpecialLotMessage').style.display = 'none';
        document.getElementById('specialLotName').textContent = specialLot.name;
        document.getElementById('specialLotDescription').textContent = specialLot.description;
        const highestSpecialBid = (specialLot.bids || []).sort((a,b) => b.amount - a.amount)[0];
        document.getElementById('specialHighestBidInfo').textContent = `${(highestSpecialBid?.amount || specialLot.startPrice).toFixed(2)} грн`;
    } else {
        document.getElementById('specialAuctionContainer').style.display = 'none';
        document.getElementById('noSpecialLotMessage').style.display = 'block';
    }
}

function populateLoanModal() {
    const user = appData.user;
    const loanConfig = appData.settings.loanConfig.value;
    document.getElementById('loanDebt').textContent = (user.loan?.amount || 0).toFixed(2);
    document.getElementById('loanMax').textContent = (loanConfig.maxAmount || 1000).toFixed(2);
    document.getElementById('loanRate').textContent = (loanConfig.interestRate || 5);
}

function populateInsuranceOptions() {
    const container = document.getElementById('insuranceOptionsContainer');
    container.innerHTML = appData.insurance.options.map(opt => `
        <div class="insurance-option-item">
            <div><h4>Страхування на ${opt.duration}</h4><p>Вартість: ${opt.cost.toFixed(2)} грн</p></div>
            <button class="action-button primary-button" onclick="buyInsurance(${opt.id})">Купити</button>
        </div>
    `).join('');
}

// --- АДМІН-ПАНЕЛЬ (з підключенням до API) ---

async function showSection(sectionId) {
    document.querySelectorAll('.main-content .section').forEach(s => s.style.display = 'none');
    document.getElementById(sectionId).style.display = 'block';
    document.querySelectorAll('.sidebar .nav-item').forEach(item => item.classList.toggle('active', item.getAttribute('onclick').includes(sectionId)));
    
    switch (sectionId) {
        case 'dashboard': await updateDashboard(); break;
        case 'users': await updateUserList(); break;
        case 'transactions': await updateTransactionList(); break;
        case 'shop': await updateShopAdminView(); break;
        case 'auction': await updateAuctionAdminView(); break;
        case 'rewards': await updateRewardsAdminView(); break;
        case 'schedule': await updateScheduleAdminView(); break;
        case 'loans': await updateLoansAdminView(); break;
        case 'exchange': await updateExchangeAdminView(); break;
        case 'insurance': await updateInsuranceAdminView(); break;
        case 'messages': await updateMessageHistory(); break;
        case 'chat': await populateChatUserSelect(); break;
        case 'settings': await updateSettingsDisplay(); break;
    }
}

async function updateDashboard() {
    try {
        const stats = await apiRequest('/admin/dashboard-stats');
        document.getElementById('totalUsers').textContent = stats.totalUsers;
        document.getElementById('totalTransactions').textContent = stats.totalTransactions;
        document.getElementById('totalBalance').textContent = `${parseFloat(stats.totalBalance).toFixed(2)} грн`;
        document.getElementById('moneySupply').textContent = `${parseFloat(stats.moneySupply).toFixed(2)} грн`;
        document.getElementById('totalDebt').textContent = `${parseFloat(stats.totalDebt).toFixed(2)} грн`;
        
        document.getElementById('popularItemsList').innerHTML = stats.popularItems.map(item => `<div class="data-item"><span>${item.name}</span><span>Продано: ${item.popularity || 0}</span></div>`).join('');
        document.getElementById('activeUsersList').innerHTML = stats.activeUsers.map(user => `<div class="data-item"><span>${user.username}</span><span>Транзакцій: ${user.transaction_count}</span></div>`).join('');

        renderActivityChart(stats.activity);
    } catch (error) {}
}

async function updateUserList() {
    try {
        const users = await apiRequest('/admin/users');
        const userListDiv = document.getElementById('userList');
        userListDiv.innerHTML = users.map(u => `
            <div class="data-item">
                <span>${u.username} | Баланс: ${parseFloat(u.balance).toFixed(2)} грн | ${u.is_blocked ? '🔴' : '🟢'}</span>
                <div class="button-group">
                    <button onclick='openEditUserModal(${JSON.stringify(u)})' class="styled-button action-btn warning">Редагувати</button>
                </div>
            </div>
        `).join('');
    } catch (error) {}
}

function openEditUserModal(user) {
    selectedUserForEditing = user;
    document.getElementById('editUsername').value = user.username;
    document.getElementById('editBalance').value = parseFloat(user.balance).toFixed(2);
    document.getElementById('editLoyaltyPoints').value = user.loyalty_points;
    document.getElementById('editBlocked').checked = user.is_blocked;
    document.getElementById('editTeam').value = user.team_id || '';
    document.getElementById('editPassword').value = '';
    openModal('editUserModal');
}

async function createUser() {
    const username = document.getElementById('newUsername').value.trim();
    const password = document.getElementById('newPassword').value;
    const balance = parseFloat(document.getElementById('initialBalance').value) || 100;
    const loyaltyPoints = parseInt(document.getElementById('initialLoyaltyPoints').value) || 10;

    if (!username || !password) return alert('Заповніть ім\'я користувача та пароль.');
    
    try {
        await apiRequest('/admin/users', 'POST', { username, password, balance, loyaltyPoints });
        alert(`Користувач ${username} створений.`);
        document.getElementById('newUsername').value = '';
        document.getElementById('newPassword').value = '';
        await updateUserList();
    } catch (error) {}
}

async function saveUserChanges() {
    if (!selectedUserForEditing) return;
    const newPassword = document.getElementById('editPassword').value;
    const body = {
        balance: parseFloat(document.getElementById('editBalance').value),
        loyaltyPoints: parseInt(document.getElementById('editLoyaltyPoints').value),
        isBlocked: document.getElementById('editBlocked').checked,
        teamId: document.getElementById('editTeam').value || null,
    };
    if (newPassword) {
        body.newPassword = newPassword;
    }
    try {
        await apiRequest(`/admin/users/${selectedUserForEditing.id}`, 'PUT', body);
        alert('Дані користувача оновлено.');
        closeModal('editUserModal');
        await updateUserList();
    } catch (error) {}
}

async function updateShopAdminView() {
    const gameData = await apiRequest('/game-data');
    appData.shopItems = gameData.shopItems;
    const listDiv = document.getElementById('shopList');
    listDiv.innerHTML = appData.shopItems.map(item => `
        <div class="data-item">
            <span>${item.name} | Ціна: ${item.price} грн | К-сть: ${item.quantity}</span>
            <div class="button-group">
                <button onclick='editShopItem(${JSON.stringify(item)})' class="styled-button action-btn warning">Редагувати</button>
                <button onclick="deleteShopItem(${item.id})" class="styled-button action-btn danger">Видалити</button>
            </div>
        </div>
    `).join('');
}

function editShopItem(item) {
    currentEditShopItemId = item.id;
    document.getElementById('itemName').value = item.name;
    document.getElementById('itemPrice').value = item.price;
    document.getElementById('itemDiscountPrice').value = item.discount_price || '';
    document.getElementById('itemQuantity').value = item.quantity;
    document.getElementById('itemCategory').value = item.category;
    document.getElementById('itemDescription').value = item.description;
    document.getElementById('itemImage').value = item.image;
    document.getElementById('itemIsLottery').checked = item.is_lottery;
    toggleLotteryFields();
    if(item.is_lottery) {
        document.getElementById('lotteryMaxTicketsUser').value = item.lottery_max_tickets_user || '';
    }
    document.getElementById('addShopItemBtn').textContent = 'Оновити товар';
    document.getElementById('clearShopFormBtn').style.display = 'inline-flex';
}

function clearShopForm() {
    currentEditShopItemId = null;
    document.getElementById('addShopItemBtn').textContent = 'Зберегти товар';
    document.getElementById('clearShopFormBtn').style.display = 'none';
    document.getElementById('itemName').value = '';
    document.getElementById('itemPrice').value = '';
    document.getElementById('itemDiscountPrice').value = '';
    document.getElementById('itemQuantity').value = '';
    document.getElementById('itemCategory').value = '';
    document.getElementById('itemDescription').value = '';
    document.getElementById('itemImage').value = '';
    document.getElementById('itemIsLottery').checked = false;
    toggleLotteryFields();
    document.getElementById('lotteryMaxTicketsUser').value = '';
}

async function addShopItem() {
    const itemData = {
        name: document.getElementById('itemName').value,
        price: parseFloat(document.getElementById('itemPrice').value),
        discountPrice: parseFloat(document.getElementById('itemDiscountPrice').value) || null,
        quantity: parseInt(document.getElementById('itemQuantity').value),
        category: document.getElementById('itemCategory').value,
        description: document.getElementById('itemDescription').value,
        image: document.getElementById('itemImage').value,
        isLottery: document.getElementById('itemIsLottery').checked,
        lotteryMaxTicketsUser: document.getElementById('itemIsLottery').checked ? parseInt(document.getElementById('lotteryMaxTicketsUser').value) : null,
    };
    try {
        if (currentEditShopItemId) {
            await apiRequest(`/admin/shop/${currentEditShopItemId}`, 'PUT', itemData);
            alert('Товар оновлено');
        } else {
            await apiRequest('/admin/shop', 'POST', itemData);
            alert('Товар додано');
        }
        await updateShopAdminView();
        clearShopForm();
    } catch (error) {}
}

async function deleteShopItem(id) {
    if (confirm('Видалити цей товар?')) {
        try {
            await apiRequest(`/admin/shop/${id}`, 'DELETE');
            alert('Товар видалено');
            await updateShopAdminView();
        } catch (error) {}
    }
}

async function sendCeoNews() {
    const text = document.getElementById('ceoNewsText').value;
    const durationHours = parseFloat(document.getElementById('ceoNewsDuration').value);
    if (!text) return alert('Новина не може бути порожньою.');
    try {
        await apiRequest('/admin/ceo-news', 'POST', { text, durationHours });
        alert('Новину CEO_NEWS надіслано.');
        document.getElementById('ceoNewsText').value = '';
        document.getElementById('ceoNewsDuration').value = '';
    } catch (error) {}
}

async function sendNotification() {
    const text = document.getElementById('notificationText').value;
    if (!text) return alert('Повідомлення не може бути порожнім.');
    try {
        await apiRequest('/admin/notifications/global', 'POST', { text });
        alert('Загальне оголошення надіслано.');
        document.getElementById('notificationText').value = '';
    } catch (error) {}
}

async function sendPersonalMessage() {
    const recipient = document.getElementById('messageUser').value;
    const text = document.getElementById('personalMessage').value;
    if (!recipient || !text) return alert('Заповніть всі поля.');
    try {
        await apiRequest('/admin/notifications/personal', 'POST', { recipient, text });
        alert('Особисте повідомлення надіслано.');
        document.getElementById('messageUser').value = '';
        document.getElementById('personalMessage').value = '';
    } catch (error) {}
}

// --- ЗАЛИШОК КОДУ ---

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if(modal) modal.style.display = 'none';
  if (!Array.from(document.querySelectorAll('.modal')).some(m => m.style.display === 'flex')) {
      document.body.style.overflow = 'auto';
  }
}

function closeAllModals() {
    document.querySelectorAll('.modal, .modal-overlay').forEach(m => m.style.display = 'none');
    document.body.style.overflow = 'auto';
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
}

function executeConfirmedAction() {
    if (typeof confirmedActionCallback === 'function') {
        confirmedActionCallback();
    }
    closeModal('confirmModal');
}

function getTransactionIconByAction(action) {
  const a = action.toLowerCase();
  if (a.includes('переказ') || a.includes('надіслано')) return '💸';
  if (a.includes('покупка')) return '🛍️';
  if (a.includes('депозит')) return '📈';
  if (a.includes('аукціон') || a.includes('ставка')) return '⚖️';
  if (a.includes('повернення')) return '💰';
  if (a.includes('отримано') || a.includes('поповнення') || a.includes('стипендії')) return '🎁';
  if (a.includes('винагорода') || a.includes('завдання')) return '🏆';
  if (a.includes('кредит') || a.includes('борг')) return '🏦';
  if (a.includes('акції') || a.includes('біржа') || a.includes('крипто')) return '💹';
  if (a.includes('страхов') || a.includes('збиток')) return '🛡️';
  if (a.includes('адмін')) return '⚙️';
  if (a.includes('лотере') || a.includes('квиток')) return '🎟️';
  return '💳';
}

function generateAndDisplayCardNumber() {
    // Ця логіка може залишитись на клієнті, бо це лише візуалізація
    if (!appData.user) return;
    let cardNumber = localStorage.getItem(`cardNumber_${appData.user.username}`);
    if (!cardNumber) {
        cardNumber = `5168 **** **** ${Math.floor(1000 + Math.random() * 9000)}`;
        localStorage.setItem(`cardNumber_${appData.user.username}`, cardNumber);
    }
    document.getElementById('cardNumber').textContent = cardNumber;
    document.getElementById('userName').textContent = `${appData.user.passport_name} ${appData.user.passport_surname}`;
}

function generateAndDisplayCVV() {
    if (!appData.user) return;
    let cvv = localStorage.getItem(`cvv_${appData.user.username}`);
    if(!cvv) {
        cvv = String(Math.floor(100 + Math.random() * 900));
        localStorage.setItem(`cvv_${appData.user.username}`, cvv);
    }
    document.getElementById('cvvCode').textContent = cvv;
}

function updateCartModalItemCount() {
    document.getElementById('cartCountModal').textContent = cart.reduce((s, i) => s + i.quantity, 0);
}

function checkNotifications() {
    if (!appData.user) return;
    const unreadCount = (appData.user.notifications || []).filter(n => !n.is_read).length;
    const badge = document.getElementById('notification-badge');
    if(unreadCount > 0) {
        badge.style.display = 'flex';
        badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
    } else {
        badge.style.display = 'none';
    }
}

function updateFeatureVisibility() {
    const features = appData.settings?.featureToggles?.value || {};
    Object.entries(features).forEach(([feature, isEnabled]) => {
        const elements = document.querySelectorAll(`[data-feature="${feature}"]`);
        elements.forEach(el => el.style.display = isEnabled ? '' : 'none');
    });
}
