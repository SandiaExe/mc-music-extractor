import { THEMES, COMPOSERS, openMusicDB } from '../utils/consts.js'; 

const els = {
    check: document.getElementById('checkAutoplay'),
    range: document.getElementById('rangeDelay'),
    val: document.getElementById('valDelay'),
    delayRow: document.getElementById('delayRow'),
    startupRandom: document.getElementById('checkStartupRandom'),
    startupRandomRow: document.getElementById('startupRandomRow'),
    gapMode: document.getElementById('selectGapMode'),
    gapSeconds: document.getElementById('inputGapSeconds'),
    gapCustomRow: document.getElementById('gapCustomRow'),
    themeSelect: document.getElementById('selectTheme'),
    composer: document.getElementById('selectComposer')
};

function applyOptionsTheme(themeKey) {
    const theme = THEMES[themeKey] || THEMES['sage'];
    const root = document.documentElement;
    for (const [key, value] of Object.entries(theme.colors)) {
        root.style.setProperty(key, value);
    }
    root.style.setProperty('--text-primary', '#E0E0E0');
    root.style.setProperty('--text-secondary', '#A0A0A0');
}

// Load saved configuration
chrome.storage.local.get(['autoplayEnabled', 'autoplayDelay', 'autoplayRandom', 'gapMode', 'gapSeconds', 'theme', 'onlyC418', 'composerFilter'], (data) => {
    const themeKey = data.theme || 'sage';
    applyOptionsTheme(themeKey);
    if (els.check) {
        els.check.checked = data.autoplayEnabled || false;
        updateOpacity();
    }
    if (els.startupRandom) els.startupRandom.checked = data.autoplayRandom === true;
    if (els.composer) {
        els.composer.innerHTML = "";
        els.composer.appendChild(new Option("All composers", ""));
        for (const [key, composer] of Object.entries(COMPOSERS)) {
            els.composer.appendChild(new Option(composer.name, key));
        }
        // La antigua casilla "Only C418" equivale a filtrar por C418
        const saved = data.composerFilter ?? (data.onlyC418 === true ? 'c418' : '');
        els.composer.value = COMPOSERS[saved] ? saved : '';
    }
    if (els.gapMode) els.gapMode.value = data.gapMode || 'immediate';
    if (els.gapSeconds) els.gapSeconds.value = data.gapSeconds || 10;
    updateGapRow();
    if (els.range) {
        els.range.value = data.autoplayDelay ?? 5;
        if (els.val) els.val.innerText = els.range.value + 's';
    }
    if (els.themeSelect) {
        els.themeSelect.innerHTML = "";
        for (const [key, val] of Object.entries(THEMES)) {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = val.name;
            els.themeSelect.appendChild(option);
        }
        els.themeSelect.value = themeKey;
    }
});

// Listeners
if (els.check) {
    els.check.addEventListener('change', () => {
        chrome.storage.local.set({ autoplayEnabled: els.check.checked });
        updateOpacity();
    });
}
if (els.range) {
    els.range.addEventListener('input', () => {
        if (els.val) els.val.innerText = els.range.value + 's';
        chrome.storage.local.set({ autoplayDelay: parseInt(els.range.value) });
    });
}
if (els.startupRandom) {
    els.startupRandom.addEventListener('change', () => {
        chrome.storage.local.set({ autoplayRandom: els.startupRandom.checked });
    });
}
if (els.gapMode) els.gapMode.addEventListener('change', saveGapSettings);
if (els.gapSeconds) els.gapSeconds.addEventListener('change', saveGapSettings);
if (els.composer) {
    els.composer.addEventListener('change', () => {
        const value = els.composer.value;
        // Guardar y avisar al motor de audio para que aplique el cambio sin reiniciar
        chrome.storage.local.set({ composerFilter: value }, () => {
            chrome.runtime.sendMessage({ action: 'SET_COMPOSER', value }).catch(() => {});
        });
    });
}
if (els.themeSelect) {
    els.themeSelect.addEventListener('change', () => {
        const selected = els.themeSelect.value;
        chrome.storage.local.set({ theme: selected });
        applyOptionsTheme(selected);
    });
}

// Los segundos personalizados solo se muestran en el modo "Custom"
function updateGapRow() {
    if (els.gapCustomRow) els.gapCustomRow.style.display = els.gapMode?.value === 'custom' ? 'flex' : 'none';
}

function saveGapSettings() {
    const mode = els.gapMode.value;
    // Limitar a lo que admite el campo (1 s - 1 h)
    const seconds = Math.min(3600, Math.max(1, parseInt(els.gapSeconds.value) || 10));
    els.gapSeconds.value = seconds;
    updateGapRow();
    // Guardar y avisar al motor de audio para que aplique el cambio sin reiniciar
    chrome.storage.local.set({ gapMode: mode, gapSeconds: seconds }, () => {
        chrome.runtime.sendMessage({ action: 'SET_GAP', mode, seconds }).catch(() => {});
    });
}

// Las opciones que dependen de "Play on startup" se atenúan si está desactivado
function updateOpacity() {
    [els.delayRow, els.startupRandomRow].forEach(row => {
        if (!row) return;
        row.style.opacity = els.check.checked ? '1' : '0.5';
        row.style.pointerEvents = els.check.checked ? 'auto' : 'none';
    });
}


// --- MUSIC IMPORTER ---

const ui = {
    input: document.getElementById('folderInput'),
    pBox: document.getElementById('progressBox'),
    pFill: document.getElementById('pFill'),
    status: document.getElementById('statusMsg'),
    loading: document.getElementById('loadingNotice'),
    logs: document.getElementById('logWindow')
};

function log(msg, err = false) {
    const d = document.createElement('div');
    d.className = err ? 'log-item error' : 'log-item';
    d.textContent = msg;
    if(ui.logs) ui.logs.prepend(d);
}

// Shows the loading notice with the given text, or hides it when called without text
function setLoading(text) {
    if (!ui.loading) return;
    ui.loading.textContent = text || '';
    ui.loading.hidden = !text;
}

// Normalize path to work on Windows (\), Mac, and Linux (/)
function normPath(path) {
    return (path || '').replace(/\\/g, '/');
}

if (ui.input) {
    // The browser can take a while to read the folder before 'change' fires
    ui.input.addEventListener('click', () => {
        ui.input.value = ''; // So picking the same folder again fires 'change'
        setLoading("⏳ Waiting for the folder... reading it can take a moment.");
    });
    ui.input.addEventListener('cancel', () => setLoading());

    ui.input.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) { setLoading(); return; }

        setLoading("⏳ Loading files, please wait...");

        ui.pBox.style.display = 'block';
        if(ui.logs) ui.logs.style.display = 'block';
        ui.status.textContent = "Analyzing structure...";

        // 1. Quick mapping: by filename (hash) and normalized relative path (Windows/Mac/Linux)
        const fileMap = new Map();
        files.forEach(f => {
            fileMap.set(f.name, f);
            const norm = normPath(f.webkitRelativePath);
            const baseName = norm.split('/').pop();
            if (baseName && baseName !== f.name) fileMap.set(baseName, f);
        });

        // 2. Find index: Filter all JSON files in 'indexes' and pick the one with the highest number in its name
        const indexFiles = files.filter(f => 
            f.name.endsWith('.json') && normPath(f.webkitRelativePath).includes('indexes')
        );

        if (!indexFiles.length) {
            ui.status.textContent = "Error: No .json file found in the 'indexes' folder. Make sure you have selected the game's 'assets' folder.";
            ui.pFill.style.background = '#ff595e';
            ui.pFill.style.width = '100%';
            setLoading();
            return;
        }

        // Ordenamos de mayor a menor extrayendo el número del nombre (ej: "32.json" -> 32)
        indexFiles.sort((a, b) => {
            const numA = parseInt(a.name) || 0;
            const numB = parseInt(b.name) || 0;
            return numB - numA; // Descendente: el mayor primero
        });

        const indexFile = indexFiles[0];
        log(`Using index: ${indexFile.name}`); 

        let json;
        try {
            json = JSON.parse(await indexFile.text());
        } catch (parseErr) {
            ui.status.textContent = "Error: The index file is not a valid JSON.";
            ui.pFill.style.background = '#ff595e';
            setLoading();
            return;
        }
        const objects = json.objects || json;
        if (!objects || typeof objects !== 'object') {
            ui.status.textContent = "Error: The index does not have the expected format (missing 'objects').";
            ui.pFill.style.background = '#ff595e';
            setLoading();
            return;
        }

        // 3. Filter songs (paths with / or \)
        const entries = Object.entries(objects).filter(([path]) => {
            const p = normPath(path);
            return (p.includes('music') || p.includes('records')) && p.endsWith('.ogg');
        });

        // No vaciar la biblioteca actual si esta carpeta no trae ninguna canción
        const hasTracks = entries.some(([, info]) => {
            const hash = info && (typeof info === 'object' ? info.hash : info);
            return hash && fileMap.has(hash);
        });
        if (!hasTracks) {
            ui.status.textContent = "Error: No music files found. Make sure the folder contains 'objects' with the game sounds.";
            ui.pFill.style.background = '#ff595e';
            ui.pFill.style.width = '100%';
            setLoading();
            return;
        }

        const failImport = (err) => {
            console.error(err);
            ui.status.textContent = "Critical Error: " + (err?.message || "could not save the files");
            ui.pFill.style.background = "red";
            setLoading();
        };

        // 4. Process in batches (Chunks)
        try {
            const db = await openMusicDB();
            let processed = 0;
            const total = entries.length;
            const chunkSize = 50; 

            ui.status.textContent = `Importing ${total} files...`;

            async function processChunk(start) {
                // THE ERROR USED TO HAPPEN HERE, IT SHOULDN'T NOW
                const tx = db.transaction('music', 'readwrite');
                const store = tx.objectStore('music');
                // Reemplazar la biblioteca anterior (evita mezclar pistas de otras versiones)
                if (start === 0) store.clear();
                
                const end = Math.min(start + chunkSize, total);

                for (let i = start; i < end; i++) {
                    const [path, info] = entries[i];
                    const hash = info && (typeof info === 'object' ? info.hash : info);
                    const realFile = hash ? fileMap.get(hash) : null;
                    const name = normPath(path).split('/').pop();

                    if (realFile && name) {
                        store.put(realFile, name);
                        log(`OK: ${name}`);
                    }
                }

                await new Promise((resolve, reject) => {
                    tx.oncomplete = resolve;
                    tx.onerror = reject;
                    tx.onabort = reject;
                });

                processed = end;
                const pct = (processed / total) * 100;
                ui.pFill.style.width = `${pct}%`;
                ui.status.textContent = `${processed} / ${total}`;

                if (processed < total) {
                    requestAnimationFrame(() => processChunk(processed).catch(failImport));
                } else {
                    ui.status.textContent = "COMPLETED! Your library is ready.";
                    // Avisar al motor de audio para que relea la biblioteca sin reiniciar
                    chrome.runtime.sendMessage({ action: 'RELOAD_LIBRARY' }).catch(() => {});
                    ui.pFill.style.background = "#70e000";
                    setLoading();
                }
            }

            await processChunk(0);
        } catch (err) {
            failImport(err);
        }
    });
}