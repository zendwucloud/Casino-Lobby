// ==========================================
// 🧠 Casino Lobby - 核心邏輯引擎 (lobbyEngine.js)
// ==========================================
import { LobbyConfig } from './lobbyConfig.js';

// --- 1. Firebase Initialization ---
if (!firebase.apps.length) {
    firebase.initializeApp(LobbyConfig.firebase);
}
const db = firebase.database();

firebase.auth().signInAnonymously()
    .then(() => console.log("Firebase 匿名認證成功"))
    .catch((error) => console.error("Firebase 認證失敗:", error.code, error.message));


// --- 2. 狀態與全域變數 ---
let currentUser = null;
let myUserId = localStorage.getItem('casino_firebase_uid');
let guestSessionId = sessionStorage.getItem('casino_guest_id');
let currentMailsCache = [];


// --- 3. 音效控制器 (LobbyAudio) ---
const LobbyAudio = {
    bgm: document.getElementById('bgm_lobby'),
    sfxClick: document.getElementById('sfx_click'),
    sfxTake: document.getElementById('sfx_take'),   
    sfxMoney: document.getElementById('sfx_money'), 
    isMuted: false, hasInteracted: false, isFading: false, 

    init: function() {
        const savedMute = localStorage.getItem('lobby_mute');
        if (savedMute === 'true') {
            this.isMuted = true;
            const toggle = document.getElementById('bgm-toggle');
            if(toggle) toggle.checked = false;
        }
        
        if(this.bgm) this.bgm.volume = 0.5;
        if(this.sfxClick) this.sfxClick.volume = 1.0;
        if(this.sfxTake) this.sfxTake.volume = 1.0;   
        if(this.sfxMoney) this.sfxMoney.volume = 1.0; 

        document.body.addEventListener('pointerdown', () => { 
            if (!this.hasInteracted) {
                this.hasInteracted = true;
                this.playBGM();
            }
        }, { once: true });
        
        const toggle = document.getElementById('bgm-toggle');
        if(toggle) { toggle.addEventListener('change', (e) => this.toggleMute(!e.target.checked)); }

        if(this.bgm) {
             var promise = this.bgm.play();
             if (promise !== undefined) { promise.catch(e => console.log("Autoplay prevented by browser policy.")); }
        }

        this.bgm.addEventListener('timeupdate', () => {
            if(this.isFading) return; 
            if(!this.bgm.duration) return;
            const timeLeft = this.bgm.duration - this.bgm.currentTime;
            if(timeLeft <= 5) this.bgm.volume = Math.max(0, timeLeft / 5 * 0.5); 
            else if (this.bgm.volume < 0.5 && !this.isMuted) this.bgm.volume = 0.5;
        });
    },
    fadeOut: function() {
        if(!this.bgm) return;
        this.isFading = true;
        let safetyCounter = 20; 
        if(this.fadeInterval) clearInterval(this.fadeInterval);
        this.fadeInterval = setInterval(() => {
            if (this.bgm.volume > 0.05) try { this.bgm.volume -= 0.05; } catch(e) {}
            safetyCounter--;
            if (this.bgm.volume <= 0.05 || safetyCounter <= 0) {
                this.bgm.pause(); this.bgm.volume = 0.5; 
                clearInterval(this.fadeInterval); this.isFading = false;
            }
        }, 50); 
    },
    playBGM: function() {
        if (!this.isMuted && this.bgm) {
            this.isFading = true;
            try { this.bgm.volume = 0; } catch(e) {} 
            this.bgm.play().catch(e => console.log("Waiting interaction..."));
            if(this.fadeInterval) clearInterval(this.fadeInterval);
            let safetyCounter = 20;
            this.fadeInterval = setInterval(() => {
                if (this.bgm.volume < 0.5) try { this.bgm.volume += 0.05; } catch(e) {}
                safetyCounter--;
                if (this.bgm.volume >= 0.5 || safetyCounter <= 0) {
                    try { if(this.bgm.volume < 0.5) this.bgm.volume = 0.5; } catch(e) {}
                    clearInterval(this.fadeInterval); this.isFading = false;
                }
            }, 50);
        }
    },
    playClick: function() { if (!this.isMuted && this.sfxClick) { this.sfxClick.currentTime = 0; this.sfxClick.play().catch(()=>{}); } },
    playTake: function() { if (!this.isMuted && this.sfxTake) { this.sfxTake.currentTime = 0; this.sfxTake.play().catch(()=>{}); } },
    playMoney: function() { if (!this.isMuted && this.sfxMoney) { this.sfxMoney.currentTime = 0; this.sfxMoney.play().catch(()=>{}); } },
    toggleMute: function(muteState) {
        this.isMuted = muteState; localStorage.setItem('lobby_mute', muteState);
        if (muteState) { if(this.bgm) this.bgm.pause(); } 
        else { if(this.bgm && this.hasInteracted) this.bgm.play(); }
    }
};


// --- 4. 會員與驗證邏輯 (綁定為全域函數供 HTML 呼叫) ---
function initUser() {
    localStorage.removeItem('casino_firebase_uid');
    sessionStorage.removeItem('casino_guest_id');
    setTimeout(() => { document.getElementById('auth-modal').classList.add('active'); }, 800); 
} 

window.doLogin = function() {
    const name = document.getElementById('auth-name').value.trim();
    const pass = document.getElementById('auth-pass').value.trim();
    if(!name || !pass) { alert("請輸入帳號與密碼"); return; }

    db.ref('players').orderByChild('name').equalTo(name).once('value', (snapshot) => {
        if (snapshot.exists()) {
            let foundUser = false;
            snapshot.forEach(child => {
                const userData = child.val();
                if (userData.password === pass) {
                    foundUser = true; myUserId = child.key;
                    localStorage.setItem('casino_firebase_uid', myUserId);
                    sessionStorage.removeItem('casino_guest_id'); 
                    currentUser = userData;
                    document.getElementById('auth-modal').classList.remove('active');
                    updateUserUI(); startTickerListener(); listenUserData();
                    alert("歡迎回來，" + userData.name + "！");
                }
            });
            if (!foundUser) alert("密碼錯誤！");
        } else { alert("找不到此帳號，請先註冊。"); }
    });
}

window.doGuestLogin = function() {
    const guestId = 'guest_' + Date.now();
    const guestUser = { name: "Guest", balance: 10000, vip: 0, isGuest: true };
    db.ref('players/' + guestId).set(guestUser, (error) => {
        if(!error) {
            sessionStorage.setItem('casino_guest_id', guestId);
            myUserId = guestId; currentUser = guestUser;
            db.ref('players/' + guestId).onDisconnect().remove();
            document.getElementById('auth-modal').classList.remove('active');
            updateUserUI(); startTickerListener(); listenUserData();
            alert("已進入訪客模式\n(注意：關閉分頁或重整將會清除資料)");
        }
    });
}

window.doRegister = function() {
    const name = document.getElementById('auth-name').value.trim();
    const pass = document.getElementById('auth-pass').value.trim();
    if(!name || !pass) { alert("請輸入帳號與密碼"); return; }

    db.ref('players').orderByChild('name').equalTo(name).once('value', (snapshot) => {
        if (snapshot.exists()) { alert("這個暱稱已經有人使用了，請換一個！"); return; }
        const newId = 'user_' + Date.now();
        const newUser = { name: name, password: pass, balance: 100000, vip: 1, exp: 0, joinedAt: Date.now(), lastLoginDate: 0, loginStreak: 0 };
        db.ref('players/' + newId).set(newUser, (error) => {
            if (error) alert("註冊失敗：" + error.message);
            else {
                alert("註冊成功！獲得體驗金 100,000");
                myUserId = newId; localStorage.setItem('casino_firebase_uid', myUserId);
                sessionStorage.removeItem('casino_guest_id'); currentUser = newUser;
                document.getElementById('auth-modal').classList.remove('active');
                updateUserUI(); startTickerListener(); listenUserData();
            }
        });
    });
}

window.logout = function() {
    if(confirm("確定要登出嗎？")) {
        if (currentUser && currentUser.isGuest) {
            db.ref('players/' + myUserId).remove().then(() => {
                localStorage.removeItem('casino_firebase_uid'); sessionStorage.removeItem('casino_guest_id');
                location.reload();
            });
        } else {
            localStorage.removeItem('casino_firebase_uid');
            const guestId = 'guest_' + Date.now();
            db.ref('players/' + guestId).set({ name: "Guest", balance: 10000, vip: 0, isGuest: true }).then(() => {
                sessionStorage.setItem('casino_guest_id', guestId); location.reload(); 
            });
        }
    }
}


// --- 5. 獎勵系統 (簽到、信箱、送禮) ---
window.claimDaily = function(element, amount) { 
    if(currentUser.isGuest) { alert("訪客無法使用獎勵功能"); return; }
    if(element.classList.contains('claimed') || element.classList.contains('normal')) return; 

    const today = new Date().setHours(0,0,0,0);
    let streak = currentUser.loginStreak || 0;
    const lastDate = currentUser.lastLoginDate || 0;
    if (today - lastDate > 86400000 && lastDate !== 0) streak = 0; 
    streak++; 
    
    // 從 Config 讀取獎勵
    let baseBonus = LobbyConfig.rewards.baseDaily;
    let vipBonus = (currentUser.vip || 1) * LobbyConfig.rewards.vipDailyBonus; 
    let bonus = baseBonus + vipBonus;
    let msg = `🎉 簽到成功！獲得 ${bonus.toLocaleString()} 金幣\n(VIP加成: ${vipBonus})`;

    if (streak >= 7) {
        bonus = LobbyConfig.rewards.day7Base + vipBonus;
        streak = 0; msg = `🔥 連續簽到 7 天！獲得大獎 ${bonus.toLocaleString()} 金幣！`;
    }

    db.ref('players/' + myUserId).update({ balance: (currentUser.balance || 0) + bonus, lastLoginDate: today, loginStreak: streak })
    .then(() => { LobbyAudio.playTake(); alert(msg); renderRewards(); updateUserUI(); });
}

function renderRewards() {
    const container = document.getElementById('daily-grid-container');
    if(!container || !currentUser) return;
    container.innerHTML = ''; 
    let streak = currentUser.loginStreak || 0;
    const lastDate = currentUser.lastLoginDate || 0;
    const today = new Date().setHours(0,0,0,0);
    const claimedToday = (lastDate === today);
    if (today - lastDate > 86400000 && lastDate !== 0) streak = 0; 

    for(let i=1; i<=7; i++) {
        let stateClass = 'normal'; 
        if (i <= streak) stateClass = 'claimed';
        else if (i === streak + 1) stateClass = claimedToday ? 'normal' : 'active';
        
        let valText = (i === 7) ? '100,000' : '10,000';
        let imgHtml = (i === 7) ? '<img src="events.png" class="day-coin-img" style="width: 15%; opacity:0.8">' : '<img src="gold.png" class="day-coin-img">';
        let div = document.createElement('div');
        div.className = `day-box ${i===7?'day-7':''} ${stateClass}`;
        div.innerHTML = `<span class="day-num">${i===7?'Day 7 - MEGA BOX':`Day ${i}`}</span>${imgHtml}<span class="day-val">${valText}</span>`;
        if(stateClass === 'active') div.onclick = function() { window.claimDaily(this, 0); };
        container.appendChild(div);
    }
}

function getSystemMails() {
    const deletedMap = currentUser ? (currentUser.deleted_sys_mails || {}) : {};
    return LobbyConfig.systemMails.filter(m => !deletedMap[m.id]);
}

function initMailboxListener() {
    if(!myUserId) return;
    db.ref('players/' + myUserId + '/mailbox').on('value', (snapshot) => {
        const mails = [];
        snapshot.forEach(child => { mails.push({ id: child.key, ...child.val() }); });
        const allMails = [...getSystemMails(), ...mails].sort((a, b) => b.date - a.date);
        currentMailsCache = allMails; renderMailList(allMails);
    });
}

function renderMailList(mails) {
    const container = document.getElementById('mail-list-container');
    container.innerHTML = '';
    if (mails.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:#666; margin-top:20px;">暫無信件</div>';
        updateMailTabCount(0); return;
    }
    let unreadCount = 0;
    mails.forEach(mail => {
        let isRead = mail.isRead;
        if(mail.type === 'system' && currentUser && currentUser.claimed_sys_mails && currentUser.claimed_sys_mails[mail.id]) isRead = true;
        if (!isRead) unreadCount++;

        const div = document.createElement('div');
        div.className = `mail-item ${isRead ? 'read' : 'unread'}`;
        let icon = mail.type === 'gift' ? '💰' : (mail.type === 'system' ? (mail.reward ? '🎁' : '🔥') : '✉️');

        div.innerHTML = `
            <div class="mail-content-wrapper" onclick="openMail('${mail.id}')">
                <div class="mail-icon">${icon}</div>
                <div class="mail-info"><div class="mail-title">${mail.title}</div><div class="mail-date">${new Date(mail.date).toLocaleDateString()}</div></div>
                <div class="mail-status">${isRead ? '已讀' : '未讀'}</div>
            </div>
            <div class="mail-delete-btn" onclick="deleteMail('${mail.id}', '${mail.type}')">🗑️</div>
        `;
        container.appendChild(div);
    });
    updateMailTabCount(unreadCount);
}

window.openMail = function(id) {
    let mail = currentMailsCache.find(m => m.id === id);
    if (!mail && currentUser.mailbox) { mail = currentUser.mailbox[id]; if (mail) mail.id = id; }
    if (!mail) return; 
    let msg = `${mail.title}\n\n${mail.content}`;
    
    if (mail.type === 'system') {
        if (!(currentUser.claimed_sys_mails && currentUser.claimed_sys_mails[id])) {
            const updates = { balance: (currentUser.balance || 0) + mail.reward, ['claimed_sys_mails/' + id]: true };
            db.ref('players/' + myUserId).update(updates).then(() => {
                if (mail.reward > 0) { LobbyAudio.playTake(); alert(msg + `\n\n(已領取附件: ${mail.reward} 金幣)`); } else alert(msg);
            });
        } else { alert(msg + "\n\n(已讀/已領取)"); }
    } else if (mail.type === 'gift') {
        if (mail.claimed) { alert(msg + "\n\n(已領取)"); } 
        else {
            db.ref('players/' + myUserId).update({ balance: (currentUser.balance || 0) + mail.reward, ['mailbox/' + id + '/claimed']: true, ['mailbox/' + id + '/isRead']: true }).then(() => {
                LobbyAudio.playTake(); alert(msg + `\n\n(已領取附件: ${mail.reward} 金幣)`);
            });
        }
    } else {
        if(!mail.isRead) db.ref('players/' + myUserId + '/mailbox/' + id).update({ isRead: true });
        alert(msg);
    }
};

window.deleteMail = function(id, type) {
    if(!confirm("確定要刪除這封信嗎？")) return;
    if (type === 'system') db.ref('players/' + myUserId + '/deleted_sys_mails/' + id).set(true);
    else db.ref('players/' + myUserId + '/mailbox/' + id).remove();
}

function updateMailTabCount(count) {
    const mailTabBtn = document.querySelectorAll('.r-tab-btn')[1]; 
    if (mailTabBtn) mailTabBtn.innerText = count > 0 ? `信箱 (${count})` : "信箱";
}

window.toggleComposeView = function(show) {
    document.querySelector('#view-compose').classList.toggle('active', show);
    document.querySelector('#view-mail').classList.toggle('active', !show);
}

window.sendUserMail = function() {
    const toName = document.getElementById('compose-to').value.trim();
    const content = document.getElementById('compose-msg').value.trim();
    if(!toName || !content) { alert("請填寫收件人和內容"); return; }
    if(toName === currentUser.name) { alert("不能寄給自己"); return; }
    db.ref('players').orderByChild('name').equalTo(toName).once('value', (snapshot) => {
        if (snapshot.exists()) {
            let receiverId = Object.keys(snapshot.val())[0];
            db.ref('players/' + receiverId + '/mailbox').push({ title: `來自 ${currentUser.name} 的訊息`, content: content, date: Date.now(), isRead: false, type: 'user', sender: currentUser.name }).then(() => {
                alert("信件已發送！"); toggleComposeView(false); document.getElementById('compose-to').value = ''; document.getElementById('compose-msg').value = '';
            });
        } else alert("找不到該玩家");
    });
}

window.sendGift = function() {
    if(currentUser.isGuest) { alert("訪客無法使用送禮功能"); return; }
    const receiverInput = document.querySelector('#view-gift .gift-input[type="text"]');
    const amount = parseInt(document.querySelector('#view-gift .gift-input:not([type="text"])').value.replace(/[^0-9]/g, ''));
    if (!receiverInput.value.trim() || currentUser.balance < amount || receiverInput.value.trim() === currentUser.name) { alert("輸入錯誤或餘額不足"); return; }

    db.ref('players').orderByChild('name').equalTo(receiverInput.value.trim()).once('value', (snapshot) => {
        if (snapshot.exists()) {
            let receiverId = Object.keys(snapshot.val())[0];
            db.ref('players/' + myUserId + '/balance').transaction((curr) => (curr >= amount ? curr - amount : curr), (error, comm) => {
                if (comm) {
                    db.ref('players/' + receiverId + '/mailbox').push({ title: "💰 好友贈禮", content: `玩家 ${currentUser.name} 贈送給您 ${amount.toLocaleString()} 金幣！\n請點擊領取。`, reward: amount, date: Date.now(), isRead: false, type: 'gift', sender: currentUser.name, claimed: false });
                    LobbyAudio.playMoney(); alert(`成功發送 ${amount.toLocaleString()} 金幣！`); receiverInput.value = ''; 
                } else alert("交易失敗");
            });
        } else alert("找不到玩家");
    });
}


// --- 6. UI 與資料綁定邏輯 ---
function listenUserData() {
    if(!myUserId) return;
    db.ref('players/' + myUserId).on('value', (snapshot) => {
        if(snapshot.val()) { currentUser = snapshot.val(); updateUserUI(); initMailboxListener(); } 
        else location.reload();
    });
}

function startTickerListener() {
    db.ref('system/ticker').on('value', (snapshot) => {
        const msg = snapshot.val();
        if(msg) {
            showGhostTicker(msg);
            const gameFrame = document.getElementById('game-frame');
            if (gameFrame && gameFrame.contentWindow) gameFrame.contentWindow.postMessage({ type: 'tickerMessage', msg: msg }, '*');
        }
    });
}

function showGhostTicker(msg) {
    const ticker = document.getElementById('ghost-ticker');
    const text = document.getElementById('ticker-text');
    text.innerText = msg; text.style.animation = 'none'; ticker.offsetHeight; 
    ticker.classList.add('active');
    setTimeout(() => { text.style.animation = 'scrollText 10s linear forwards'; }, 100);
    setTimeout(() => { ticker.classList.remove('active'); }, 10000);
}

function updateUserUI() {
    if(!currentUser) return;
    document.querySelector('.coin-number').innerText = currentUser.balance.toLocaleString('en-US', {minimumFractionDigits: 2});
    document.querySelector('.p-name').innerText = currentUser.name;
    document.querySelector('.p-id').innerText = "ID: " + currentUser.name;
    document.querySelector('.w-balance').innerText = "當前餘額: " + currentUser.balance.toLocaleString('en-US', {minimumFractionDigits: 2});
    
    const formatDate = (ts) => !ts ? "---" : new Date(ts).toLocaleDateString();
    if(document.getElementById('stat-join-date')) {
        document.getElementById('stat-join-date').innerText = formatDate(currentUser.joinedAt);
        document.getElementById('stat-last-levelup').innerText = formatDate(currentUser.lastLevelUpDate);
        document.getElementById('stat-today').innerText = formatDate(Date.now());
        document.getElementById('stat-fav-game').innerText = "Dragon's Treasure"; 
        document.getElementById('stat-last-game').innerText = "Dragon's Treasure";
        document.getElementById('stat-total-spins').innerText = (currentUser.totalSpins || 0).toLocaleString();
    }

    const avatarImg = document.querySelector('.avatar-img');
    const vipText = document.querySelector('.vip-text');
    const profileAvatar = document.querySelector('.p-avatar');

    if (currentUser.isGuest) {
        avatarImg.src = 'guest.png'; avatarImg.style.borderColor = '#999'; 
        vipText.innerText = "GUEST"; vipText.style.color = '#999'; 
        if(profileAvatar) { profileAvatar.src = 'guest.png'; profileAvatar.style.borderColor = '#999'; }
        document.querySelector('.vip-fill').style.width = '0%';
    } else {
        avatarImg.src = 'player.png'; avatarImg.style.borderColor = '#ffd700'; 
        vipText.innerText = "VIP." + currentUser.vip; vipText.style.color = '#f4d06f'; 
        if(profileAvatar) { profileAvatar.src = 'player.png'; profileAvatar.style.borderColor = '#ffd700'; }

        // 使用 Config 計算經驗條
        let currentVip = currentUser.vip || 1;
        let percent = ((currentUser.exp || 0) / (currentVip * LobbyConfig.rewards.expBaseMultiplier)) * 100;
        document.querySelector('.vip-fill').style.width = Math.min(percent, 100) + '%';
        const vipLabels = document.querySelectorAll('.vip-labels span');
        if(vipLabels.length >= 2) { vipLabels[0].innerText = "VIP." + currentVip; vipLabels[1].innerText = "VIP." + (currentVip + 1); }
    }

    const authItem = document.getElementById('opt-auth-item');
    if (authItem) authItem.innerHTML = currentUser.isGuest ? '<span class="opt-icon">🔐</span> 登入帳號' : '<span class="opt-icon">👋</span> 登出帳號';
}

// --- 7. 遊玩清單與經驗值計算 ---
// --- 7. 遊玩清單與經驗值計算 ---
async function initDynamicGameList() {
    const mainContainer = document.querySelector('.main-scroll-area');
    const slotsContainer = document.querySelector('.slots-grid');
    let gamesConfig = null;
    
    try { 
        let snapshot = await db.ref('system/games').once('value');
        gamesConfig = snapshot.val();
    } catch(e) { 
        console.warn("Firebase 讀取遊戲列表失敗", e); 
        return;
    }

    // 如果 Firebase 裡面真的沒資料，就顯示一行提示，不要塞假資料
    if (!gamesConfig) {
        mainContainer.innerHTML = '<div style="color:#888; text-align:center; padding:50px; font-size: 2vh;">伺服器連接中或目前尚無遊戲...</div>';
        return;
    }

    let gamesArray = Object.entries(gamesConfig).map(([id, data]) => ({ id, ...data })).sort((a, b) => (a.order || 99) - (b.order || 99));

    const launchGame = (e, targetUrl) => {
        e.stopPropagation(); 
        document.querySelectorAll('.dashboard-panel').forEach(p => p.classList.remove('active'));
        document.querySelector('.main-scroll-area').classList.add('hidden'); 
        LobbyAudio.playClick(); LobbyAudio.fadeOut();
        if(e.currentTarget.closest('.game-card')) e.currentTarget.closest('.game-card').classList.add('launching');
        
        const overlay = document.getElementById('transition-overlay');
        const gameContainer = document.getElementById('game-container');
        setTimeout(() => {
            overlay.classList.add('active'); 
            setTimeout(() => {
                let iframe = document.createElement('iframe');
                iframe.id = "game-frame"; iframe.src = targetUrl; iframe.allow = "autoplay; fullscreen";
                if(document.getElementById('game-frame')) document.getElementById('game-frame').remove();
                gameContainer.appendChild(iframe); gameContainer.style.display = 'block';
                
                iframe.onload = () => { 
                    if(currentUser) {
                        iframe.contentWindow.postMessage({ type: 'initBalance', value: currentUser.balance }, '*');
                        iframe.contentWindow.postMessage({ type: 'updateSettings', music: document.getElementById('bgm-toggle').checked, sfx: document.getElementById('sfx-toggle').checked }, '*');
                    }
                    setTimeout(() => overlay.classList.remove('active'), 300); 
                };
                setTimeout(() => { if(overlay.classList.contains('active')) overlay.classList.remove('active'); }, 1500);
            }, 500); 
        }, 400);
    };

    gamesArray.forEach((game, index) => {
        if (game.active === false || game.status === 'hidden') return;
        const iconUrl = game.icon || 'placeholder.png';
        const isOnline = game.status === 'online' && game.url;

        const card = document.createElement('div'); card.className = 'game-card'; card.style.animationDelay = `${index * 0.1}s`;
        card.innerHTML = `<img src="${iconUrl}" class="game-img" onerror="this.src='placeholder.png'">${game.description ? `<div class="game-hover-info"><div class="hover-text">${game.description.replace(/\n/g, '<br>')}</div></div>` : ''}`;
        
        const slot = document.createElement('div'); slot.className = 'slot-icon';
        slot.innerHTML = `<img src="${iconUrl}" class="slot-thumb" onerror="this.src='placeholder.png'">`;

        if (isOnline) {
            card.onclick = (e) => launchGame(e, game.url); slot.onclick = (e) => launchGame(e, game.url); slot.style.cursor = 'pointer';
        } else {
            card.style.filter = 'grayscale(0) brightness(0.5)'; slot.style.filter = 'grayscale(1) brightness(0.5)';
            card.onclick = (e) => launchGame(e, 'coming_soon.html'); slot.onclick = (e) => launchGame(e, 'coming_soon.html'); slot.style.cursor = 'pointer';
        }
        mainContainer.appendChild(card); slotsContainer.appendChild(slot);
    });
    const spacer = document.createElement('div'); spacer.style.height = '5vh'; mainContainer.appendChild(spacer);
}

function processBetExp(betAmount) {
    if (!currentUser || currentUser.isGuest) return;
    let gainedExp = Math.floor(betAmount * LobbyConfig.rewards.expPerCoin); 
    if (gainedExp < 1 && betAmount > 0) gainedExp = 0; 
    let currentExp = (currentUser.exp || 0) + gainedExp;
    let currentVip = currentUser.vip || 1;
    let isLevelUp = false;
    if (currentExp >= currentVip * LobbyConfig.rewards.expBaseMultiplier) { currentVip++; currentExp -= (currentVip-1) * LobbyConfig.rewards.expBaseMultiplier; isLevelUp = true; }

    const updates = { exp: currentExp, vip: currentVip, totalSpins: (currentUser.totalSpins || 0) + 1 };
    if (isLevelUp) updates.lastLevelUpDate = Date.now();

    db.ref('players/' + myUserId).update(updates).then(() => {
        if (isLevelUp) { LobbyAudio.playMoney(); showGhostTicker(`🆙 恭喜升級！您現在是 VIP.${currentVip}！`); currentUser.lastLevelUpDate = updates.lastLevelUpDate; }
        currentUser.exp = currentExp; currentUser.vip = currentVip; currentUser.totalSpins = updates.totalSpins; updateUserUI(); 
    });
}


// --- 8. UI 綁定與 Canvas 背景 ---
document.addEventListener('DOMContentLoaded', () => {
    LobbyAudio.init(); initUser(); initDynamicGameList(); 

    const navItems = document.querySelectorAll('.nav-item');
    const mainScroll = document.querySelector('.main-scroll-area');
    const panels = { slots: document.getElementById('slots-panel'), rewards: document.getElementById('rewards-panel'), profile: document.getElementById('profile-panel'), rankings: document.getElementById('rankings-panel') };
    
    function openPanel(target) {
        mainScroll.classList.add('hidden');
        Object.values(panels).forEach(p => { if(p !== target) p.classList.remove('active'); });
        setTimeout(() => { target.classList.add('active'); }, 200);
        if(target === panels.rewards) renderRewards();
    }
    window.closeAllPanels = function() {
        Object.values(panels).forEach(p => p.classList.remove('active'));
        setTimeout(() => { mainScroll.classList.remove('hidden'); }, 200);
        navItems.forEach(i => i.classList.remove('active')); document.getElementById('nav-home').classList.add('active');
    }

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(i => i.classList.remove('active')); item.classList.add('active');
            if (item.id === 'nav-slots') openPanel(panels.slots);
            else if (item.id === 'nav-rewards') openPanel(panels.rewards); 
            else if (item.id === 'nav-profile') openPanel(panels.profile);
            else if (item.id === 'nav-rankings') {
                openPanel(panels.rankings);
                const listDiv = document.getElementById('rank-list-content'); listDiv.innerHTML = '<div style="text-align:center; color:#888;">載入中...</div>';
                db.ref('players').orderByChild('balance').limitToLast(10).once('value', (snapshot) => {
                    listDiv.innerHTML = ''; const players = []; snapshot.forEach(child => { players.push(child.val()); });
                    players.reverse().forEach((p, index) => {
                        listDiv.innerHTML += `<div class="rank-item"><div class="rank-num">${index + 1}</div><img src="player.png" class="rank-avatar"><div class="rank-info"><div class="rank-name">${p.name}</div><div class="rank-vip">VIP.${p.vip || 0}</div></div><div class="rank-val">${(p.balance || 0).toLocaleString()}</div></div>`;
                    });
                });
            } else closeAllPanels();
        });
    });
    document.querySelectorAll('.close-gold-btn').forEach(btn => btn.addEventListener('click', closeAllPanels));

    const optionBtn = document.querySelector('.menu-btn');
    const optionDropdown = document.getElementById('option-dropdown');
    if (optionBtn) optionBtn.addEventListener('click', (e) => { e.stopPropagation(); optionDropdown.classList.toggle('active'); });
    document.addEventListener('click', (e) => { if (optionDropdown.classList.contains('active') && !optionDropdown.contains(e.target) && e.target !== optionBtn) optionDropdown.classList.remove('active'); });

    const walletModal = document.getElementById('wallet-modal');
    if (document.querySelector('.plus-btn')) document.querySelector('.plus-btn').addEventListener('click', () => { if(currentUser.isGuest) { alert("訪客無法儲值"); return; } walletModal.classList.add('active'); });
    if (document.getElementById('close-wallet-btn')) document.getElementById('close-wallet-btn').addEventListener('click', () => walletModal.classList.remove('active'));

    document.getElementById('bgm-toggle').addEventListener('change', (e) => {
        LobbyAudio.toggleMute(!e.target.checked); 
        localStorage.setItem('casino_bgm_on', e.target.checked);
        const gf = document.getElementById('game-frame'); if (gf && gf.contentWindow) gf.contentWindow.postMessage({ type: 'updateSettings', music: e.target.checked, sfx: document.getElementById('sfx-toggle').checked }, '*');
    });
    
    document.getElementById('sfx-toggle').addEventListener('change', (e) => {
        LobbyAudio.sfxClick.volume = e.target.checked ? 1.0 : 0; localStorage.setItem('casino_sfx_on', e.target.checked);
        const gf = document.getElementById('game-frame'); if (gf && gf.contentWindow) gf.contentWindow.postMessage({ type: 'updateSettings', music: document.getElementById('bgm-toggle').checked, sfx: e.target.checked }, '*');
    });

    window.optAction = function(type) {
        optionDropdown.classList.remove('active');
        if (type === 'support') alert("正在為您連線線上客服..."); else if (type === 'history') alert("📊 投注紀錄功能開發中");
        else if (type === 'lang') alert("Language switched."); else if (type === 'version') alert("Casino Lobby\n" + LobbyConfig.version);
    }
    window.switchRewardTab = function(tabName) {
        document.querySelectorAll('.r-tab-btn').forEach(b => b.classList.remove('active')); event.target.classList.add('active');
        document.querySelectorAll('.r-view').forEach(v => v.classList.remove('active'));
        if(tabName === 'mail') { document.getElementById('view-compose').classList.remove('active'); document.getElementById('view-mail').classList.add('active'); } 
        else { document.getElementById(`view-${tabName}`).classList.add('active'); }
    }
    window.selectRecharge = function(el, amount) { document.querySelectorAll('.w-option').forEach(opt => opt.classList.remove('active')); el.classList.add('active'); }
    window.confirmRecharge = function() { document.getElementById('wallet-modal').classList.remove('active'); alert("系統提示：正在連線至支付閘道... (模擬成功)"); if(!currentUser.isGuest) db.ref('players/' + myUserId + '/balance').transaction(curr => (curr || 0) + 500000); }
    window.changePassword = function() {
        if (!currentUser || currentUser.isGuest) { alert("訪客無法修改密碼，請先註冊。"); return; }
        if (prompt("請輸入舊密碼以驗證身分：") !== currentUser.password) { alert("❌ 舊密碼錯誤！"); return; }
        let newPass = prompt("請輸入新密碼：");
        if (!newPass || newPass.length < 4) { alert("❌ 密碼太短或無效！"); return; }
        db.ref('players/' + myUserId).update({ password: newPass }).then(() => { LobbyAudio.playTake(); alert("✅ 密碼修改成功！下次登入請使用新密碼。"); });
    }
    window.handleAuthAction = function() { if (currentUser && currentUser.isGuest) document.getElementById('auth-modal').classList.add('active'); else logout(); }
});

// Iframe 通訊 (從遊戲返回、扣款、加經驗)
window.addEventListener('message', (event) => {
    if (typeof event.data === 'string' && event.data === 'closeGame') {
        const overlay = document.getElementById('transition-overlay');
        overlay.classList.add('active'); 
        if(currentUser && currentUser.isGuest) {
            db.ref('players/' + myUserId).remove().then(() => { sessionStorage.removeItem('casino_guest_id'); setTimeout(() => location.reload(), 500); }); return;
        }
        setTimeout(() => {
            document.getElementById('game-container').style.display = 'none';
            if(document.getElementById('game-frame')) document.getElementById('game-frame').remove(); 
            document.querySelectorAll('.game-card.launching').forEach(c => c.classList.remove('launching'));
            document.querySelector('.main-scroll-area').classList.remove('hidden');
            overlay.classList.remove('active'); LobbyAudio.playBGM(); 
            if(myUserId) db.ref('players/' + myUserId).once('value', (snap) => { if(snap.val()) { currentUser = snap.val(); updateUserUI(); } });
        }, 500);
    }
    if (typeof event.data === 'object' && event.data !== null && event.data.type === 'updateBalance') {
        db.ref('players/' + myUserId).update({ balance: event.data.value });
        if(currentUser) { currentUser.balance = event.data.value; updateUserUI(); }
    }
    if (typeof event.data === 'object' && event.data !== null && event.data.type === 'bet') {
        processBetExp(event.data.amount); 
    }
});

// Canvas 背景特效
(function initLobbyBackground() {
    const canvas = document.getElementById('lobby-bg-canvas');
    const container = document.querySelector('.app-container'); 
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    let width, height, particles = [];
    function resize() { width = container.clientWidth; height = container.clientHeight; canvas.width = width; canvas.height = height; }
    class Particle {
        constructor() { this.reset(true); }
        reset(isInit = false) {
            let randX = (Math.random() + Math.random()) / 2;
            this.x = randX * width; this.y = isInit ? Math.random() * height : height + Math.random() * 50;
            this.vy = -(Math.random() * 1.2 + 0.5 + (1 - Math.abs(randX - 0.5) * 5) * 0.8); 
            this.vx = (Math.random() - 0.5) * 0.2; 
            this.size = Math.random() * 2.5 + 0.5;
            this.maxAlpha = Math.random() * 0.5 + 0.3; this.alpha = this.maxAlpha;
        }
        update() {
            this.x += this.vx; this.y += this.vy; 
            if (this.y < height * 0.5) this.alpha = Math.max(0, (this.y / (height * 0.5)) * this.maxAlpha);
            else this.alpha = this.maxAlpha;
            if (this.y < -10) this.reset(false);
        }
        draw() {
            ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(244, 208, 111, ${this.alpha})`;
            if (this.alpha > 0.01) { ctx.shadowBlur = 10; ctx.shadowColor = `rgba(244, 208, 111, 0.8)`; }
            ctx.fill(); ctx.shadowBlur = 0; 
        }
    }
    window.addEventListener('resize', resize); resize();
    for (let i = 0; i < 200; i++) particles.push(new Particle());
    function animate() {
        ctx.clearRect(0, 0, width, height);
        ctx.globalCompositeOperation = 'screen'; 
        let gradient = ctx.createRadialGradient(width/2, height/2, 1, width/2, height/2, width * 0.75);
        gradient.addColorStop(0, "rgba(244, 208, 111, 0.25)"); gradient.addColorStop(0.5, "rgba(20, 20, 20, 0.1)"); gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
        let pillarWidth = width * 0.25;
        let linearGrad = ctx.createLinearGradient(width/2 - pillarWidth/2, 0, width/2 + pillarWidth/2, 0);
        linearGrad.addColorStop(0, "rgba(0,0,0,0)"); linearGrad.addColorStop(0.5, "rgba(244, 208, 111, 0.12)"); linearGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = linearGrad; ctx.fillRect(width/2 - pillarWidth/2, 0, pillarWidth, height);
        ctx.globalCompositeOperation = 'source-over'; 
        particles.forEach(p => { p.update(); p.draw(); });
        requestAnimationFrame(animate);
    }
    animate();
})();

// 手機鎖定縮放防呆機制
document.querySelectorAll('img').forEach(img => img.addEventListener('dragstart', e => e.preventDefault()));
document.addEventListener('gesturestart', e => e.preventDefault());
let lastTouchEnd = 0;
document.addEventListener('touchend', function(event) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) event.preventDefault();
    lastTouchEnd = now;
}, false);
document.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.clickable-btn, .nav-item, .w-btn, .close-gold-btn, .game-card, .r-tab-btn, .w-option, .opt-item, .mail-item, .send-btn, .compose-btn, .mail-delete-btn')) {
        LobbyAudio.playClick();
    }
});