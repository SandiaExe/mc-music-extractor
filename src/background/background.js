/* Ok yes is vibecoded, fine, but it last works properly, yes? YES!?..
I promised learns how works this extension, but man, the AI do everthing so damn fast. Well, is 
not production, so this could be consider a experiment? I never used cursor before, but waos. so cool, so clean.

Is a type of dark magic i guess. 

Sorry if my english is bad, I'm not a native speaker, if you are a native speakear pls play
with me, i would like to improve my english, i would to thank you. */

const OFFSCREEN_PATH = 'src/offscreen/offscreen.html';
let creating; // Variable de bloqueo

// Devuelve true si el offscreen NO existía y hubo que crearlo (o esperar a que se creara)
async function ensureOffscreenDocument() {
    const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_PATH);

    // 1. Verificar si ya existe (Rápido)
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [offscreenUrl]
    });

    if (existingContexts.length > 0) return false;

    // 2. Si ya se está creando, esperar a esa promesa (Evita duplicados)
    if (creating) {
        try { await creating; } catch (err) { return false; }
        return true;
    }

    // 3. Crear nuevo
    creating = chrome.offscreen.createDocument({
        url: OFFSCREEN_PATH,
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Music Player Engine',
    });

    try {
        await creating;
        console.log("Audio Engine is working! / So you open the console, and see the logs. YES IS VIBECODED!");
        return true;
    } catch (err) {
        if (!err.message.startsWith('Only a single offscreen')) {
            console.error("Error creando offscreen:", err);
        }
        return false;
    } finally {
        creating = null; // Liberar bloqueo
    }
}

// Reenvía al offscreen un mensaje que llegó cuando todavía no existía.
// Reintenta porque el motor puede tardar un momento en registrar su listener.
async function forwardToOffscreen(msg, attempts = 5) {
    for (let i = 0; i < attempts; i++) {
        try {
            const response = await chrome.runtime.sendMessage(msg);
            if (response) return response;
        } catch (err) {
            // Aún no hay receptor: reintentar
        }
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    console.error("El motor de audio no respondió a:", msg.action);
}

chrome.runtime.onStartup.addListener(() => {
    ensureOffscreenDocument().then(() => checkAutoplay());
});

chrome.runtime.onInstalled.addListener(() => {
    ensureOffscreenDocument();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'KEEP_ALIVE') return;

    // El offscreen no tiene acceso a chrome.storage: lee y guarda a través de nosotros
    if (msg.type === 'GET_ENGINE_STATE') {
        chrome.storage.local.get(msg.keys, sendResponse);
        return true;
    }
    if (msg.type === 'SAVE_STATE') {
        chrome.storage.local.set(msg.data, () => {
            if (chrome.runtime.lastError) console.error("Error guardando estado:", chrome.runtime.lastError);
        });
        return;
    }

    if (!msg.action) return;

    ensureOffscreenDocument().then((created) => {
        // Si ya existía, el offscreen recibió el mensaje y responde él mismo.
        // Si hubo que crearlo, el mensaje original se perdió: lo reenviamos.
        if (created) forwardToOffscreen(msg).then(sendResponse);
    });
    return true; // Mantiene el canal abierto para la respuesta reenviada
});

function checkAutoplay() {
    chrome.storage.local.get(['autoplayEnabled', 'autoplayDelay'], (data) => {
        if (data.autoplayEnabled) {
            const userDelay = (data.autoplayDelay || 0) * 1000;
            const engineDelay = 2500; // Tiempo para que el motor de audio termine de cargar
            setTimeout(() => {
                chrome.runtime.sendMessage({ action: 'START_AUTOPLAY' }).catch(() => {});
            }, userDelay + engineDelay);
        }
    });
}