import { getNiceName, getComposer, DISC_MAP, openMusicDB, THEMES } from '../utils/consts.js';
import { t, localizePage } from '../utils/i18n.js';

localizePage();


const ui = {
    skyTitle: document.getElementById('skyTitle'),
    skyLabel: document.getElementById('skyLabel'),
    jukebox: document.getElementById('jukeboxContainer'),
    particleSys: document.getElementById('particleSystem'),
    search: document.getElementById('searchInput'),
    btnReload: document.getElementById('btnReload'),
    btnSettings: document.getElementById('btnSettings'),
    title: document.getElementById('trackTitle'),
    curr: document.getElementById('currTime'),
    bar: document.getElementById('progressBar'),
    tot: document.getElementById('totTime'),
    playBtn: document.getElementById('btnPlayPause'),
    btnPrev: document.getElementById('btnPrev'),
    btnNext: document.getElementById('btnNext'),
    shuffle: document.getElementById('btnShuffle'),
    vol: document.getElementById('volumeBar'),
    detDiscs: document.getElementById('detDiscs'),
    detOst: document.getElementById('detOst'),
    lDiscs: document.getElementById('listDiscs'),
    lOst: document.getElementById('listOst'),
    cDiscs: document.getElementById('cntDiscs'),
    shuffleText: document.getElementById('shuffleText'),
    cOst: document.getElementById('cntOst'),
    searchResultsContainer: document.getElementById('searchResultsContainer'),
    searchResultsList: document.getElementById('searchResultsList'),
    librarySection: document.getElementById('librarySection'),
    importNotice: document.getElementById('importNotice'),
    btnNoticeConfig: document.getElementById('btnNoticeConfig'),
    btnDismissNotice: document.getElementById('btnDismissNotice'),
    volIcon: document.getElementById('volumeIcon'),
    skyContainer: document.getElementById('skyContainer'),
    skyNoteLayer: document.getElementById('skyNoteLayer')
};

// I don't how works this code, but i'm sure it's a magic.

ui.visualizer = document.getElementById('audioVisualizer');

const MODES = [
    { key: "modeOst", id: 0 },
    { key: "modeDiscs", id: 1 },
    { key: "modeAll", id: 2 },
    { key: "modeFavorites", id: 3 }
];

function modeLabel(mode) {
    return t((MODES[mode] || MODES[0]).key);
}

let currMode = 0;
let isDragging = false;
let isPlaying = false;
let particleInterval = null;
let bannedList = [];
let favList = [];
let currentTrackId = null; // Para marcar "playing" en resultados de búsqueda
/** Lista de todas las pistas { id, displayName } para el buscador */
let allTracksForSearch = [];
let lastNonZeroVolume = 1;
let nextTrackAt = null; // Fin de la espera entre canciones (ms), si la hay
let countdownInterval = null;

function updateVolumeIcon(volume) {
    if (!ui.volIcon) return;
    const v = typeof volume === 'number' ? volume : parseFloat(ui.vol?.value ?? '1');
    if (v <= 0.001) {
        ui.volIcon.src = '../../assets/volumen_not.png';
    } else {
        ui.volIcon.src = '../../assets/volume.png';
    }
}

function sendMsg(msg, callback) {
    try {
        chrome.runtime.sendMessage(msg, (response) => {
            if (!chrome.runtime.lastError && callback && response) {
                callback(response);
            }
        });
    } catch (e) { console.error(e); }
}

// Pide el estado al motor y reintenta si todavía no responde.
// No usa sendMsg porque este ignora las respuestas vacías y los errores.
function requestStatus(retries = 3) {
    try {
        chrome.runtime.sendMessage({ action: 'GET_STATUS' }, (response) => {
            if (!chrome.runtime.lastError && response) {
                updateUI(response);
            } else if (retries > 0) {
                console.log("El motor de audio se está despertando...");
                setTimeout(() => requestStatus(retries - 1), 1000);
            }
        });
    } catch (e) { console.error(e); }
}

async function init() {
     try {
        // 1. Abrir Base de Datos para pintar la lista
        const db = await openMusicDB();
        
        const tx = db.transaction('music', 'readonly');
        tx.objectStore('music').getAllKeys().onsuccess = async (e) => {
            const files = (e.target.result || []).sort();
            renderLists(files);
            showOrHideImportNotice(files.length);

            // 2. INTENTAR CONECTAR CON EL MOTOR DE AUDIO
            // Intentamos enviar un mensaje. Si falla, el background lo interceptará y creará el offscreen.
            requestStatus();
        };
    } catch (err) {
        console.error("Error iniciando Popup:", err);
        if (ui.title) ui.title.textContent = t('importFirst');
        showOrHideImportNotice(0);
    }
    initVisualizer();
    initSkyClickNote();
}

function initSkyClickNote() {
    if (!ui.skyContainer || !ui.skyNoteLayer) return;
    ui.skyContainer.addEventListener('click', (e) => {
        if (e.target.closest('.jukebox-wrapper')) return;
        const rect = ui.skyContainer.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const note = document.createElement('div');
        note.className = 'note-particle sky-note';
        note.style.left = x + 'px';
        note.style.top = y + 'px';
        note.style.setProperty('--rnd-x', (Math.random() * 40 - 20) + 'px');
        note.style.setProperty('--rnd-rot', (Math.random() * 40 - 20) + 'deg');
        ui.skyNoteLayer.appendChild(note);
        setTimeout(() => note.remove(), 2500);
    });
}

// 2. FUNCIÓN PARA APLICAR TEMA
function applyTheme(themeKey) {
    const theme = THEMES[themeKey] || THEMES['sage'];
    const root = document.documentElement;
    
    // Inyectar variables CSS
    for (const [key, value] of Object.entries(theme.colors)) {
        root.style.setProperty(key, value);
    }
}

chrome.storage.local.get(['theme'], (data) => {
    applyTheme(data.theme || 'sage');
});

function getDisplayName(filename) {
    return getNiceName(filename).replace('Music Disc ', '').replace('C418 - ', '');
}

function renderLists(files) {
    ui.lDiscs.innerHTML = "";
    ui.lOst.innerHTML = "";
    allTracksForSearch = files.map(f => ({ id: f, displayName: getDisplayName(f) }));
    let cd = 0, co = 0;

    files.forEach(f => {
        const li = document.createElement('li');
        li.dataset.id = f;

        const spanName = document.createElement('span');
        spanName.className = 'track-name';
        spanName.textContent = getDisplayName(f);

        const btnBan = document.createElement('button');
        btnBan.className = 'ban-btn';
        btnBan.innerHTML = '<img src="../../assets/barrier.png" class="icon-ban">';
        btnBan.title = t('banTitle');
        btnBan.onclick = (e) => {
            e.stopPropagation();
            if (bannedList.includes(f)) bannedList = bannedList.filter(x => x !== f);
            else bannedList.push(f);
            updateBannedVisuals();
            sendMsg({ action: 'TOGGLE_BAN', trackName: f });
        };

        li.onclick = () => sendMsg({ action: 'PLAY', trackName: f });

        li.appendChild(spanName);
        const composer = getComposer(f);
        if (composer) {
            const spanComposer = document.createElement('span');
            spanComposer.className = 'track-composer';
            spanComposer.textContent = composer;
            li.appendChild(spanComposer);
        }

        const btnFav = document.createElement('button');
        btnFav.className = 'fav-btn';
        btnFav.textContent = '★';
        btnFav.title = t('favTitle');
        btnFav.onclick = (e) => {
            e.stopPropagation();
            if (favList.includes(f)) favList = favList.filter(x => x !== f);
            else favList.push(f);
            updateFavVisuals();
            sendMsg({ action: 'TOGGLE_FAV', trackName: f });
        };
        li.appendChild(btnFav);
        li.appendChild(btnBan);

        if (DISC_MAP[f]) { ui.lDiscs.appendChild(li); cd++; }
        else { ui.lOst.appendChild(li); co++; }
    });

    ui.cDiscs.textContent = cd;
    ui.cOst.textContent = co;
    updateBannedVisuals();
    updateFavVisuals();
}

function showOrHideImportNotice(fileCount) {
    if (!ui.importNotice) return;
    if (fileCount === 0) {
        ui.importNotice.classList.remove('hidden');
        return;
    }
    chrome.storage.local.get(['hasSeenImportNotice'], (data) => {
        if (data.hasSeenImportNotice) ui.importNotice.classList.add('hidden');
        else ui.importNotice.classList.remove('hidden');
    });
}

function renderSearchResults(query) {
    const q = query.trim().toLowerCase();
    if (!ui.searchResultsList || !ui.searchResultsContainer) return;
    if (q.length === 0) {
        ui.searchResultsContainer.classList.add('hidden');
        if (ui.librarySection) ui.librarySection.classList.remove('hidden');
        return;
    }
    const matches = allTracksForSearch.filter(t => t.displayName.toLowerCase().includes(q));
    ui.searchResultsList.innerHTML = "";
    matches.forEach(({ id, displayName }) => {
        const li = document.createElement('li');
        li.dataset.id = id;
        if (id === currentTrackId) li.classList.add('playing');
        const span = document.createElement('span');
        span.className = 'track-name';
        span.textContent = displayName;
        li.onclick = () => {
            sendMsg({ action: 'PLAY', trackName: id });
            if (ui.search) ui.search.value = "";
            renderSearchResults("");
        };
        li.appendChild(span);
        ui.searchResultsList.appendChild(li);
    });
    ui.searchResultsContainer.classList.remove('hidden');
    if (ui.librarySection) ui.librarySection.classList.add('hidden');
}

// Durante la espera entre canciones, la etiqueta muestra la cuenta atrás
function updateCountdown() {
    if (!ui.skyLabel) return;
    if (!nextTrackAt) {
        ui.skyLabel.textContent = t('nowPlaying');
        return;
    }
    const left = Math.max(0, Math.round((nextTrackAt - Date.now()) / 1000));
    const sec = left % 60;
    ui.skyLabel.textContent = t('nextTrackIn', [`${Math.floor(left / 60)}:${sec < 10 ? '0' : ''}${sec}`]);
}

function setNextTrackAt(time) {
    nextTrackAt = time || null;
    clearInterval(countdownInterval);
    countdownInterval = nextTrackAt ? setInterval(updateCountdown, 1000) : null;
    updateCountdown();
}

function updateUI(status) {
    if (!status) return;

    connectVisualizer(); // El motor ya responde: pedirle los datos reales del audio

    setNextTrackAt(status.nextTrackAt);

    if (status.bannedTracks) {
        bannedList = status.bannedTracks;
        updateBannedVisuals();
    }

    if (status.favorites) {
        favList = status.favorites;
        updateFavVisuals();
    }

    isPlaying = !status.paused;
    toggleGlobalPauseClass();
    updateJukeboxVisuals();
    updateVisualizerState();

    if (status.currentTrack) {
        currentTrackId = status.currentTrack;
        const name = getNiceName(status.currentTrack);
        ui.title.textContent = name;
        ui.skyTitle.textContent = name.replace('Music Disc ', '');

        document.querySelectorAll('li').forEach(l => l.classList.remove('playing'));
        const active = document.querySelector(`li[data-id="${status.currentTrack}"]`);
        if (active) {
            active.classList.add('playing');
            active.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
    }

    if (ui.vol) ui.vol.value = status.volume ?? 1;
    updateVolumeIcon(status.volume ?? 1);
    if (!isDragging) {
        ui.bar.max = status.duration || 100;
        ui.bar.value = status.currentTime || 0;
        formatTime(status.currentTime, status.duration);
    }

    currMode = status.shuffleMode ?? 0;
    ui.shuffleText.textContent = modeLabel(currMode);
}

function updateBannedVisuals() {
    document.querySelectorAll('li').forEach(li => {
        if (bannedList.includes(li.dataset.id)) li.classList.add('banned');
        else li.classList.remove('banned');
    });
}

function updateFavVisuals() {
    document.querySelectorAll('li').forEach(li => {
        li.classList.toggle('favorite', favList.includes(li.dataset.id));
    });
}

function startParticles() {
    if (particleInterval) return;
    particleInterval = setInterval(spawnNote, 600);
}
function stopParticles() {
    if (particleInterval) { clearInterval(particleInterval); particleInterval = null; }
}
function spawnNote() {
    if (!isPlaying) return;
    const note = document.createElement('div');
    note.className = 'note-particle';
    note.style.setProperty('--rnd-x', (Math.random() * 40 - 20) + 'px');
    note.style.setProperty('--rnd-rot', (Math.random() * 40 - 20) + 'deg');
    ui.particleSys.appendChild(note);
    setTimeout(() => note.remove(), 2000);
}
function updateJukeboxVisuals() {
    if (isPlaying) {
        ui.jukebox.classList.remove('paused');
        startParticles();
        ui.playBtn.textContent = '⏸';
    } else {
        ui.jukebox.classList.add('paused');
        stopParticles();
        ui.playBtn.textContent = '▶';
    }
}
function formatTime(c, t) {
    const f = s => { const m = Math.floor((s || 0) / 60); const sec = Math.floor((s || 0) % 60); return `${m}:${sec < 10 ? '0' : ''}${sec}`; };
    if (ui.curr) ui.curr.textContent = f(c);
    if (ui.tot) ui.tot.textContent = f(t);
}

// LISTENERS
ui.btnReload.onclick = () => { if (confirm(t('confirmRestart'))) chrome.runtime.reload(); };

function toggleGlobalPauseClass() {
    // Si isPlaying es true, QUITAMOS 'paused'. Si es false, la PONEMOS.
    document.body.classList.toggle('paused', !isPlaying);
}

function handlePlayPauseClick() {
    if (!currentTrackId) {
        sendMsg({ action: 'NEXT' });
        isPlaying = true;
    } else {
        sendMsg({ action: 'PAUSE' });
        isPlaying = !isPlaying;
    }
    
    // --- NUEVO: Sincronizar clase de pausa ---
    toggleGlobalPauseClass();
    
    updateJukeboxVisuals();
    updateVisualizerState();
}

ui.jukebox.onclick = handlePlayPauseClick;
ui.playBtn.onclick = handlePlayPauseClick;
ui.btnNext.onclick = () => sendMsg({ action: 'NEXT' });
ui.btnPrev.onclick = () => sendMsg({ action: 'PREV' });
ui.bar.addEventListener('input', () => isDragging = true);
ui.bar.addEventListener('change', () => { isDragging = false; sendMsg({ action: 'SEEK_TO', time: parseFloat(ui.bar.value) }); });
if (ui.vol) ui.vol.addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    sendMsg({ action: 'SET_VOLUME', value });
    if (value > 0) lastNonZeroVolume = value;
    updateVolumeIcon(value);
});
if (ui.volIcon) ui.volIcon.addEventListener('click', () => {
    if (!ui.vol) return;
    const current = parseFloat(ui.vol.value);
    if (current > 0.001) {
        lastNonZeroVolume = current;
        ui.vol.value = 0;
        sendMsg({ action: 'SET_VOLUME', value: 0 });
        updateVolumeIcon(0);
    } else {
        const restore = lastNonZeroVolume > 0.001 ? lastNonZeroVolume : 1;
        ui.vol.value = restore;
        sendMsg({ action: 'SET_VOLUME', value: restore });
        updateVolumeIcon(restore);
    }
});
ui.shuffle.onclick = () => { currMode = (currMode + 1) % MODES.length; sendMsg({ action: 'SET_SHUFFLE', mode: currMode }); ui.shuffleText.textContent = modeLabel(currMode); };
ui.btnSettings.onclick = () => chrome.runtime.openOptionsPage();
if (ui.btnNoticeConfig) ui.btnNoticeConfig.onclick = () => chrome.runtime.openOptionsPage();
if (ui.btnDismissNotice) ui.btnDismissNotice.onclick = () => {
    chrome.storage.local.set({ hasSeenImportNotice: true });
    ui.importNotice?.classList.add('hidden');
};
ui.search.addEventListener('input', (e) => {
    const query = e.target.value;
    renderSearchResults(query);
});
ui.search.addEventListener('focus', (e) => {
    if (e.target.value.trim().length > 0) renderSearchResults(e.target.value);
});
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'UPDATE_TIME' && !isDragging) {
        ui.bar.max = msg.duration; 
        ui.bar.value = msg.currentTime; 
        formatTime(msg.currentTime, msg.duration);
    } else if (msg.type === 'PLAYING_NEW') {
        // Al empezar una nueva, nos aseguramos de que isPlaying sea true
        isPlaying = true;
        toggleGlobalPauseClass();
        sendMsg({ action: 'GET_STATUS' }, updateUI);
    } else if (msg.type === 'STATE_CHANGED') {
        // Play/pausa desde fuera del popup, o fin de pista con espera entre canciones
        sendMsg({ action: 'GET_STATUS' }, updateUI);
    }
});

// Visualizador real: el motor envía la altura de cada barra por un puerto.
// Mientras no lleguen datos se mantiene la animación CSS de siempre.
let visPort = null;

function connectVisualizer() {
    if (visPort || !ui.visualizer) return;
    try {
        visPort = chrome.runtime.connect({ name: 'visualizer' });
        visPort.onMessage.addListener(renderVisFrame);
        visPort.onDisconnect.addListener(() => {
            void chrome.runtime.lastError; // El motor no estaba listo: se reintenta en el próximo updateUI
            visPort = null;
            ui.visualizer.classList.remove('live');
        });
    } catch (e) {
        visPort = null;
    }
}

function renderVisFrame(bars) {
    if (!Array.isArray(bars)) return;
    ui.visualizer.classList.add('live');
    Array.from(ui.visualizer.children).forEach((bar, i) => {
        bar.style.height = Math.max(4, Math.round((bars[i] || 0) * 100)) + '%';
    });
}

function initVisualizer() {
    if (!ui.visualizer) return;
    ui.visualizer.innerHTML = '';
    const barCount = 20; // Cantidad de barras

    for (let i = 0; i < barCount; i++) {
        const bar = document.createElement('div');
        bar.className = 'vis-bar';
        
        // Truco para que parezca real:
        // Asignamos una duración de animación aleatoria a cada barra
        // entre 0.8s y 1.5s
        const randomDuration = Math.random() * 0.7 + 0.8;
        bar.style.animationDuration = `${randomDuration}s`;
        
        ui.visualizer.appendChild(bar);
    }
}

// 2. CONTROLAR ESTADO (Añadir a tu función updateUI existente)
function updateVisualizerState() {
    if (!ui.visualizer) return;
    ui.visualizer.classList.toggle('active', isPlaying);
}


init();