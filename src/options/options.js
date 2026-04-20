import { THEMES, DB_NAME, DB_VERSION } from '../utils/consts.js'; 

const els = {
    check: document.getElementById('checkAutoplay'),
    range: document.getElementById('rangeDelay'),
    val: document.getElementById('valDelay'),
    delayRow: document.getElementById('delayRow'),
    themeSelect: document.getElementById('selectTheme')
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
chrome.storage.local.get(['autoplayEnabled', 'autoplayDelay', 'theme'], (data) => {
    const themeKey = data.theme || 'sage';
    applyOptionsTheme(themeKey);
    if (els.check) {
        els.check.checked = data.autoplayEnabled || false;
        updateOpacity();
    }
    if (els.range) {
        els.range.value = data.autoplayDelay || 5;
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
if (els.themeSelect) {
    els.themeSelect.addEventListener('change', () => {
        const selected = els.themeSelect.value;
        chrome.storage.local.set({ theme: selected });
        applyOptionsTheme(selected);
    });
}

function updateOpacity() {
    if(els.delayRow) {
        els.delayRow.style.opacity = els.check.checked ? '1' : '0.5';
        els.delayRow.style.pointerEvents = els.check.checked ? 'auto' : 'none';
    }
}


// --- MUSIC IMPORTER ---

const ui = {
    input: document.getElementById('folderInput'),
    pBox: document.getElementById('progressBox'),
    pFill: document.getElementById('pFill'),
    status: document.getElementById('statusMsg'),
    logs: document.getElementById('logWindow')
};

function log(msg, err = false) {
    const d = document.createElement('div');
    d.className = err ? 'log-item error' : 'log-item';
    d.textContent = msg;
    if(ui.logs) ui.logs.prepend(d);
}

function openDB() {
    return new Promise((resolve, reject) => {
        const r = indexedDB.open(DB_NAME, DB_VERSION);
        r.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('music')) {
                db.createObjectStore('music');
            }
        };
        r.onsuccess = () => resolve(r.result);
        r.onerror = (e) => reject(e);
    });
}

// Normalize path to work on Windows (\), Mac, and Linux (/)
function normPath(path) {
    return (path || '').replace(/\\/g, '/');
}

if (ui.input) {
    ui.input.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;

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

        // 2. Find index (paths with / or \)
        const indexFile = files.find(f => 
            f.name.endsWith('.json') && normPath(f.webkitRelativePath).includes('indexes')
        );
        if (!indexFile) {
            ui.status.textContent = "Error: No .json file found in the 'indexes' folder. Make sure you have selected the game's 'assets' folder.";
            ui.pFill.style.background = '#ff595e';
            ui.pFill.style.width = '100%';
            return;
        }

        let json;
        try {
            json = JSON.parse(await indexFile.text());
        } catch (parseErr) {
            ui.status.textContent = "Error: The index file is not a valid JSON.";
            ui.pFill.style.background = '#ff595e';
            return;
        }
        const objects = json.objects || json;
        if (!objects || typeof objects !== 'object') {
            ui.status.textContent = "Error: The index does not have the expected format (missing 'objects').";
            ui.pFill.style.background = '#ff595e';
            return;
        }

        // 3. Filter songs (paths with / or \)
        const entries = Object.entries(objects).filter(([path]) => {
            const p = normPath(path);
            return (p.includes('music') || p.includes('records')) && p.endsWith('.ogg');
        });

        // 4. Process in batches (Chunks)
        try {
            const db = await openDB(); // This will now create the 'music' store
            let processed = 0;
            const total = entries.length;
            const chunkSize = 50; 

            ui.status.textContent = `Importing ${total} files...`;

            async function processChunk(start) {
                // THE ERROR USED TO HAPPEN HERE, IT SHOULDN'T NOW
                const tx = db.transaction('music', 'readwrite');
                const store = tx.objectStore('music');
                
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
                    requestAnimationFrame(() => processChunk(processed));
                } else {
                    ui.status.textContent = "COMPLETED! Restart the extension.";
                    ui.pFill.style.background = "#70e000";
                }
            }

            processChunk(0);
        } catch (err) {
            console.error(err);
            ui.status.textContent = "Critical Error: " + err.message;
            ui.pFill.style.background = "red";
        }
    });
}