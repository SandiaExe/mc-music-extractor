// I'm really lazy, sorry

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
    'lava_chicken.ogg': 'Lava Chicken',
    'bounce.ogg': 'Bounce'
};

// Pistas compuestas por C418 (OST y discos), por nombre de archivo
export const C418_TRACKS = new Set([
// volume alpha
  'key.ogg', 'door.ogg', 'subwoofer_lullaby.ogg', 'death.ogg', 'living_mice.ogg',
  'moog_city.ogg', 'haggstrom.ogg', 'minecraft.ogg', 'oxygene.ogg', 'equinoxe.ogg',
  'mice_on_venus.ogg', 'dry_hands.ogg', 'wet_hands.ogg', 'clark.ogg', 'chris.ogg',
  'excuse.ogg', 'sweden.ogg', 'dog.ogg', 'danny.ogg', 'beginning.ogg',
  'droopy_likes_ricochet.ogg', 'droopy_likes_your_face.ogg',

  // volume beta
  'ki.ogg', 'alpha.ogg', 'dead_voxel.ogg', 'blind_spots.ogg', 'flake.ogg',
  'moog_city_2.ogg', 'concrete_halls.ogg', 'biome_fest.ogg', 'mutation.ogg',
  'haunt_muskie.ogg', 'warmth.ogg', 'floating_trees.ogg', 'aria_math.ogg',
  'kyoto.ogg', 'ballad_of_the_cats.ogg', 'taswell.ogg', 'beginning_2.ogg',
  'dreiton.ogg', 'the_end.ogg', 'intro.ogg',

  // water update
  'axolotl.ogg', 'dragon_fish.ogg', 'shuniji.ogg',

  // music discs
  '13.ogg', 'cat.ogg', 'blocks.ogg', 'chirp.ogg', 'far.ogg', 'mall.ogg',
  'mellohi.ogg', 'stal.ogg', 'strad.ogg', 'ward.ogg', '11.ogg', 'wait.ogg'
]);

// Compositores por nombre de archivo. La clave es la que guarda la opción "Composer filter".
export const COMPOSERS = {
    c418: { name: 'C418', tracks: C418_TRACKS },
    lena_raine: {
        name: 'Lena Raine',
        tracks: new Set([
            // nether update
            'rubedo.ogg', 'chrysopoeia.ogg', 'so_below.ogg',
            // caves & cliffs
            'stand_tall.ogg', 'left_to_bloom.ogg', 'one_more_day.ogg', 'wending.ogg', 'infinite_amethyst.ogg',
            // the wild update
            'ancestry.ogg', 'aerie.ogg', 'firebugs.ogg', 'labyrinthine.ogg',
            // tricky trials
            'deeper.ogg', 'eld_unknown.ogg', 'endless.ogg',
            // music discs
            'pigstep.ogg', 'otherside.ogg', 'creator.ogg', 'creator_music_box.ogg'
        ])
    },
    kumi_tanioka: {
        name: 'Kumi Tanioka',
        tracks: new Set([
            'comforting_memories.ogg', 'floating_dream.ogg', 'an_ordinary_day.ogg',
            'komorebi.ogg', 'pokopoko.ogg', 'puzzlebox.ogg', 'watcher.ogg', 'yakusoku.ogg'
        ])
    },
    aaron_cherof: {
        name: 'Aaron Cherof',
        tracks: new Set([
            'a_familiar_room.ogg', 'bromeliad.ogg', 'crescent_dunes.ogg', 'echo_in_the_wind.ogg',
            'featherfall.ogg',
            // music discs
            'relic.ogg', 'precipice.ogg'
        ])
    },
    amos_roddy: {
        name: 'Amos Roddy',
        tracks: new Set([
            'below_and_above.ogg', 'broken_clocks.ogg', 'fireflies.ogg', 'lilypad.ogg', 'os_piano.ogg',
            // music discs
            'tears.ogg'
        ])
    },
    samuel_aberg: { name: 'Samuel Åberg', tracks: new Set(['5.ogg']) },
    hyper_potions: { name: 'Hyper Potions', tracks: new Set(['lava_chicken.ogg']) }
};

// Nombre del compositor de una pista, o null si no está en ninguna lista
export function getComposer(filename) {
    for (const composer of Object.values(COMPOSERS)) {
        if (composer.tracks.has(filename)) return composer.name;
    }
    return null;
}

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

    // Capitalizar cada palabra (ej: "aria math" -> "Aria Math")
    return name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

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
            "--text-sky": "#1a2516",
            "--border-sky": "#3e5235"
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
            "--text-sky": "#e0fffc",
            "--border-sky": "#66ffd9"
        }
    },
    "jungle": { 
        name: "Jungle",
        colors: {
            "--bg-sky-top": "#2d5a27",
            "--bg-sky-bot": "#1b3d17",
            "--card-bg": "#0d140c",
            "--input-bg": "#162214",
            "--accent": "#50c878",
            "--accent-hover": "#76e098",
            "--text-sky": "#e6ffed",
            "--border-sky": "#2e8b57"
        }
    },
    "tundra": { 
        name: "Tundra",
        colors: {
            "--bg-sky-top": "#e0f7fa",
            "--bg-sky-bot": "#b2ebf2",
            "--card-bg": "#10151a",
            "--input-bg": "#1e262e",
            "--accent": "#00d2ff",
            "--accent-hover": "#80eaff",
            "--text-sky": "#1a3a40",
            "--border-sky": "#4fc3f7"
        }
    },
    "cherry": { 
        name: "Cherry Grove",
        colors: {
            "--bg-sky-top": "#fbc4ab", // Rosa pétalo claro
            "--bg-sky-bot": "#ff8fa3", // Rosa cerezo
            "--card-bg": "#1a0f12",
            "--input-bg": "#2e1a1e",
            "--accent": "#ff4d6d",      // Rosa vibrante
            "--accent-hover": "#ff758f",
            "--text-sky": "#4a0e1c",      /* Texto burdeos oscuro */
            "--border-sky": "#ff8fa3"
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
            "--text-sky": "#ffecec",
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
            "--text-sky": "#f6e6ff",
            "--border-sky": "#d699ff"
        }
    },
    "aether": { 
        name: "Aether",
        colors: {
            "--bg-sky-top": "#fceabb",
            "--bg-sky-bot": "#f8b500",
            "--card-bg": "#1a1a10",
            "--input-bg": "#2d2d1a",
            "--accent": "#ffd900ec",
            "--accent-hover": "#fff44f",
            "--text-sky": "#4a3c00",
            "--border-sky": "#b8860b"
        }
    },
    "classic": {
        name: "Classic (GUI)",
        colors: {
            "--bg-sky-top": "#C6C6C6", // Gris claro de los menús
            "--bg-sky-bot": "#8B8B8B", // Gris sombra de los botones
            "--card-bg": "#1e1e1e",    // Fondo casi negro
            "--input-bg": "#404040",   // Fondo de input gris
            "--accent": "#ffffff83",      // Blanco para destacar
            "--accent-hover": "#C6C6C6",
            "--text-sky": "#212121",      /* Texto gris muy oscuro */
            "--border-sky": "#555555"
        }
    }
};