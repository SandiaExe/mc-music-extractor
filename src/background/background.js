/* Ok yes is vibecoded, fine, but it last works properly, yes? YES!?..
I promised learns how works this extension, but man, the AI do everthing so damn fast. Well, is 
not production, so this could be consider a experiment? I never used cursor before, but waos. so cool, so clean.

Is a type of dark magic i guess. 

Sorry if my english is bad, I'm not a native speaker, if you are a native speakear pls play minecraft
with i would like to improve my english, i would to thank you. */

const OFFSCREEN_PATH = 'src/offscreen/offscreen.html';
let creating; // Variable de bloqueo

async function ensureOffscreenDocument() {
    const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_PATH);
    
    // 1. Verificar si ya existe (Rápido)
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [offscreenUrl]
    });

    if (existingContexts.length > 0) return;

    // 2. Si ya se está creando, esperar a esa promesa (Evita duplicados)
    if (creating) {
        await creating;
        return;
    }

    // 3. Crear nuevo
    creating = chrome.offscreen.createDocument({
        url: OFFSCREEN_PATH,
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Minecraft Music Player Engine',
    });

    try {
        await creating;
        console.log("Audio Engine is working! / So you open the console, and see the logs. YES IS VIBECODED!");
    } catch (err) {
        if (!err.message.startsWith('Only a single offscreen')) {
            console.error("Error creando offscreen:", err);
        }
    } finally {
        creating = null; // Liberar bloqueo
    }
}

chrome.runtime.onStartup.addListener(() => {
    ensureOffscreenDocument().then(() => checkAutoplay());
});

chrome.runtime.onInstalled.addListener(() => {
    ensureOffscreenDocument();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'KEEP_ALIVE') return;

    if (msg.action) {
        ensureOffscreenDocument();
    }
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