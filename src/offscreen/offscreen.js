import { DISC_MAP, COMPOSERS, openMusicDB, getNiceName, getComposer } from '../utils/consts.js';

const audio = document.getElementById('audio');

// Estado
let playlist = { all: [], ost: [], records: [] };
let bannedTracks = [];
let favorites = [];
let playHistory = []; // Últimas N para smart shuffle
let playOrderHistory = []; // Orden de reproducción para botón "anterior"
let currentHistoryIndex = -1;
let shuffleMode = 0; // 0=Random OST, 1=Random Discos, 2=Random Todo, 3=Random Favoritos
let composerFilter = ''; // Clave de COMPOSERS: limita los modos aleatorios a ese compositor ('' = todos)
// Tiempo entre canciones: 'immediate' | 'random' (1-10 min, como el juego) | 'custom' (gapSeconds)
let gapMode = 'immediate';
let gapSeconds = 10;
let gapPending = false; // true mientras se espera para pasar a la siguiente
let gapEndsAt = null; // Momento (ms) en que termina la espera, para mostrarlo en el popup
let gapTimer = null;
const LOCAL_GAP_MAX = 20000; // Por encima de esto la espera la lleva el service worker
let currentTrackName = null;
let currentBlobUrl = null;
const SHUFFLE_MODES = [0, 1, 2, 3];
const MAX_HISTORY = 5;
const HISTORY_SIZE = 4;
// const PLAY_ORDER_MAX = 100;

// --- SISTEMA DE INICIALIZACIÓN BLINDADO ---

// Esta promesa asegura que nada funcione hasta que cargue la config
const initPromise = (async function startEngine() {
    try {
        console.log("Iniciando motor de audio...");
        await initPlaylist(); // 1. Cargar nombres de canciones
        const saved = await loadSettings(); // 2. Cargar baneos y volumen
        await restoreLastTrack(saved); // 3. Recuperar la última canción (en pausa)
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
                // Si se recuperó la canción de la sesión anterior, continuar con ella
                // (salvo que el usuario prefiera empezar con una aleatoria)
                if (currentTrackName && !msg.random) {
                    try { await audio.play(); } catch (e) { playNext(); }
                } else {
                    playNext();
                }
                return { status: 'ok' };
                
            case 'PLAY': 
                await playTrack(msg.trackName); 
                return { status: 'playing' };
                
            case 'PAUSE': 
                // Pulsar play durante la espera entre canciones la salta,
                // y sin ninguna canción cargada empieza una
                if (gapPending || !currentTrackName) {
                    playNext();
                    return { status: 'next' };
                }
                // Una pista terminada no cuenta como "paused" para el navegador
                (audio.paused || audio.ended) ? await audio.play() : audio.pause(); 
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
                    saveState({ defaultVolume: Math.round(msg.value * 100) });
                }
                return { status: 'vol_set' };

            case 'SET_SHUFFLE': 
                if (SHUFFLE_MODES.includes(msg.mode)) {
                    shuffleMode = msg.mode; 
                    saveState({ shuffleMode });
                }
                return { status: 'mode_set' };
            
            case 'GAP_NEXT': // Terminó la espera programada en el service worker
                if (gapPending) playNext();
                return { status: 'next' };

            case 'SET_GAP':
                applyGapSettings(msg.mode, msg.seconds);
                return { status: 'gap_set' };

            case 'RELOAD_LIBRARY': // Se importaron canciones desde opciones
                await initPlaylist();
                return { status: 'library_reloaded' };

            case 'SET_COMPOSER':
                composerFilter = COMPOSERS[msg.value] ? msg.value : '';
                return { status: 'composer_set' };

            case 'TOGGLE_BAN': 
                toggleBan(msg.trackName); 
                return { status: 'banned', bannedList: bannedTracks };

            case 'TOGGLE_FAV':
                toggleFavorite(msg.trackName);
                return { status: 'fav_toggled', favorites };

            case 'GET_STATUS': 
                // Ahora esto garantiza devolver los datos cargados, no arrays vacíos
                return { 
                    paused: audio.paused || audio.ended, 
                    currentTime: audio.currentTime, 
                    duration: audio.duration, 
                    volume: audio.volume, 
                    currentTrack: currentTrackName, 
                    shuffleMode: shuffleMode, 
                    nextTrackAt: gapPending ? gapEndsAt : null,
                    bannedTracks: bannedTracks,
                    favorites: favorites
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

    // --- FIX DE UI: Actualizar el nombre inmediatamente ---
    // Esto garantiza que GET_STATUS devuelva el nombre correcto aunque el audio tarde en cargar
    currentTrackName = trackName;
    cancelGap();

    try {
        // --- FIX DE MEMORIA: Revocar URL anterior ---
        if (currentBlobUrl) {
            URL.revokeObjectURL(currentBlobUrl);
            currentBlobUrl = null;
        }

        const fileBlob = await getFileFromDB(trackName);
        if (!fileBlob) {
            console.error("No se encontró el archivo:", trackName);
            setTimeout(playNext, 1000);
            return;
        }

        // Crear nueva URL
        currentBlobUrl = URL.createObjectURL(fileBlob);
        audio.src = currentBlobUrl;
        saveState({ lastTrack: trackName, lastTime: 0 });
        updateMediaSession();

        // --- FIX DE HISTORIAL: Límite de 5 ---
        if (!fromHistory) {
            // Si la canción es nueva (no es "atrás"), la añadimos
            if (playOrderHistory[playOrderHistory.length - 1] !== trackName) {
                playOrderHistory.push(trackName);
            }
            
            // Mantener solo las últimas 5
            if (playOrderHistory.length > MAX_HISTORY) {
                playOrderHistory.shift();
            }
            currentHistoryIndex = playOrderHistory.length - 1;
        }

        addToHistory(trackName); 

        await audio.play();

        // Notificar al Popup que hay una nueva canción (si está abierto)
        chrome.runtime.sendMessage({ 
            type: 'PLAYING_NEW', 
            track: trackName 
        }).catch(() => {});

    } catch (err) {
        console.error("Error en reproducción:", err);
        // Si hay error, saltar a la siguiente para no bloquear el motor
        setTimeout(playNext, 2000);
    }
}

// Deja cargada (sin reproducir) la canción que sonaba al cerrar el navegador
async function restoreLastTrack(saved) {
    const { lastTrack, lastTime: savedTime } = saved;
    if (!lastTrack || !playlist.all.includes(lastTrack)) return;

    const fileBlob = await getFileFromDB(lastTrack);
    if (!fileBlob) return;

    const url = URL.createObjectURL(fileBlob);
    currentBlobUrl = url;
    currentTrackName = lastTrack;
    playOrderHistory = [lastTrack];
    currentHistoryIndex = 0;
    addToHistory(lastTrack);

    if (savedTime > 0) {
        audio.addEventListener('loadedmetadata', () => {
            // Solo si sigue siendo la canción recuperada y no terminó
            if (currentBlobUrl === url && savedTime < audio.duration) audio.currentTime = savedTime;
        }, { once: true });
    }
    audio.src = url;
    updateMediaSession();
}

function playPrev() {
    if (currentHistoryIndex <= 0) {
        console.log("Inicio del historial alcanzado");
        return;
    }
    
    currentHistoryIndex--;
    const prevTrack = playOrderHistory[currentHistoryIndex];
    
    if (prevTrack) {
        // Usamos options.fromHistory para no duplicar en el array
        playTrack(prevTrack, { fromHistory: true });
    }
}

function playNext() {
    cancelGap();
    let pool = [];
    if (shuffleMode === 1) pool = playlist.records;
    else if (shuffleMode === 2) pool = playlist.all;
    else if (shuffleMode === 3) pool = playlist.all.filter(t => favorites.includes(t));
    else pool = playlist.ost; // 0 = Random OST
    // Sin favoritos marcados, Random: Favorites se comporta como Random: OST
    if (shuffleMode === 3 && pool.length === 0) pool = playlist.ost;

    let validPool = pool.filter(t => !bannedTracks.includes(t));
    if (validPool.length === 0) return;

    // Smart Shuffle
    if (composerFilter) {
        validPool = validPool.filter(t => COMPOSERS[composerFilter].tracks.has(t));
        if (validPool.length === 0) return;
    }
    let candidates = validPool.filter(t => !playHistory.includes(t));
    if (candidates.length === 0) candidates = validPool.filter(t => t !== currentTrackName);
    if (candidates.length === 0) candidates = validPool;
    const nextTrack = candidates[Math.floor(Math.random() * candidates.length)];
    playTrack(nextTrack);
}

// --- MEDIA SESSION (teclas multimedia y controles del sistema) ---
function updateMediaSession() {
    if (!('mediaSession' in navigator) || !currentTrackName) return;
    navigator.mediaSession.metadata = new MediaMetadata({
        title: getNiceName(currentTrackName),
        artist: getComposer(currentTrackName) || 'Minecraft',
        album: 'Minecraft',
        artwork: [{ src: chrome.runtime.getURL('assets/jukebox_lite.png'), sizes: '128x128', type: 'image/png' }]
    });
}

if ('mediaSession' in navigator) {
    const handlers = {
        play: () => processMessage({ action: 'PAUSE' }),
        pause: () => audio.pause(),
        nexttrack: () => playNext(),
        previoustrack: () => playPrev()
    };
    for (const [action, handler] of Object.entries(handlers)) {
        try { navigator.mediaSession.setActionHandler(action, handler); } catch (e) { /* Acción no soportada */ }
    }
}

// --- VISUALIZADOR ---
// El popup abre un puerto 'visualizer' y recibe la altura (0-1) de cada barra.
// El audio se analiza sobre una copia (captureStream), sin tocar la salida real:
// si algo falla aquí, la música sigue sonando y el popup usa su animación CSS.
const VIS_BARS = 20;
const VIS_BINS_PER_BAR = 3;
const visPorts = new Set();
let visCtx = null, visAnalyser = null, visSource = null, visStream = null, visData = null, visTimer = null;

function tapAudio() {
    try {
        if (!visCtx) {
            visCtx = new AudioContext();
            visAnalyser = visCtx.createAnalyser();
            visAnalyser.fftSize = 256;
            visAnalyser.smoothingTimeConstant = 0.7;
            visData = new Uint8Array(visAnalyser.frequencyBinCount);
        }
        visCtx.resume().catch(() => {});
        if (visSource) visSource.disconnect();
        if (visStream) visStream.getTracks().forEach(t => t.stop());
        // La captura va ligada a la pista cargada: hay que rehacerla con cada canción
        visStream = audio.captureStream();
        visSource = visCtx.createMediaStreamSource(visStream);
        visSource.connect(visAnalyser);
    } catch (e) {
        console.error("Visualizador no disponible:", e);
        visSource = null;
    }
}

function sendVisFrame() {
    if (!visSource || visCtx.state !== 'running' || audio.paused || audio.ended) return;
    visAnalyser.getByteFrequencyData(visData);
    const bars = [];
    for (let i = 0; i < VIS_BARS; i++) {
        let sum = 0;
        for (let j = 0; j < VIS_BINS_PER_BAR; j++) sum += visData[i * VIS_BINS_PER_BAR + j];
        bars.push(sum / (VIS_BINS_PER_BAR * 255));
    }
    visPorts.forEach(port => {
        try { port.postMessage(bars); } catch (e) { visPorts.delete(port); }
    });
}

chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'visualizer') return;
    visPorts.add(port);
    port.onDisconnect.addListener(() => {
        visPorts.delete(port);
        if (visPorts.size === 0) {
            clearInterval(visTimer);
            visTimer = null;
        }
    });
    if (!audio.paused && !audio.ended) tapAudio();
    if (!visTimer) visTimer = setInterval(sendVisFrame, 60);
});

audio.addEventListener('playing', () => {
    if (visPorts.size > 0) tapAudio();
});

// --- TIEMPO ENTRE CANCIONES ---
function applyGapSettings(mode, seconds) {
    gapMode = ['immediate', 'random', 'custom'].includes(mode) ? mode : 'immediate';
    gapSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : 10;
}

function getGapDelay() {
    if (gapMode === 'random') return 60000 + Math.random() * 540000; // 1 a 10 minutos
    if (gapMode === 'custom') return gapSeconds * 1000;
    return 0;
}

// Pasa a la siguiente canción respetando la espera configurada
function scheduleNext() {
    const delay = getGapDelay();
    if (delay <= 0) {
        playNext();
        return;
    }
    gapPending = true;
    gapEndsAt = Date.now() + delay;
    saveState({ gapPending: true, gapEndsAt });
    if (delay <= LOCAL_GAP_MAX) {
        gapTimer = setTimeout(playNext, delay);
    } else {
        chrome.runtime.sendMessage({ type: 'SCHEDULE_NEXT', delayMs: delay }).catch(() => {});
    }
}

function cancelGap() {
    if (!gapPending) return;
    gapPending = false;
    gapEndsAt = null;
    clearTimeout(gapTimer);
    gapTimer = null;
    saveState({ gapPending: false });
    chrome.runtime.sendMessage({ type: 'CANCEL_NEXT' }).catch(() => {});
}

function addToHistory(t) {
    playHistory.push(t);
    if (playHistory.length > HISTORY_SIZE) playHistory.shift();
}

// --- BASES DE DATOS Y CONFIGURACIÓN ---

function getFileFromDB(trackName) {
    return openMusicDB().then(db => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction('music', 'readonly');
            const getReq = tx.objectStore('music').get(trackName);
            getReq.onsuccess = (e) => resolve(e.target.result);
            getReq.onerror = () => reject(new Error("DB Error"));
        });
    });
}

function initPlaylist() {
    return openMusicDB().then(db => {
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

// Los documentos offscreen solo tienen chrome.runtime, no chrome.storage:
// la lectura y escritura se hacen a través del service worker.
const STATE_KEYS = ['banned', 'favorites', 'defaultVolume', 'lastTrack', 'lastTime', 'onlyC418', 'composerFilter', 'shuffleMode', 'gapMode', 'gapSeconds', 'gapPending', 'gapEndsAt'];

function saveState(data) {
    chrome.runtime.sendMessage({ type: 'SAVE_STATE', data }).catch(() => {});
}

async function loadSettings() {
    let data = {};
    try {
        data = (await chrome.runtime.sendMessage({ type: 'GET_ENGINE_STATE', keys: STATE_KEYS })) || {};
    } catch (e) {
        console.error("No se pudo leer la configuración guardada:", e);
    }
    console.log("Cargando configuración desde disco:", data);
    const vol = data.defaultVolume !== undefined ? data.defaultVolume : 100;
    audio.volume = vol / 100;
    bannedTracks = Array.isArray(data.banned) ? data.banned : [];
    favorites = Array.isArray(data.favorites) ? data.favorites : [];
    // La antigua casilla "Only C418" equivale a filtrar por C418
    const savedComposer = data.composerFilter ?? (data.onlyC418 === true ? 'c418' : '');
    composerFilter = COMPOSERS[savedComposer] ? savedComposer : '';
    if (SHUFFLE_MODES.includes(data.shuffleMode)) shuffleMode = data.shuffleMode;
    applyGapSettings(data.gapMode, data.gapSeconds);
    gapPending = data.gapPending === true;
    gapEndsAt = gapPending ? data.gapEndsAt : null;
    return data;
}

function toggleBan(t) {
    if (bannedTracks.includes(t)) bannedTracks = bannedTracks.filter(x => x !== t);
    else bannedTracks.push(t);
    // Persistir para siempre (chrome.storage.local no se borra al cerrar el navegador)
    saveState({ banned: bannedTracks });
}

function toggleFavorite(t) {
    if (favorites.includes(t)) favorites = favorites.filter(x => x !== t);
    else favorites.push(t);
    saveState({ favorites });
}

// Eventos Audio
audio.onended = () => {
    saveState({ lastTime: 0 });
    scheduleNext();
    // Si no empieza otra enseguida, avisar al popup de que ya no suena nada
    if (gapPending) notifyState();
};
// El estado puede cambiar sin pasar por el popup (atajos, teclas multimedia)
function notifyState() {
    chrome.runtime.sendMessage({ type: 'STATE_CHANGED' }).catch(() => {});
}
audio.onplay = notifyState;
// Guardar la posición al pausar y cada pocos segundos mientras suena
audio.onpause = () => {
    if (!audio.ended) saveState({ lastTime: audio.currentTime });
    notifyState();
};
const SAVE_POSITION_EVERY = 5000;
let lastPositionSave = 0;
let lastTime = 0;
audio.ontimeupdate = () => {
    if (Date.now() - lastTime > 500) {
        chrome.runtime.sendMessage({ type: 'UPDATE_TIME', currentTime: audio.currentTime, duration: audio.duration }).catch(()=>{});
        lastTime = Date.now();
    }
    if (!audio.paused && Date.now() - lastPositionSave > SAVE_POSITION_EVERY) {
        saveState({ lastTime: audio.currentTime });
        lastPositionSave = Date.now();
    }
};
setInterval(() => chrome.runtime.sendMessage({ type: 'KEEP_ALIVE' }).catch(()=>{}), 20000);