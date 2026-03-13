// ==========================================
// ⚙️ Casino Lobby - 靜態設定檔 (lobbyConfig.js)
// ==========================================

export const LobbyConfig = {
    // 1. Firebase 資料庫金鑰
    firebase: {
        apiKey: "AIzaSyA13JH6n_YRY2Rtiuq2u3iN4mEe5cQL8Bo",
        authDomain: "casino-lobby-123f5.firebaseapp.com",
        projectId: "casino-lobby-123f5",
        storageBucket: "casino-lobby-123f5.firebasestorage.app",
        messagingSenderId: "433397567788",
        appId: "1:433397567788:web:197a552bba01b186dedc89"
    },

    // 2. 系統預設發送的信件
    systemMails: [
        { id: 'sys_001', title: '維護補償獎勵', content: '感謝您的耐心等待，補償 500 金幣', reward: 500, date: 1735538400000, type: 'system', isRead: false },
        { id: 'sys_002', title: '火龍祕寶 - 新機上線!', content: '全新機台火熱上線，登入即送 1000 金幣', reward: 1000, date: 1735452000000, type: 'system', isRead: false }
    ],

    // 3. 獎勵與經驗值數值設定
    rewards: {
        baseDaily: 10000,          // 每日簽到基礎金幣
        vipDailyBonus: 5000,       // VIP 每多一級額外加給
        day7Base: 100000,          // 第 7 天簽到大獎
        expPerCoin: 1 / 100,       // 經驗值轉換率 (每下注 100 金幣 = 1 EXP)
        expBaseMultiplier: 1000    // 升級門檻倍數 (VIP n 升級需要 n * 1000 EXP)
    },

    // 4. 版本資訊
    version: "v1.7.0 Modular Stable"
};