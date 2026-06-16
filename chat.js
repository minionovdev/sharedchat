// chat.js — вся логика общего чата на GUN.js
(function() {
  // Подключаем GUN (децентрализованная БД)
  const gun = Gun({
    peers: ['https://gun-manhattan.herokuapp.com/gun']
  });

  // Хранилище профилей
  const usersDB = gun.get('users');
  // Общий чат
  const publicDB = gun.get('public_messages');

  let currentUser = null;
  let usersCache = {};   // nickname -> userData

  const $ = id => document.getElementById(id);
  const regModal = $('reg-modal');
  const regNick = $('reg-nick');
  const regError = $('reg-error');
  const regBtn = $('reg-btn');
  const mainUi = $('main-ui');
  const selfBadge = $('self-badge');
  const selfAvatar = $('self-avatar');
  const selfNick = $('self-nick');
  const editProfileBtn = $('edit-profile-btn');
  const logoutBtn = $('logout-btn');
  const editProfileModal = $('edit-profile-modal');
  const editAvatarUrl = $('edit-avatar-url');
  const editNick = $('edit-nick');
  const editError = $('edit-error');
  const saveProfileBtn = $('save-profile');
  const cancelEditBtn = $('cancel-edit');
  const profileModal = $('profile-modal');
  const profileAvatar = $('profile-avatar');
  const profileNick = $('profile-nick');
  const closeProfileBtn = $('close-profile');
  const tabs = document.querySelectorAll('.tab');
  const publicPanel = $('public-panel');
  const privatePanel = $('private-panel');
  const publicMessagesDiv = $('public-messages');
  const publicInput = $('public-input');
  const publicSend = $('public-send');
  const privateRecipient = $('private-recipient');
  const openPrivateBtn = $('open-private-btn');
  const privateHeader = $('private-header');
  const privateMessagesDiv = $('private-messages');
  const privateInputRow = $('private-input-row');
  const privateInput = $('private-input');
  const privateSend = $('private-send');
  const usersCountSpan = $('users-count');
  const messagesCountSpan = $('messages-count');

  // Фильтр контента
  const forbidden = [
    /https?:\/\//i, /www\./i, /\.ru\b/i, /\.com\b/i, /\.net\b/i, /\.org\b/i,
    /реклама/i, /купить/i, /продам/i, /заработок/i, /casino/i, /ставки/i,
    /порно/i, /секс/i, /xxx/i, /трах/i, /интим/i, /проститут/i, /наркотик/i, /психотроп/i
  ];
  function isAllowed(text) { return !forbidden.some(p => p.test(text)); }
  function escapeHtml(s) {
    const map = { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' };
    return String(s).replace(/[&<>"']/g, c => map[c]);
  }
  function genUID() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  // Подписка на пользователей (для подсчёта и кэша)
  usersDB.map().on((data, nickname) => {
    if (data && nickname !== '_') {
      usersCache[nickname] = data;
    }
    updateUsersCount();
  });

  function updateUsersCount() {
    const count = Object.keys(usersCache).length;
    usersCountSpan.textContent = count;
  }

  // Подписка на сообщения (для отображения и подсчёта)
  publicDB.map().on((msg, id) => {
    if (msg && msg.text) {
      displayPublicMessage(msg, id);
    }
    updateMessagesCount();
  });

  function updateMessagesCount() {
    let count = 0;
    publicDB.map().once((data) => {
      if (data && data.text) count++;
    });
    setTimeout(() => {
      let c = 0;
      publicDB.map().once((d) => { if (d && d.text) c++; });
      messagesCountSpan.textContent = c;
    }, 100);
  }

  // Регистрация
  function register() {
    const nick = regNick.value.trim();
    if (!nick || nick.length < 2) { regError.textContent = 'Минимум 2 символа'; return; }
    if (usersCache[nick]) { regError.textContent = 'Ник занят'; return; }
    const userId = genUID();
    const userData = { userId, nickname: nick, avatar: '' };
    usersDB.get(nick).put(userData);
    currentUser = userData;
    localStorage.setItem('gchat_user', JSON.stringify(currentUser));
    showMain();
  }

  function autoLogin() {
    const saved = localStorage.getItem('gchat_user');
    if (saved) {
      try {
        currentUser = JSON.parse(saved);
        usersDB.get(currentUser.nickname).put(currentUser);
        return true;
      } catch(e) {}
    }
    return false;
  }

  function logout() {
    localStorage.removeItem('gchat_user');
    currentUser = null;
    privateChatWith = null;
    hideMain();
  }

  // Профили
  function showProfile(user) {
    profileAvatar.src = user.avatar || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Ccircle cx="50" cy="50" r="50" fill="%233a3a4e"/%3E%3Ctext x="50" y="65" font-size="40" text-anchor="middle" fill="white"%3E👤%3C/text%3E%3C/svg%3E';
    profileNick.textContent = user.nickname;
    profileModal.classList.remove('hidden');
  }

  function openEditProfile() {
    editAvatarUrl.value = currentUser.avatar || '';
    editNick.value = currentUser.nickname || '';
    editError.textContent = '';
    editProfileModal.classList.remove('hidden');
  }

  async function saveProfile() {
    const newNick = editNick.value.trim();
    const newAvatar = editAvatarUrl.value.trim();
    if (!newNick || newNick.length < 2) { editError.textContent = 'Ник не может быть пустым'; return; }
    if (newNick !== currentUser.nickname && usersCache[newNick]) {
      editError.textContent = 'Ник занят другим пользователем.';
      return;
    }
    if (newNick !== currentUser.nickname) {
      usersDB.get(currentUser.nickname).put(null);
    }
    currentUser.nickname = newNick;
    currentUser.avatar = newAvatar;
    usersDB.get(newNick).put(currentUser);
    localStorage.setItem('gchat_user', JSON.stringify(currentUser));
    updateSelfUI();
    editProfileModal.classList.add('hidden');
  }

  function updateSelfUI() {
    selfNick.textContent = currentUser.nickname;
    selfAvatar.src = currentUser.avatar || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Ccircle cx="50" cy="50" r="50" fill="%233a3a4e"/%3E%3Ctext x="50" y="65" font-size="40" text-anchor="middle" fill="white"%3E👤%3C/text%3E%3C/svg%3E';
  }

  // Общий чат
  function displayPublicMessage(msg, id) {
    if (document.querySelector(`.message[data-id="${id}"]`)) return;
    const div = document.createElement('div');
    div.className = 'message' + (currentUser && msg.userId === currentUser.userId ? ' own' : '');
    div.dataset.id = id;
    const time = new Date(msg.createdAt).toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'});
    div.innerHTML = `
      <div class="msg-head">
        <span class="msg-nick" data-userid="${msg.userId}">${escapeHtml(msg.nickname)}</span>
        <span class="msg-time">${time}</span>
      </div>
      <div class="msg-text">${escapeHtml(msg.text)}</div>
      <div class="reactions">
        ${['👍','👎','❤️','😂','😮','😢'].map(e => `<span class="reaction" data-emoji="${e}" data-msgid="${id}">${e} ${(msg.reactions && msg.reactions[e]) || 0}</span>`).join('')}
      </div>
    `;
    div.querySelector('.msg-nick').addEventListener('click', (e) => {
      const uid = e.target.dataset.userid;
      const user = Object.values(usersCache).find(u => u.userId === uid);
      if (user) showProfile(user);
    });
    div.querySelectorAll('.reaction').forEach(btn => {
      btn.addEventListener('click', () => {
        const emoji = btn.dataset.emoji;
        const msgId = btn.dataset.msgid;
        gun.get('public_messages').get(msgId).get('reactions').get(emoji).once(count => {
          const newCount = (count || 0) + 1;
          gun.get('public_messages').get(msgId).get('reactions').get(emoji).put(newCount);
        });
      });
    });
    publicMessagesDiv.appendChild(div);
    scrollToBottom(publicMessagesDiv);
  }

  function sendPublicMessage() {
    const text = publicInput.value.trim();
    if (!text || !currentUser) return;
    if (!isAllowed(text)) { alert('Запрещённый контент'); return; }
    const msgId = genUID();
    const msg = {
      userId: currentUser.userId,
      nickname: currentUser.nickname,
      avatar: currentUser.avatar,
      text: text,
      createdAt: new Date().toISOString(),
      reactions: { '👍': 0, '👎': 0, '❤️': 0, '😂': 0, '😮': 0, '😢': 0 }
    };
    publicDB.get(msgId).put(msg);
    publicInput.value = '';
  }

  // Личные сообщения
  let privateChatWith = null;
  function openPrivateChat(nick) {
    if (!currentUser) return;
    const nickClean = nick.trim();
    if (!nickClean) { alert('Введите ник'); return; }
    if (nickClean === currentUser.nickname) { alert('Нельзя писать себе'); return; }
    const user = usersCache[nickClean];
    if (!user) { alert('Пользователь не найден'); return; }
    privateChatWith = user;
    privateHeader.textContent = `Чат с @${user.nickname}`;
    privateHeader.classList.remove('hidden');
    privateInputRow.classList.remove('hidden');
    privateMessagesDiv.innerHTML = '';
    loadPrivateMessages();
    switchTab('private');
  }

  function loadPrivateMessages() {
    if (!privateChatWith || !currentUser) return;
    const convoId = getConversationId(currentUser.userId, privateChatWith.userId);
    gun.get('private_messages').get(convoId).map().on((msg, id) => {
      if (msg && msg.text) {
        displayPrivateMessage(msg, id);
      }
    });
  }

  function getConversationId(uid1, uid2) {
    return [uid1, uid2].sort().join('_');
  }

  function displayPrivateMessage(msg, id) {
    if (document.querySelector(`.message[data-id="${id}"]`)) return;
    const div = document.createElement('div');
    div.className = 'message' + (currentUser && msg.fromId === currentUser.userId ? ' own' : '');
    div.dataset.id = id;
    const time = new Date(msg.createdAt).toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'});
    div.innerHTML = `
      <div class="msg-head">
        <span class="msg-nick" data-userid="${msg.fromId}">${escapeHtml(msg.fromNick)}</span>
        <span class="msg-time">${time}</span>
      </div>
      <div class="msg-text">${escapeHtml(msg.text)}</div>
      <div class="reactions">
        ${['👍','👎','❤️','😂','😮','😢'].map(e => `<span class="reaction" data-emoji="${e}" data-msgid="${id}">${e} ${(msg.reactions && msg.reactions[e]) || 0}</span>`).join('')}
      </div>
    `;
    div.querySelector('.msg-nick').addEventListener('click', (e) => {
      const uid = e.target.dataset.userid;
      const user = Object.values(usersCache).find(u => u.userId === uid);
      if (user) showProfile(user);
    });
    div.querySelectorAll('.reaction').forEach(btn => {
      btn.addEventListener('click', () => {
        const emoji = btn.dataset.emoji;
        const msgId = btn.dataset.msgid;
        if (privateChatWith) {
          const convoId = getConversationId(currentUser.userId, privateChatWith.userId);
          gun.get('private_messages').get(convoId).get(msgId).get('reactions').get(emoji).once(count => {
            const newCount = (count || 0) + 1;
            gun.get('private_messages').get(convoId).get(msgId).get('reactions').get(emoji).put(newCount);
          });
        }
      });
    });
    privateMessagesDiv.appendChild(div);
    scrollToBottom(privateMessagesDiv);
  }

  function sendPrivateMessage() {
    const text = privateInput.value.trim();
    if (!text || !currentUser || !privateChatWith) return;
    if (!isAllowed(text)) { alert('Запрещённый контент'); return; }
    const convoId = getConversationId(currentUser.userId, privateChatWith.userId);
    const msgId = genUID();
    const msg = {
      fromId: currentUser.userId,
      fromNick: currentUser.nickname,
      toId: privateChatWith.userId,
      text: text,
      createdAt: new Date().toISOString(),
      reactions: { '👍': 0, '👎': 0, '❤️': 0, '😂': 0, '😮': 0, '😢': 0 }
    };
    gun.get('private_messages').get(convoId).get(msgId).put(msg);
    privateInput.value = '';
  }

  // Переключение вкладок
  let activeTab = 'public';
  function switchTab(tab) {
    activeTab = tab;
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    publicPanel.classList.toggle('hidden', tab !== 'public');
    privatePanel.classList.toggle('hidden', tab !== 'private');
  }

  function scrollToBottom(container) {
    container.scrollTop = container.scrollHeight;
  }

  // Инициализация
  function showMain() {
    regModal.classList.add('hidden');
    mainUi.classList.remove('hidden');
    updateSelfUI();
    switchTab('public');
  }

  function hideMain() {
    mainUi.classList.add('hidden');
    regModal.classList.remove('hidden');
    regNick.value = '';
    regError.textContent = '';
  }

  tabs.forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
  regBtn.addEventListener('click', register);
  regNick.addEventListener('keypress', e => { if(e.key==='Enter') register(); });
  publicSend.addEventListener('click', sendPublicMessage);
  publicInput.addEventListener('keypress', e => { if(e.key==='Enter') sendPublicMessage(); });
  openPrivateBtn.addEventListener('click', () => openPrivateChat(privateRecipient.value));
  privateRecipient.addEventListener('keypress', e => { if(e.key==='Enter') openPrivateChat(privateRecipient.value); });
  privateSend.addEventListener('click', sendPrivateMessage);
  privateInput.addEventListener('keypress', e => { if(e.key==='Enter') sendPrivateMessage(); });
  logoutBtn.addEventListener('click', logout);
  editProfileBtn.addEventListener('click', openEditProfile);
  saveProfileBtn.addEventListener('click', saveProfile);
  cancelEditBtn.addEventListener('click', () => editProfileModal.classList.add('hidden'));
  closeProfileBtn.addEventListener('click', () => profileModal.classList.add('hidden'));
  selfBadge.addEventListener('click', () => showProfile(currentUser));

  if (autoLogin()) {
    showMain();
  } else {
    hideMain();
  }

  // Периодическое обновление счетчиков
  setInterval(updateMessagesCount, 5000);
})();
