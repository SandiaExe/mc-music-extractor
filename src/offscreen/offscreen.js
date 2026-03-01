import { DISC_MAP, DB_NAME, DB_VERSION } from '../utils/consts.js';

const audio = document.getElementById('audio');

// Estado
let playlist = { all: [], ost: [], records: [] };
let bannedTracks = [];
let playHistory = []; // Últimas N para smart shuffle
let playOrderHistory = []; // Orden de reproducción para botón "anterior"
let currentHistoryIndex = -1;
let shuffleMode = 0; // 0=Random OST, 1=Random Discos, 2=Random Todo
let currentTrackName = null;
const HISTORY_SIZE = 4;
const PLAY_ORDER_MAX = 100;

// --- SISTEMA DE INICIALIZACIÓN BLINDADO ---
let isReady = false;

// Esta promesa asegura que nada funcione hasta que cargue la config
const initPromise = (async function startEngine() {
    try {
        console.log("Iniciando motor de audio...");
        await initPlaylist(); // 1. Cargar nombres de canciones
        await loadSettings(); // 2. Cargar baneos y volumen
        isReady = true;
        console.log("Motor listo. Baneados:", bannedTracks.length, "Volumen:", audio.volume);
    } catch (e) {
        console.error("Error crítico iniciando motor:", e);
    }
})();

// --- GESTOR DE MENSAJES ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // IMPORTANTE: Esperar a que initPromise termine antes de procesar nada
    initPromise.then(() => {
        processMessage(msg).then(sendResponse);
    });
    return true; // Mantiene el canal abierto
});

async function processMessage(msg) {
    try {
        switch (msg.action) {
            case 'START_AUTOPLAY':
                shuffleMode = 0; // Random OST por defecto
                playNext();
                return { status: 'ok' };
                
            case 'PLAY': 
                await playTrack(msg.trackName); 
                return { status: 'playing' };
                
            case 'PAUSE': 
                audio.paused ? await audio.play() : audio.pause(); 
                return { status: audio.paused ? 'paused' : 'playing' };
                
            case 'NEXT': 
                playNext(); 
                return { status: 'next' };
                
            case 'PREV':
                playPrev();
                return { status: 'prev' };
                
            case 'SEEK_TO':
                if (isFinite(msg.time)) audio.currentTime = msg.time;
                return { status: 'seeked' };

            case 'SET_VOLUME':
                if (typeof msg.value === 'number' && msg.value >= 0 && msg.value <= 1) {
                    audio.volume = msg.value;
                    chrome.storage.local.set({ defaultVolume: Math.round(msg.value * 100) });
                }
                return { status: 'vol_set' };

            case 'SET_SHUFFLE': 
                shuffleMode = msg.mode; 
                return { status: 'mode_set' };
            
            case 'TOGGLE_BAN': 
                toggleBan(msg.trackName); 
                return { status: 'banned', bannedList: bannedTracks };

            case 'GET_STATUS': 
                // Ahora esto garantiza devolver los datos cargados, no arrays vacíos
                return { 
                    paused: audio.paused, 
                    currentTime: audio.currentTime, 
                    duration: audio.duration, 
                    volume: audio.volume, 
                    currentTrack: currentTrackName, 
                    shuffleMode: shuffleMode, 
                    bannedTracks: bannedTracks 
                };
                
            default: 
                return { status: 'ignored' };
        }
    } catch (err) { 
        return { status: 'error', msg: err.message }; 
    }
}

// --- REPRODUCCIÓN ---
async function playTrack(trackName, options = {}) {
    const fromHistory = options.fromHistory === true;
    try {
        if (audio.src) URL.revokeObjectURL(audio.src);
        const fileBlob = await getFileFromDB(trackName);
        if (!fileBlob) {
            setTimeout(playNext, 1000);
            return;
        }
        audio.src = URL.createObjectURL(fileBlob);
        await audio.play();
        currentTrackName = trackName;
        if (!fromHistory) {
            playOrderHistory.push(trackName);
            if (playOrderHistory.length > PLAY_ORDER_MAX) playOrderHistory.shift();
            currentHistoryIndex = playOrderHistory.length - 1;
        }
        addToHistory(trackName);
        chrome.runtime.sendMessage({ type: 'PLAYING_NEW', track: trackName }).catch(()=>{});
    } catch (err) { setTimeout(playNext, 1000); }
}

function playPrev() {
    if (currentHistoryIndex <= 0) return;
    currentHistoryIndex--;
    const prevTrack = playOrderHistory[currentHistoryIndex];
    if (prevTrack) playTrack(prevTrack, { fromHistory: true });
}

function playNext() {
    let pool = [];
    if (shuffleMode === 1) pool = playlist.records;
    else if (shuffleMode === 2) pool = playlist.all;
    else pool = playlist.ost; // 0 = Random OST

    let validPool = pool.filter(t => !bannedTracks.includes(t));
    if (validPool.length === 0) return;

    // Smart Shuffle (todos los modos son random ahora)
    let candidates = validPool.filter(t => !playHistory.includes(t));
    if (candidates.length === 0) candidates = validPool.filter(t => t !== currentTrackName);
    if (candidates.length === 0) candidates = validPool;
    const nextTrack = candidates[Math.floor(Math.random() * candidates.length)];
    playTrack(nextTrack);
}

function addToHistory(t) {
    playHistory.push(t);
    if (playHistory.length > HISTORY_SIZE) playHistory.shift();
}

// --- BASES DE DATOS Y CONFIGURACIÓN ---

function openDBWithUpgrade() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('music')) db.createObjectStore('music');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(new Error("DB Error"));
    });
}

function getFileFromDB(trackName) {
    return openDBWithUpgrade().then(db => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction('music', 'readonly');
            const getReq = tx.objectStore('music').get(trackName);
            getReq.onsuccess = (e) => resolve(e.target.result);
            getReq.onerror = () => reject(new Error("DB Error"));
        });
    });
}

function initPlaylist() {
    return openDBWithUpgrade().then(db => {
        return new Promise((resolve, reject) => {
            if (!db.objectStoreNames.contains('music')) return resolve();
            const tx = db.transaction('music', 'readonly');
            const getReq = tx.objectStore('music').getAllKeys();
            getReq.onsuccess = (e) => {
                const files = (e.target.result || []).sort();
                playlist.all = files;
                playlist.records = [];
                playlist.ost = [];
                files.forEach(f => {
                    if (DISC_MAP[f]) playlist.records.push(f);
                    else playlist.ost.push(f);
                });
                resolve();
            };
            getReq.onerror = () => reject(new Error('IndexedDB getAllKeys failed'));
        });
    });
}

function loadSettings() {
    return new Promise(resolve => {
        chrome.storage.local.get(['banned', 'defaultVolume'], (data) => {
            console.log("Cargando configuración desde disco:", data);
            const vol = data.defaultVolume !== undefined ? data.defaultVolume : 100;
            audio.volume = vol / 100;
            if (Array.isArray(data.banned)) {
                bannedTracks = data.banned;
            } else {
                bannedTracks = [];
            }
            resolve();
        });
    });
}

function toggleBan(t) {
    if (bannedTracks.includes(t)) bannedTracks = bannedTracks.filter(x => x !== t);
    else bannedTracks.push(t);
    
    // Guardar inmediatamente
    chrome.storage.local.set({ banned: bannedTracks }, () => {
        if(chrome.runtime.lastError) console.error("Error guardando:", chrome.runtime.lastError);
        else console.log("Baneos guardados.");
    });
}

// Eventos Audio
audio.onended = () => playNext();
let lastTime = 0;
audio.ontimeupdate = () => {
    if (Date.now() - lastTime > 500) {
        chrome.runtime.sendMessage({ type: 'UPDATE_TIME', currentTime: audio.currentTime, duration: audio.duration }).catch(()=>{});
        lastTime = Date.now();
    }
};
setInterval(() => chrome.runtime.sendMessage({ type: 'KEEP_ALIVE' }).catch(()=>{}), 20000);