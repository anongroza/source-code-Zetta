let audioContext = null;
let lastHoverTime = 0;
let dialogsPolling = null, messagesPolling = null, onlinePolling = null;
let currentDialogId = null;
let currentCompanionId = null;
let pressTimer = null;
let currentLang = 'ru';

const translations = {
    ru: {
        login: "Войти",
        register: "Зарегистрироваться",
        logout: "Выйти",
        addUser: "Добавить пользователя",
        searchPlaceholder: "Введите логин",
        emptyDialogs: "💬 Нет диалогов. Нажмите + чтобы добавить друга.",
        passwordHint: "Пароль должен содержать минимум 5 символов и хотя бы одну цифру",
        loginError: "Заполните все поля",
        regSuccess: "Регистрация успешна! Теперь войдите",
        secretPhrase: "Кодовая фраза",
        loginPlaceholder: "Логин",
        passwordPlaceholder: "Пароль",
        namePlaceholder: "Ваше имя",
        emojiPlaceholder: "Аватар-эмодзи",
        alreadyAccount: "Уже есть аккаунт",
        createAccount: "Создать аккаунт",
        refreshMessage: "⚠️ Пожалуйста, обновите страницу",
        deleteDialogConfirm: "Удалить этот диалог? Сообщения нельзя будет восстановить.",
        deleteError: "Ошибка при удалении",
        sendError: "Ошибка отправки сообщения",
        imageError: "Ошибка отправки фото",
        getKeyError: "Не удалось получить ключ собеседника",
        dialogCreateError: "Не удалось создать диалог",
        noUsersFound: "Не найдено",
        back: "←"
    },
    en: {
        login: "Login",
        register: "Register",
        logout: "Logout",
        addUser: "Add user",
        searchPlaceholder: "Enter login",
        emptyDialogs: "💬 No dialogs. Press + to add a friend.",
        passwordHint: "Password must be at least 5 characters and contain one digit",
        loginError: "Fill in all fields",
        regSuccess: "Registration successful! Now login",
        secretPhrase: "Secret phrase",
        loginPlaceholder: "Login",
        passwordPlaceholder: "Password",
        namePlaceholder: "Your name",
        emojiPlaceholder: "Avatar emoji",
        alreadyAccount: "Already have an account",
        createAccount: "Create account",
        refreshMessage: "⚠️ Please refresh the page",
        deleteDialogConfirm: "Delete this dialog? Messages cannot be restored.",
        deleteError: "Delete error",
        sendError: "Error sending message",
        imageError: "Error sending photo",
        getKeyError: "Failed to get interlocutor's key",
        dialogCreateError: "Failed to create dialog",
        noUsersFound: "Not found",
        back: "←"
    }
};

function initAudio() {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
    return audioContext;
}

function playSound(freq, dur, vol=0.12) {
    try {
        const ctx = initAudio();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        gain.gain.value = vol;
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + dur);
        osc.stop(ctx.currentTime + dur);
    } catch(e) {}
}

function playSendSound() { playSound(880, 0.2, 0.2); }
function playReceiveSound() { playSound(660, 0.15, 0.18); setTimeout(()=>playSound(880,0.15,0.18),120); }
function playHoverSound() { let now=Date.now(); if(now-lastHoverTime>100){ lastHoverTime=now; playSound(440,0.08,0.06); } }

function createStarField() {
    let container = document.getElementById('starField');
    for (let i=0; i<150; i++) {
        let star = document.createElement('div');
        star.className = 'star';
        star.style.left = Math.random() * 110 + '%';
        star.style.top = Math.random() * 110 + '%';
        star.style.width = (Math.random() * 2 + 1) + 'px';
        star.style.height = star.style.width;
        star.style.animationDuration = (Math.random() * 3 + 2) + 's';
        star.style.animationDelay = (Math.random() * 5) + 's';
        container.appendChild(star);
    }
}

function createShootingStar() {
    const starField = document.getElementById('starField');
    const shootingStar = document.createElement('div');
    shootingStar.className = 'shooting-star';
    const direction = Math.floor(Math.random() * 4);
    let startX, startY, endX, endY, angle;
    const distance = 350;
    switch(direction) {
        case 0:
            startX = Math.random() * 100;
            startY = -10;
            endX = startX + (Math.random() - 0.5) * 200;
            endY = startY + distance;
            angle = Math.atan2(endY - startY, endX - startX) * 180 / Math.PI;
            break;
        case 1:
            startX = 110;
            startY = Math.random() * 100;
            endX = startX - distance;
            endY = startY + (Math.random() - 0.5) * 200;
            angle = Math.atan2(endY - startY, endX - startX) * 180 / Math.PI;
            break;
        case 2:
            startX = Math.random() * 100;
            startY = 110;
            endX = startX + (Math.random() - 0.5) * 200;
            endY = startY - distance;
            angle = Math.atan2(endY - startY, endX - startX) * 180 / Math.PI;
            break;
        default:
            startX = -10;
            startY = Math.random() * 100;
            endX = startX + distance;
            endY = startY + (Math.random() - 0.5) * 200;
            angle = Math.atan2(endY - startY, endX - startX) * 180 / Math.PI;
            break;
    }
    shootingStar.style.left = startX + '%';
    shootingStar.style.top = startY + '%';
    const core = document.createElement('div');
    core.className = 'shooting-star-core';
    shootingStar.appendChild(core);
    for (let i = 0; i < 6; i++) {
        const tail = document.createElement('div');
        tail.className = 'shooting-star-tail';
        tail.style.width = (25 - i * 3) + 'px';
        tail.style.height = (2 - i * 0.15) + 'px';
        tail.style.opacity = 1 - i * 0.12;
        tail.style.transform = `rotate(${angle + Math.sin(i * 0.8) * 5}deg) translateX(${(i + 1) * 7}px)`;
        shootingStar.appendChild(tail);
    }
    starField.appendChild(shootingStar);
    const duration = 1300;
    const startTime = Date.now();
    function animate() {
        const progress = Math.min((Date.now() - startTime) / duration, 1);
        shootingStar.style.left = (startX + (endX - startX) * progress) + '%';
        shootingStar.style.top = (startY + (endY - startY) * progress) + '%';
        core.style.opacity = 1 - progress;
        if (progress < 1) requestAnimationFrame(animate);
        else shootingStar.remove();
    }
    requestAnimationFrame(animate);
}

setInterval(() => { if (Math.random() < 0.35) createShootingStar(); }, 2000);

function escapeHtml(text) { if (!text) return ''; let div = document.createElement('div'); div.textContent = text; return div.innerHTML; }

function updateLanguageUI() {
    const lang = currentLang;
    document.querySelectorAll('[data-placeholder-ru]').forEach(el => {
        el.placeholder = el.getAttribute(`data-placeholder-${lang}`);
    });
    document.getElementById('loginBtn').innerText = translations[lang].login;
    document.getElementById('showRegisterBtn').innerText = translations[lang].createAccount;
    document.getElementById('registerBtn').innerText = translations[lang].register;
    document.getElementById('showLoginBtn').innerText = translations[lang].alreadyAccount;
    document.getElementById('searchUserInput').placeholder = translations[lang].searchPlaceholder;
    document.getElementById('passwordStrengthHint').innerText = translations[lang].passwordHint;
    document.getElementById('secretInput').placeholder = translations[lang].secretPhrase;
    document.getElementById('regSecret').placeholder = translations[lang].secretPhrase;
    document.getElementById('loginInput').placeholder = translations[lang].loginPlaceholder;
    document.getElementById('passwordInput').placeholder = translations[lang].passwordPlaceholder;
    document.getElementById('regLogin').placeholder = translations[lang].loginPlaceholder;
    document.getElementById('regPassword').placeholder = translations[lang].passwordPlaceholder;
    document.getElementById('regName').placeholder = translations[lang].namePlaceholder;
    document.getElementById('regEmoji').placeholder = translations[lang].emojiPlaceholder;
    const emptyDiv = document.querySelector('.dialogs-list .empty-state');
    if (emptyDiv && (emptyDiv.innerText.includes('Нет диалогов') || emptyDiv.innerText.includes('No dialogs'))) {
        emptyDiv.innerText = translations[lang].emptyDialogs;
    }
}

function toggleLogout() {
    let btn = document.getElementById('logoutBtn');
    btn.classList.toggle('show');
}

document.addEventListener('click', function(e) {
    let menu = document.getElementById('userMenu');
    let btn = document.getElementById('logoutBtn');
    if (menu && btn && !menu.contains(e.target) && !btn.contains(e.target)) {
        btn.classList.remove('show');
    }
});

async function login() {
    let login = document.getElementById('loginInput').value.trim();
    let pwd = document.getElementById('passwordInput').value.trim();
    let secret = document.getElementById('secretInput').value.trim();
    let errDiv = document.getElementById('authError');
    if (!login || !pwd || !secret) {
        errDiv.textContent = translations[currentLang].loginError;
        return;
    }
    let resp = await fetch('/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({login, password:pwd, secret_phrase:secret}) });
    let data = await resp.json();
    if (resp.ok) {
        let keys = await generateKeys();
        localStorage.setItem('privateKey', keys.privateKey);
        await fetch('/save_public_key', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({token: data.token, public_key: keys.publicKey}) });
        localStorage.setItem('token', data.token);
        localStorage.setItem('userId', data.user_id);
        localStorage.setItem('login', login);
        localStorage.setItem('displayName', data.display_name);
        document.getElementById('userLoginDisplay').innerText = login;
        const msgDiv = document.getElementById('loginMessage');
        msgDiv.style.display = 'block';
        msgDiv.innerText = translations[currentLang].refreshMessage;
        document.getElementById('authError').textContent = '';
    } else {
        errDiv.textContent = data.error || 'Ошибка входа';
    }
}

async function register() {
    let login = document.getElementById('regLogin').value.trim();
    let pwd = document.getElementById('regPassword').value.trim();
    let secret = document.getElementById('regSecret').value.trim();
    let name = document.getElementById('regName').value.trim();
    let emoji = document.getElementById('regEmoji').value.trim() || '👤';
    let errDiv = document.getElementById('authError');
    if (!login || !pwd || !name || !secret) {
        errDiv.textContent = translations[currentLang].loginError;
        return;
    }
    let resp = await fetch('/register', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({login, password:pwd, secret_phrase:secret, display_name:name, avatar_emoji:emoji}) });
    let data = await resp.json();
    if (resp.ok) {
        let loginResp = await fetch('/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({login, password:pwd, secret_phrase:secret}) });
        let loginData = await loginResp.json();
        if (loginResp.ok) {
            let keys = await generateKeys();
            localStorage.setItem('privateKey', keys.privateKey);
            await fetch('/save_public_key', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({token: loginData.token, public_key: keys.publicKey}) });
            localStorage.setItem('token', loginData.token);
            localStorage.setItem('userId', loginData.user_id);
            localStorage.setItem('login', login);
            localStorage.setItem('displayName', loginData.display_name);
            document.getElementById('userLoginDisplay').innerText = login;
            const msgDiv = document.getElementById('loginMessage');
            msgDiv.style.display = 'block';
            msgDiv.innerText = translations[currentLang].refreshMessage;
            document.getElementById('authError').textContent = '';
        } else {
            errDiv.textContent = 'Ошибка автоматического входа после регистрации';
        }
    } else {
        errDiv.textContent = data.error || 'Ошибка регистрации';
    }
}

function showRegister() { document.getElementById('authForm').style.display = 'none'; document.getElementById('registerForm').style.display = 'block'; document.getElementById('authError').textContent = ''; }
function showLogin() { document.getElementById('authForm').style.display = 'block'; document.getElementById('registerForm').style.display = 'none'; document.getElementById('authError').textContent = ''; }

async function logout() {
    let token = localStorage.getItem('token');
    if (token) await fetch('/logout', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({token}) });
    localStorage.clear();
    sessionStorage.removeItem('sentMessages');
    if (dialogsPolling) clearInterval(dialogsPolling);
    if (messagesPolling) clearInterval(messagesPolling);
    if (onlinePolling) clearInterval(onlinePolling);
    document.getElementById('authContainer').style.display = 'block';
    document.getElementById('appContainer').style.display = 'none';
    document.getElementById('chatWindow').style.display = 'none';
    currentDialogId = null;
}

async function updateOnlineStatus() {
    let token = localStorage.getItem('token');
    if (!token) return;
    await fetch('/update_online', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({token}) });
}

async function loadDialogs() {
    let token = localStorage.getItem('token');
    if (!token) return;
    let resp = await fetch('/get_dialogs?token=' + token);
    if (resp.status === 401) { logout(); return; }
    let dialogs = await resp.json();
    let container = document.getElementById('dialogsList');
    if (dialogs.length === 0) {
        container.innerHTML = `<div class="empty-state">${translations[currentLang].emptyDialogs}</div>`;
        return;
    }
    let html = '';
    for (let d of dialogs) {
        let onlineClass = d.companion_online ? '<span class="online-dot"></span>' : '';
        let unreadBadge = d.unread_count > 0 ? `<span class="unread-badge">${d.unread_count}</span>` : '';
        html += `<div class="dialog-item" data-dialog-id="${d.dialog_id}">
            <div class="dialog-avatar">${escapeHtml(d.companion_emoji) || '👤'}</div>
            <div class="dialog-info" onclick="openDialog(${d.dialog_id}, ${d.companion_id}, '${escapeHtml(d.companion_name)}', '${escapeHtml(d.companion_emoji)}')">
                <div class="dialog-name">${escapeHtml(d.companion_name)} ${onlineClass}</div>
                <div class="dialog-last-message">${escapeHtml(d.last_message || '')}</div>
            </div>
            <div class="dialog-meta">
                <div class="dialog-time">${escapeHtml(d.last_message_time || '')}</div>
                ${unreadBadge}
            </div>
            <button class="delete-dialog-btn" data-dialog-id="${d.dialog_id}" onclick="event.stopPropagation(); deleteDialog(${d.dialog_id})">🗑️</button>
        </div>`;
    }
    container.innerHTML = html;
}

async function deleteDialog(dialogId) {
    if (!confirm(translations[currentLang].deleteDialogConfirm)) return;
    let token = localStorage.getItem('token');
    let resp = await fetch('/delete_dialog', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({token, dialog_id: dialogId}) });
    if (resp.ok) {
        loadDialogs();
        if (currentDialogId === dialogId) closeChat();
    } else {
        alert(translations[currentLang].deleteError);
    }
}

async function openDialog(dialogId, companionId, companionName, companionEmoji) {
    currentDialogId = dialogId;
    currentCompanionId = companionId;
    document.getElementById('chatTitle').innerHTML = `${escapeHtml(companionName)} <span id="chatOnlineDot" class="online-dot" style="display:none"></span>`;
    document.getElementById('chatAvatar').innerText = companionEmoji || '👤';
    document.getElementById('appContainer').style.display = 'none';
    document.getElementById('chatWindow').style.display = 'flex';
    await loadMessages(dialogId);
    if (messagesPolling) clearInterval(messagesPolling);
    messagesPolling = setInterval(() => loadMessages(dialogId), 2000);
    fetchCompanionOnlineStatus(companionId);
    setInterval(() => fetchCompanionOnlineStatus(companionId), 5000);
}

async function fetchCompanionOnlineStatus(companionId) {
    let token = localStorage.getItem('token');
    let resp = await fetch(`/user_online_status?token=${token}&user_id=${companionId}`);
    let data = await resp.json();
    let dot = document.getElementById('chatOnlineDot');
    if (dot) dot.style.display = data.is_online ? 'inline-block' : 'none';
}

async function loadMessages(dialogId) {
    let token = localStorage.getItem('token');
    let resp = await fetch(`/get_dialog_messages?token=${token}&dialog_id=${dialogId}`);
    if (resp.status === 401) { logout(); return; }
    let messages = await resp.json();
    let container = document.getElementById('chatMessagesArea');
    let wasBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50;
    let html = '';
    let privateKey = localStorage.getItem('privateKey');
    for (let m of messages) {
        let isOwn = m.from_user_id == localStorage.getItem('userId');
        let decryptedText = m.text;
        let messageId = m.id;
        if (!isOwn && m.text && privateKey && m.text.startsWith('{')) {
            try {
                decryptedText = await decryptMessage(privateKey, m.text);
            } catch(e) {
                console.error('Ошибка расшифровки сообщения', e);
                decryptedText = '🔒 Не удалось расшифровать';
            }
        } else if (isOwn && m.text && m.text.startsWith('{')) {
            let sentMessages = JSON.parse(sessionStorage.getItem('sentMessages') || '{}');
            if (sentMessages[messageId]) {
                decryptedText = sentMessages[messageId];
                delete sentMessages[messageId];
                sessionStorage.setItem('sentMessages', JSON.stringify(sentMessages));
            } else {
                decryptedText = '🔒 Ваше сообщение';
            }
        }
        let imageHtml = '';
        if (m.image && m.image.startsWith('{')) {
            if (privateKey) {
                try {
                    const decryptedBlob = await decryptFile(privateKey, m.image);
                    const imageUrl = URL.createObjectURL(decryptedBlob);
                    imageHtml = `<img src="${imageUrl}" class="message-image" onclick="window.open(this.src)">`;
                } catch(e) {
                    console.error('Ошибка расшифровки фото', e);
                    imageHtml = '<div class="message-text">🔒 Зашифрованное фото</div>';
                }
            } else {
                imageHtml = '<div class="message-text">🔒 Зашифрованное фото</div>';
            }
        } else if (m.image && !m.image.startsWith('{')) {
            imageHtml = `<img src="/uploads/${m.image}" class="message-image" onclick="window.open(this.src)">`;
        }
        html += `<div class="message ${isOwn ? 'own' : ''}">
            ${imageHtml}
            <div class="message-text">${escapeHtml(decryptedText)}</div>
            <div class="message-time">${escapeHtml(m.timestamp)}</div>
        </div>`;
    }
    if (container.innerHTML !== html) {
        container.innerHTML = html;
        if (wasBottom) container.scrollTop = container.scrollHeight;
        if (messages.length && messages[messages.length-1].from_user_id != localStorage.getItem('userId')) {
            playReceiveSound();
        }
    }
}

async function sendMessage() {
    let text = document.getElementById('messageInput').value.trim();
    if (!text || !currentDialogId || !currentCompanionId) return;
    let token = localStorage.getItem('token');
    let respPublicKey = await fetch(`/get_public_key?token=${token}&user_id=${currentCompanionId}`);
    let publicKeyData = await respPublicKey.json();
    if (!publicKeyData.public_key) {
        alert(translations[currentLang].getKeyError);
        return;
    }
    let encrypted = await encryptMessage(publicKeyData.public_key, text);
    playSendSound();
    let resp = await fetch('/send_dialog_message', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({token, dialog_id: currentDialogId, text: encrypted}) });
    if (resp.ok) {
        let result = await resp.json();
        let messageId = result.id;
        let sentMessages = JSON.parse(sessionStorage.getItem('sentMessages') || '{}');
        sentMessages[messageId] = text;
        sessionStorage.setItem('sentMessages', JSON.stringify(sentMessages));
        document.getElementById('messageInput').value = '';
        await loadMessages(currentDialogId);
        document.getElementById('chatMessagesArea').scrollTop = document.getElementById('chatMessagesArea').scrollHeight;
        loadDialogs();
    } else {
        alert(translations[currentLang].sendError);
    }
}

async function sendImage(file) {
    if (!currentDialogId || !currentCompanionId) return;
    let token = localStorage.getItem('token');
    let respPublicKey = await fetch(`/get_public_key?token=${token}&user_id=${currentCompanionId}`);
    let publicKeyData = await respPublicKey.json();
    if (!publicKeyData.public_key) {
        alert(translations[currentLang].getKeyError);
        return;
    }
    let encryptedFile = await encryptFile(publicKeyData.public_key, file);
    playSendSound();
    let resp = await fetch('/upload_encrypted_image', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({token, dialog_id: currentDialogId, encrypted_image: encryptedFile}) });
    if (resp.ok) {
        let result = await resp.json();
        let messageId = result.id;
        let sentMessages = JSON.parse(sessionStorage.getItem('sentMessages') || '{}');
        sentMessages[messageId] = '📷 Фото';
        sessionStorage.setItem('sentMessages', JSON.stringify(sentMessages));
        await loadMessages(currentDialogId);
        loadDialogs();
    } else {
        alert(translations[currentLang].imageError);
    }
}

function closeChat() {
    if (messagesPolling) clearInterval(messagesPolling);
    document.getElementById('chatWindow').style.display = 'none';
    document.getElementById('appContainer').style.display = 'flex';
    currentDialogId = null;
    loadDialogs();
}

function openAddUserModal() { document.getElementById('addUserModal').style.display = 'flex'; document.getElementById('searchUserInput').value = ''; document.getElementById('searchResultsList').innerHTML = ''; }
function closeAddUserModal() { document.getElementById('addUserModal').style.display = 'none'; }

async function searchUsersToAdd() {
    let q = document.getElementById('searchUserInput').value.trim();
    if (q.length < 2) return;
    let token = localStorage.getItem('token');
    let resp = await fetch(`/search_users_to_add?q=${encodeURIComponent(q)}&token=${token}`);
    if (resp.status === 401) { logout(); return; }
    let users = await resp.json();
    let container = document.getElementById('searchResultsList');
    if (users.length === 0) {
        container.innerHTML = `<div style="padding:10px">${translations[currentLang].noUsersFound}</div>`;
        return;
    }
    container.innerHTML = users.map(u => `<div class="user-result" onclick="addUserAndCreateDialog(${u.id}, '${escapeHtml(u.display_name)}')">
        <span style="font-size:32px">${escapeHtml(u.avatar_emoji) || '👤'}</span>
        <div><strong>${escapeHtml(u.display_name)}</strong><br><span style="font-size:12px">@${escapeHtml(u.login)}</span></div>
    </div>`).join('');
}

async function addUserAndCreateDialog(userId) {
    let token = localStorage.getItem('token');
    let resp = await fetch('/create_dialog', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({token, companion_id: userId}) });
    if (resp.ok) { closeAddUserModal(); loadDialogs(); }
    else { alert(translations[currentLang].dialogCreateError); }
}

function showInfoModalOnce() {
    if (!localStorage.getItem('infoModalShown')) {
        document.getElementById('infoModal').style.display = 'flex';
    }
}
function closeInfoModal() {
    document.getElementById('infoModal').style.display = 'none';
    localStorage.setItem('infoModalShown', 'true');
}

function addHoverSounds() { document.querySelectorAll('button, .dialog-item, .fab, .back-btn, .input-btn, .user-result').forEach(el => { el.addEventListener('mouseenter', playHoverSound); el.addEventListener('touchstart', playHoverSound); }); }
setTimeout(addHoverSounds, 500);
document.addEventListener('click', initAudio);
document.addEventListener('touchstart', initAudio);

document.querySelectorAll('button, .dialog-item, .fab, .back-btn, .input-btn, .user-result, .delete-dialog-btn, .user-menu').forEach(el => {
    el.addEventListener('touchstart', function(e) {
        this.classList.add('active-press');
        if (pressTimer) clearTimeout(pressTimer);
        pressTimer = setTimeout(() => {
            document.querySelectorAll('.active-press').forEach(btn => btn.classList.remove('active-press'));
        }, 150);
    });
    el.addEventListener('touchend', function() {
        this.classList.remove('active-press');
    });
});

const starField = document.getElementById('starField');
document.addEventListener('mousemove', (e) => { let x = (e.clientX / window.innerWidth - 0.5) * 20; let y = (e.clientY / window.innerHeight - 0.5) * 20; starField.style.transform = `translate(${-x}px, ${-y}px)`; });
document.addEventListener('touchmove', (e) => { if (e.touches[0]) { let x = (e.touches[0].clientX / window.innerWidth - 0.5) * 20; let y = (e.touches[0].clientY / window.innerHeight - 0.5) * 20; starField.style.transform = `translate(${-x}px, ${-y}px)`; } });
createStarField();

document.getElementById('sendMsgBtn').addEventListener('click', sendMessage);
document.getElementById('messageInput').addEventListener('keypress', e => { if (e.key === 'Enter') sendMessage(); });
document.getElementById('imageUpload').addEventListener('change', e => { if (e.target.files[0]) sendImage(e.target.files[0]); e.target.value = ''; });

document.getElementById('langBtn').addEventListener('click', () => {
    currentLang = currentLang === 'ru' ? 'en' : 'ru';
    updateLanguageUI();
});

document.getElementById('regPassword').addEventListener('input', function() {
    const val = this.value;
    const hint = document.getElementById('passwordStrengthHint');
    if (val.length < 5 || !/\d/.test(val)) {
        hint.style.color = '#ff6b6b';
        hint.innerText = translations[currentLang].passwordHint;
        document.getElementById('registerBtn').disabled = true;
    } else {
        hint.style.color = '#51cf66';
        hint.innerText = '✓';
        document.getElementById('registerBtn').disabled = false;
    }
});

document.getElementById('loginBtn').addEventListener('click', login);
document.getElementById('showRegisterBtn').addEventListener('click', showRegister);
document.getElementById('registerBtn').addEventListener('click', register);
document.getElementById('showLoginBtn').addEventListener('click', showLogin);

if (localStorage.getItem('token')) {
    document.getElementById('authContainer').style.display = 'none';
    document.getElementById('appContainer').style.display = 'flex';
    let login = localStorage.getItem('login');
    if (login) document.getElementById('userLoginDisplay').innerText = login;
    loadDialogs();
    dialogsPolling = setInterval(loadDialogs, 3000);
    onlinePolling = setInterval(updateOnlineStatus, 25000);
    updateOnlineStatus();
}

window.addEventListener('load', showInfoModalOnce);
updateLanguageUI();