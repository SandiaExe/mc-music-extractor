// I know this is a little unnecesary, but yeah, it's unnecesary

export const DISC_MAP = {
    '13.ogg': '13',
    'cat.ogg': 'Cat',
    'blocks.ogg': 'Blocks',
    'chirp.ogg': 'Chirp',
    'far.ogg': 'Far',
    'mall.ogg': 'Mall',
    'mellohi.ogg': 'Mellohi',
    'stal.ogg': 'Stal',
    'strad.ogg': 'Strad',
    'ward.ogg': 'Ward',
    '11.ogg': '11',
    'wait.ogg': 'Wait',
    'otherside.ogg': 'Otherside',
    '5.ogg': '5',
    'pigstep.ogg': 'Pigstep',
    'relic.ogg': 'Relic',
    'creator.ogg': 'Creator',
    'creator_music_box.ogg': 'Creator (music box)',
    'precipice.ogg': 'Precipice',
    'tears.ogg': 'Tears',
    'lava_chicken.ogg': 'Lava Chicken'
};

export const DB_NAME = "MCPlayerDB";
export const DB_VERSION = 4;

// FUNCIÓN PARA MAYÚSCULAS Y LIMPIEZA
export function getNiceName(filename) {
    let name = filename;
    
    if (DISC_MAP[filename]) {
        name = DISC_MAP[filename];
    } else {
        // Quitar extensión y guiones bajos
        name = filename.replace('.ogg', '').replace(/_/g, ' ');
    }

    // Capitalizar la primera letra siempre (ej: "ancestry" -> "Ancestry")
    return name.charAt(0).toUpperCase() + name.slice(1);
}

// TEMAS CON ALTO CONTRASTE
export const THEMES = {
    "sage": { 
        name: "Forest (Default)",
        colors: {
            "--bg-sky-top": "#9CAF88",
            "--bg-sky-bot": "#859874",
            "--card-bg": "#1E1E1E",
            "--input-bg": "#2C2C2C",
            "--accent": "#8EC596",
            "--accent-hover": "#A8D5AF",
            "--text-sky": "#1a2516",      /* Texto oscuro para fondo claro */
            "--border-sky": "#3e5235"
        }
    },
    "nether": { 
        name: "Nether",
        colors: {
            "--bg-sky-top": "#5e1515",
            "--bg-sky-bot": "#360808",
            "--card-bg": "#1a0b0b",
            "--input-bg": "#2e1212",
            "--accent": "#ff6b6b",
            "--accent-hover": "#ff8c8c",
            "--text-sky": "#ffecec",      /* Texto claro para fondo oscuro */
            "--border-sky": "#ff6b6b"
        }
    },
    "end": { 
        name: "The End",
        colors: {
            "--bg-sky-top": "#261a36",
            "--bg-sky-bot": "#0f0814",
            "--card-bg": "#110b14",
            "--input-bg": "#231829",
            "--accent": "#d699ff",
            "--accent-hover": "#e5bfff",
            "--text-sky": "#f6e6ff",      /* Texto claro */
            "--border-sky": "#d699ff"
        }
    },
    "ocean": { 
        name: "Ocean",
        colors: {
            "--bg-sky-top": "#2b566e",
            "--bg-sky-bot": "#183647",
            "--card-bg": "#0f1e26",
            "--input-bg": "#1b3340",
            "--accent": "#55d1b2",
            "--accent-hover": "#7be0c7",
            "--text-sky": "#e0fffc",      /* Texto claro */
            "--border-sky": "#66ffd9"
        }
    },
    "classic": {
        name: "Classic",
        colors: {
            "--bg-sky-top": "#6a9ce6",
            "--bg-sky-bot": "#4ba3e3",
            "--card-bg": "#222",
            "--input-bg": "#333",
            "--accent": "#70e000",
            "--accent-hover": "#8cff1a",
            "--text-sky": "#ffffff",      /* Texto blanco */
            "--border-sky": "#70e000"
        }
    }
};