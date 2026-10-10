// Core Game Logic

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let width, height;
let shadowCanvas = document.createElement('canvas');
let shadowCtx = shadowCanvas.getContext('2d');

// ======= VARIABILI MOBILE =======
let mobileBuildMode = false; // false = Rompi, true = Piazza
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
// ================================

function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    ctx.imageSmoothingEnabled = false; // Keep pixel art sharp

    shadowCanvas.width = width;
    shadowCanvas.height = height;
    shadowCtx.imageSmoothingEnabled = false;
}

window.addEventListener('resize', resize);
resize();

// Game Constants
const TILE_SIZE = 16;
const SCALE = 4;
const SCALED_TILE = TILE_SIZE * SCALE;
const VERSION = Date.now(); // Cache buster
const MAX_REACH = 4; // Distanza massima d'azione (in tile)

// Configura i database locali nel browser (IndexedDB tramite localForage)
const dbUtenti = localforage.createInstance({ name: "Blochnyy_Utenti" });
const dbMondi = localforage.createInstance({ name: "Blochnyy_Mondi" });

// Funzione di utilità per raggruppare tutti i tipi di pietra
const isStone = (type) => type === 'stone' || type === 'deep_stone' || type === 'deep_stone_2';

// Load Textures
const textures = {
    player: new Image(), grass: new Image(), sand: new Image(), water: new Image(),
    stone: new Image(), daisy: new Image(), poppy: new Image(), violet: new Image(),
    tree: new Image(), dirt: new Image(), mazzascia: new Image(), wood: new Image(), raw_stone: new Image(),
    bread: new Image(), purified_water: new Image(),
    cow: new Image(), pig: new Image(), sheep: new Image()
};

const gui = { img: new Image(), slots: [], loaded: false };

const textureSources = {
    player: 'Texture/player.png', grass: 'Texture/floor/grass.png', sand: 'Texture/floor/sand.png',
    water: 'Texture/fluid/water.png', stone: 'Texture/wall/Stone.png', daisy: 'Texture/plant/floor/daisy.png',
    poppy: 'Texture/plant/floor/poppy.png', violet: 'Texture/plant/floor/violet.png',
    tree: 'Texture/plant/wall/tree.png', dirt: 'Texture/floor/dirt.png',
    mazzascia: 'Texture/objects/stone clubaxe.png', wood: 'Texture/objects/wood log.png', raw_stone: 'Texture/objects/stone.png',
    bread: 'Texture/objects/bread.png', purified_water: 'Texture/objects/purified water.png',
    cow: 'Texture/entities/cow.png', pig: 'Texture/entities/pig.png', sheep: 'Texture/entities/sheep.png'
};

// Asset Loading Logic
const assetPromises = [];

for (let key in textures) {
    assetPromises.push(new Promise((resolve) => {
        textures[key].onload = () => resolve();
        textures[key].onerror = () => resolve();
        textures[key].src = textureSources[key] + '?v=' + VERSION;
    }));
}

const guiLoadPromise = new Promise((resolve) => {
    gui.img.onload = () => resolve();
    gui.img.onerror = () => resolve();
    gui.img.src = 'Texture/GUI/Inventory.png?v=' + VERSION;
});
assetPromises.push(guiLoadPromise);

const timeoutPromise = new Promise(resolve => setTimeout(resolve, 5000));

Promise.race([Promise.all(assetPromises), timeoutPromise]).then(() => {
    console.log("Assets ready or timeout reached, starting game...");
    setupGUI();
    if (isGameStarted) initInventoryUI();
    requestAnimationFrame(loop);
});

const mapCache = new Map();

function cyrb128(str) {
    let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (let i = 0, k; i < str.length; i++) {
        k = str.charCodeAt(i);
        h1 = h2 ^ Math.imul(h1 ^ k, 597399067); h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
        h3 = h4 ^ Math.imul(h3 ^ k, 951274213); h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067); h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213); h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    return (h1 ^ h2 ^ h3 ^ h4) >>> 0;
}

let noise2D;
let decorationNoise;

function setWorldSeed(seedStr) {
    let currentSeed;
    if (!seedStr || seedStr.trim() === '') currentSeed = Math.floor(Math.random() * 1000000);
    else currentSeed = cyrb128(seedStr);
    noise2D = new SimpleNoise(currentSeed);
    decorationNoise = new SimpleNoise(currentSeed + 12345);
    mapCache.clear();
}

setWorldSeed('');

const ditherOverlays = {};
const LIGHTNESS = { 'grass': 1, 'sand': 2, 'dirt': 3 };

function createDitherOverlays(img) {
    const overlays = { top: null, right: null, bottom: null, left: null };
    const cvs = document.createElement('canvas'); cvs.width = TILE_SIZE; cvs.height = TILE_SIZE;
    const ctx = cvs.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 4 * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE, 0, 0, TILE_SIZE, TILE_SIZE);
    let baseImgData = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE);

    const shouldKeepPixel = (x, y, dir) => {
        let dist = 0, px = 0;
        if (dir === 'top') { dist = y; px = x; } if (dir === 'bottom') { dist = TILE_SIZE - 1 - y; px = x; }
        if (dir === 'left') { dist = x; px = y; } if (dir === 'right') { dist = TILE_SIZE - 1 - x; px = y; }
        if (dist >= 3) return false;
        const pattern = [[true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
            [false, true, false, false, false, true, false, false, false, true, false, false, false, true, false, false],
            [false, false, true, false, false, false, false, false, false, false, true, false, false, false, false, false]];
        return pattern[dist][px % 16];
    };

    for (let dir of ['top', 'right', 'bottom', 'left']) {
        let overlayData = new ImageData(new Uint8ClampedArray(baseImgData.data), TILE_SIZE, TILE_SIZE);
        for (let y = 0; y < TILE_SIZE; y++) {
            for (let x = 0; x < TILE_SIZE; x++) {
                if (!shouldKeepPixel(x, y, dir)) overlayData.data[(y * TILE_SIZE + x) * 4 + 3] = 0;
            }
        }
        let outCvs = document.createElement('canvas'); outCvs.width = TILE_SIZE; outCvs.height = TILE_SIZE;
        outCvs.getContext('2d').putImageData(overlayData, 0, 0);
        overlays[dir] = outCvs;
    }
    return overlays;
}

function checkAndGenerateOverlays() {
    for (let type of ['grass', 'sand', 'dirt']) {
        if (!ditherOverlays[type] && textures[type].complete && textures[type].naturalWidth > 0) {
            ditherOverlays[type] = createDitherOverlays(textures[type]);
        }
    }
}

function getTileRawType(x, y) {
    const elevation = noise2D.noise2D(x * 0.05, y * 0.05);
    if (elevation > 0.70) return 'deep_stone_2'; 
    if (elevation > 0.55) return 'deep_stone';   
    if (elevation > 0.40) return 'stone';        
    if (elevation > -0.1) return 'grass';
    if (elevation > -0.3) return 'sand';
    return 'water';
}

function isConnection(baseType, targetType) {
    if (baseType === 'stone') return isStone(targetType);
    if (baseType === 'deep_stone') return targetType === 'deep_stone' || targetType === 'deep_stone_2';
    if (baseType === 'deep_stone_2') return targetType === 'deep_stone_2';
    if (baseType === 'grass' || baseType === 'sand' || baseType === 'dirt') {
        return ['grass', 'sand', 'dirt', 'stone', 'deep_stone', 'deep_stone_2'].includes(targetType);
    }
    return false;
}

function getEffectiveType(x, y) {
    const key = `${x},${y}`;
    const mod = worldModifications.get(key);
    if (mod && mod.type) return mod.type;
    return getTileRawType(x, y);
}

const MASK_MAP = {
    0: { variant: 0, rot: 0 }, 4: { variant: 1, rot: 0 }, 8: { variant: 1, rot: 90 }, 1: { variant: 1, rot: 180 }, 2: { variant: 1, rot: 270 },
    6: { variant: 2, rot: 0 }, 12: { variant: 2, rot: 90 }, 9: { variant: 2, rot: 180 }, 3: { variant: 2, rot: 270 },
    5: { variant: 3, rot: 90, isStraight: true }, 10: { variant: 3, rot: 0, isStraight: true },
    14: { variant: 3, rot: 0 }, 13: { variant: 3, rot: 90 }, 11: { variant: 3, rot: 180 }, 7: { variant: 3, rot: 270 }, 15: { variant: 4, rot: 0 }
};

function getTile(x, y) {
    const key = `${x},${y}`;
    if (mapCache.has(key)) return mapCache.get(key);
    if (mapCache.size > 2000) mapCache.clear();

    const type = getEffectiveType(x, y);
    const mod = worldModifications.get(key);
    let mask = 0;

    if (type === 'grass' || type === 'sand' || type === 'dirt' || isStone(type)) {
        if (isConnection(type, getEffectiveType(x, y - 1))) mask |= 1; 
        if (isConnection(type, getEffectiveType(x + 1, y))) mask |= 2; 
        if (isConnection(type, getEffectiveType(x, y + 1))) mask |= 4; 
        if (isConnection(type, getEffectiveType(x - 1, y))) mask |= 8; 
    }

    const tileData = MASK_MAP[mask] || { variant: 0, rot: 0 };
    let decoration = null;

    if (!mod || mod.decoration === undefined) {
        if (type === 'grass') {
            const decVal = decorationNoise.noise2D(x * 0.2, y * 0.2);
            if (decVal > 0.6) decoration = 'tree';
            else if (decVal > 0.5) decoration = 'daisy';
            else if (decVal > 0.4) decoration = 'poppy';
            else if (decVal > 0.3) decoration = 'violet';
        }
    } else decoration = mod.decoration;

    const tile = { type, variant: tileData.variant, rot: tileData.rot, decoration, isStraight: tileData.isStraight || false };
    if (mod) Object.assign(tile, mod);

    mapCache.set(key, tile);
    return tile;
}

const worldModifications = new Map();

const player = {
    x: 0, y: 0, speed: 4, vx: 0, vy: 0, dir: 0, flipX: false, frame: 0, animTime: 0,
    hands: [{ type: 'mazzascia', count: 1 }, null],
    inventory: [null, null, null, null, null, null, null, null, null, null],
    selectedHand: 0,
    level: 1, score: 0, hp: 10, maxHp: 10,
    energy: 100, hunger: 100, thirst: 100
};

function resetPlayerToDefaults() {
    player.x = 0; player.y = 0; player.vx = 0; player.vy = 0; player.selectedHand = 0;
    player.hands = [{ type: 'mazzascia', count: 1 }, null];
    player.inventory = [
        { type: 'bread', count: 10 },
        { type: 'purified_water', count: 10 },
        null, null, null, null, null, null, null, null
    ];
    droppedItems = [];
    entities = [];
}

function getItemIcon(type) {
    if (!type) return null;
    const iconMap = { 'stone': textureSources.stone, 'tree': textureSources.tree, 'daisy': textureSources.daisy, 'poppy': textureSources.poppy, 'violet': textureSources.violet, 'dirt': textureSources.dirt, 'mazzascia': textureSources.mazzascia, 'wood': textureSources.wood, 'raw_stone': textureSources.raw_stone, 'bread': textureSources.bread, 'purified_water': textureSources.purified_water };
    return iconMap[type] || null;
}

let droppedItems = [];
let entities = [];
let damageNumbers = [];

function giveItem(type, count = 1) {
    for (let arr of [player.hands, player.inventory]) {
        for (let i = 0; i < arr.length; i++) {
            if (arr[i] && arr[i].type === type && arr[i].count !== Infinity) {
                if (type === 'mazzascia') continue;
                arr[i].count += count; return true;
            }
        }
    }
    for (let arr of [player.hands, player.inventory]) {
        for (let i = 0; i < arr.length; i++) {
            if (!arr[i]) {
                arr[i] = { type, count }; return true;
            }
        }
    }
    return false;
}

const keys = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };

let screenMouseX = 0; let screenMouseY = 0; let isMouseOnScreen = false;

window.addEventListener('keydown', (e) => { if (keys.hasOwnProperty(e.key) || keys.hasOwnProperty(e.key.toLowerCase())) { keys[e.key] = true; keys[e.key.toLowerCase()] = true; }});
window.addEventListener('keyup', (e) => { if (keys.hasOwnProperty(e.key) || keys.hasOwnProperty(e.key.toLowerCase())) { keys[e.key] = false; keys[e.key.toLowerCase()] = false; }});
canvas.addEventListener('mousemove', (e) => {
    if (!isGameStarted) return;
    const rect = canvas.getBoundingClientRect(); screenMouseX = e.clientX - rect.left; screenMouseY = e.clientY - rect.top; isMouseOnScreen = true;
});
canvas.addEventListener('mouseleave', () => { isMouseOnScreen = false; });

// ==========================================
// JOYSTICK E SISTEMA MOBILE
// ==========================================
const joystickZone = document.getElementById('joystick-zone');
let knob = joystickZone ? joystickZone.querySelector('.joystick-knob') : null;
if (!knob && joystickZone) { knob = document.createElement('div'); knob.className = 'joystick-knob'; joystickZone.appendChild(knob); }

let joyActive = false, joyCenter = { x: 0, y: 0 }, joyVector = { x: 0, y: 0 };

if(joystickZone) {
    joystickZone.addEventListener('touchstart', (e) => {
        e.preventDefault(); joyActive = true;
        const rect = joystickZone.getBoundingClientRect();
        joyCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        updateJoystick(e.touches[0]);
    }, { passive: false });
    joystickZone.addEventListener('touchmove', (e) => { e.preventDefault(); if (joyActive) updateJoystick(e.touches[0]); }, { passive: false });
    
    const stopJoystick = () => { joyActive = false; joyVector = { x: 0, y: 0 }; knob.style.transform = `translate(-50%, -50%)`; };
    joystickZone.addEventListener('touchend', stopJoystick);
    joystickZone.addEventListener('touchcancel', stopJoystick);
}

function updateJoystick(touch) {
    let dx = touch.clientX - joyCenter.x; let dy = touch.clientY - joyCenter.y;
    const maxDist = 50, dist = Math.hypot(dx, dy);
    if (dist > maxDist) { dx = (dx / dist) * maxDist; dy = (dy / dist) * maxDist; }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    joyVector.x = dx / maxDist; joyVector.y = dy / maxDist;
}

// Inizializza i controlli mobile: aggiunge tasto Cambio Mano e tasto Piazza/Rompi
function initMobileControls() {
    if (isTouchDevice) {
        // Tasto CAMBIO MANO
        let toggleBtn = document.getElementById('mobile-action-toggle');
        if (!toggleBtn) {
            toggleBtn = document.createElement('div');
            toggleBtn.id = 'mobile-action-toggle';
            document.body.appendChild(toggleBtn);
        }
        toggleBtn.style.display = 'flex';
        toggleBtn.innerHTML = '🔄'; 
        
        toggleBtn.onclick = (e) => {
            e.preventDefault();
            player.selectedHand = (player.selectedHand === 0) ? 1 : 0;
            updateInventoryUI();
        };

        // Nuovo Tasto PIAZZA / ROMPI
        let buildBtn = document.getElementById('mobile-build-toggle');
        if (!buildBtn) {
            buildBtn = document.createElement('div');
            buildBtn.id = 'mobile-build-toggle';
            document.body.appendChild(buildBtn);
        }
        buildBtn.style.display = 'flex';
        buildBtn.innerHTML = mobileBuildMode ? '🧱' : '⛏️';
        
        buildBtn.onclick = (e) => {
            e.preventDefault();
            mobileBuildMode = !mobileBuildMode;
            buildBtn.innerHTML = mobileBuildMode ? '🧱' : '⛏️';
        };

        const controls = document.getElementById('mobile-controls');
        if(controls) controls.style.display = 'block';
    }
}

// Eventi Touch Unificati (Mobile)
canvas.addEventListener('touchstart', (e) => {
    if(e.touches.length > 1) return; // Ignora multi-touch per interagire
    const rect = canvas.getBoundingClientRect();
    const touchX = e.touches[0].clientX - rect.left;
    const touchY = e.touches[0].clientY - rect.top;

    // Utilizza in modo pulito la variabile controllata dal nuovo bottone "Piazza/Rompi"
    handleInteraction(touchX, touchY, mobileBuildMode);
}, { passive: false });

function checkCollision(px, py, ignoreEntityId = null) {
    const pLeft = px - SCALED_TILE * 0.25; const pRight = px + SCALED_TILE * 0.25;
    const pTop = py - SCALED_TILE * 0.2; const pBottom = py + SCALED_TILE * 0.1;
    const startCol = Math.floor(pLeft / SCALED_TILE); const endCol = Math.floor(pRight / SCALED_TILE);
    const startRow = Math.floor(pTop / SCALED_TILE); const endRow = Math.floor(pBottom / SCALED_TILE);

    for (let y = startRow; y <= endRow; y++) {
        for (let x = startCol; x <= endCol; x++) {
            const tile = getTile(x, y), tileX = x * SCALED_TILE, tileY = y * SCALED_TILE;
            if (isStone(tile.type) && (pRight > tileX && pLeft < tileX + SCALED_TILE && pBottom > tileY && pTop < tileY + SCALED_TILE)) return true;
            if (tile.decoration === 'tree') {
                const tLeft = tileX + SCALED_TILE * 0.3, tRight = tileX + SCALED_TILE * 0.7, tTop = tileY + SCALED_TILE * 0.5, tBottom = tileY + SCALED_TILE * 0.9;
                if (pRight > tLeft && pLeft < tRight && pBottom > tTop && pTop < tBottom) return true;
            }
        }
    }
    
    // Check entities collision
    for (let e of entities) {
        if (e.id === ignoreEntityId) continue;
        const eLeft = e.x - SCALED_TILE * 0.25; const eRight = e.x + SCALED_TILE * 0.25;
        const eTop = e.y - SCALED_TILE * 0.2; const eBottom = e.y + SCALED_TILE * 0.1;
        if (pRight > eLeft && pLeft < eRight && pBottom > eTop && pTop < eBottom) return true;
    }
    
    // Check player collision
    if (ignoreEntityId !== 'player') {
        const plLeft = player.x - SCALED_TILE * 0.25; const plRight = player.x + SCALED_TILE * 0.25;
        const plTop = player.y - SCALED_TILE * 0.2; const plBottom = player.y + SCALED_TILE * 0.1;
        if (pRight > plLeft && pLeft < plRight && pBottom > plTop && pTop < plBottom) return true;
    }

    return false;
}

let lastTime = performance.now(); let gameTime = 0.2; let shadowSkew = 0; let shadowLength = 0; let shadowAlpha = 0; let ambientColor = 'rgba(0,0,0,0)';
let draggedItem = null; let draggedItemSource = null; let isGameStarted = false; let currentAccount = null; let activeWorldId = null;

// Configurazione Supabase
const SUPABASE_URL = "INSERISCI_IL_TUO_SUPABASE_URL";
const SUPABASE_KEY = "INSERISCI_LA_TUA_SUPABASE_ANON_KEY";
let supabaseClient = null;
if (window.supabase && SUPABASE_URL.startsWith('http')) {
    try { supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY); } catch(e) {}
}

async function loadCloudWorlds() {
    if (!supabaseClient) return;
    const { data, error } = await supabaseClient.from('worlds').select('id, name, seed').eq('user_id', currentAccount.id);
    if (!error && data) currentAccount.worlds = data;
}

async function loadAccount() {
    const lastUser = localStorage.getItem('blochnyy_last_active_user');
    if (lastUser === 'anonymous_profile') {
        const anonProfile = await dbUtenti.getItem('anonymous_profile');
        if (anonProfile) {
            currentAccount = anonProfile;
            showProfileView();
            return;
        }
    }

    if (!supabaseClient) return showLoginView();
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        currentAccount = {
            id: session.user.id,
            email: session.user.email,
            displayName: session.user.user_metadata.username || session.user.email,
            worlds: []
        };
        await loadCloudWorlds();
        showProfileView();
        return;
    }
    showLoginView();
}

async function saveAccountData() {
    if (!currentAccount || !isGameStarted || !activeWorldId) return;
    const worldData = {
        playerX: player.x, playerY: player.y, gameTime: gameTime,
        inventory: player.inventory.map(item => item ? { type: item.type, count: item.count === Infinity ? 'INFINITY' : item.count } : null),
        hands: player.hands.map(item => item ? { type: item.type, count: item.count === Infinity ? 'INFINITY' : item.count } : null),
        modifications: Array.from(worldModifications.entries()),
        droppedItems: droppedItems.map(di => ({ ...di }))
    };
    const name = currentAccount.worlds.find(w => w.id === activeWorldId)?.name || "World";
    const seed = currentAccount.worlds.find(w => w.id === activeWorldId)?.seed || "0";
    
    if (currentAccount.id === 'anonymous') {
        await dbMondi.setItem(activeWorldId, { saveData: worldData });
        await dbUtenti.setItem('anonymous_profile', currentAccount);
        return;
    }

    if (!supabaseClient) return;
    await supabaseClient.from('worlds').upsert({
        id: activeWorldId,
        user_id: currentAccount.id,
        name: name,
        seed: seed,
        save_data: JSON.stringify(worldData)
    });
}

window.addEventListener('beforeunload', saveAccountData);
setInterval(() => { if (isGameStarted) saveAccountData(); }, 30000);

function showLoginView() { document.getElementById('login-view').style.display = 'flex'; document.getElementById('register-view').style.display = 'none'; document.getElementById('profile-view').style.display = 'none'; }
function showRegisterView() { document.getElementById('login-view').style.display = 'none'; document.getElementById('register-view').style.display = 'flex'; document.getElementById('profile-view').style.display = 'none'; }
function showProfileView() { document.getElementById('login-view').style.display = 'none'; document.getElementById('register-view').style.display = 'none'; document.getElementById('profile-view').style.display = 'flex'; document.getElementById('display-username').textContent = currentAccount.displayName; renderSavedWorlds(); }

async function renderSavedWorlds() {
    const list = document.getElementById('saved-worlds-list'); list.innerHTML = '<div style="color:rgba(255,255,255,0.5); text-align:center; padding: 10px;">Caricamento...</div>';
    if (!currentAccount.worlds || currentAccount.worlds.length === 0) { list.innerHTML = '<div style="color:rgba(255,255,255,0.5); text-align:center; padding: 10px;">No saved worlds yet.</div>'; return; }
    list.innerHTML = '';
    currentAccount.worlds.forEach((world) => {
        const item = document.createElement('div'); item.className = 'world-item';
        item.innerHTML = `<div class="world-info"><span class="world-name-display">${world.name}</span><span class="world-seed-display">Seed: ${world.seed || 'Random'}</span></div>
            <div class="world-actions"><button class="icon-btn play" data-id="${world.id}" title="Play">&#9654;</button><button class="icon-btn export" data-id="${world.id}" title="Export">&#128229;</button><button class="icon-btn delete" data-id="${world.id}" title="Delete">&#10006;</button></div>`;
        list.appendChild(item);
    });
    list.querySelectorAll('.icon-btn.play').forEach(btn => { btn.addEventListener('click', async (e) => { const wId = e.currentTarget.getAttribute('data-id'); activeWorldId = wId; startGameWithSeed(currentAccount.worlds.find(w => w.id === wId).seed); }); });
    list.querySelectorAll('.icon-btn.export').forEach(btn => { btn.addEventListener('click', async (e) => { 
        const wId = e.currentTarget.getAttribute('data-id'); 
        let savedWorldData = null;
        if (currentAccount.id === 'anonymous') {
            const localWorld = await dbMondi.getItem(wId);
            if (localWorld && localWorld.saveData) savedWorldData = localWorld.saveData;
        } else if (supabaseClient) {
            const { data, error } = await supabaseClient.from('worlds').select('save_data').eq('id', wId).single();
            if (data && data.save_data) {
                try { savedWorldData = JSON.parse(data.save_data); } catch(err){}
            }
        }
        if (!savedWorldData) return alert("Impossibile scaricare il mondo (dati mancanti)");
        const worldMeta = currentAccount.worlds.find(w => w.id === wId);
        
        const exportObj = { meta: worldMeta, data: savedWorldData };
        const blob = new Blob([JSON.stringify(exportObj)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${worldMeta.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }); });
    list.querySelectorAll('.icon-btn.delete').forEach(btn => { btn.addEventListener('click', async (e) => { 
        const wId = e.target.getAttribute('data-id'); 
        currentAccount.worlds = currentAccount.worlds.filter(w => w.id !== wId); 
        if (currentAccount.id === 'anonymous') {
            await dbMondi.removeItem(wId);
            await dbUtenti.setItem('anonymous_profile', currentAccount);
        } else if (supabaseClient) {
            await supabaseClient.from('worlds').delete().eq('id', wId);
        }
        renderSavedWorlds(); 
    }); });
}

function findSafeSpawn(startX, startY) {
    let radius = 0;
    while (radius < 20) {
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (Math.abs(dx) === radius || Math.abs(dy) === radius) {
                    const tx = startX + dx, ty = startY + dy, type = getTileRawType(tx, ty);
                    let hasTree = false;
                    if (type === 'grass') if (decorationNoise.noise2D(tx * 0.2, ty * 0.2) > 0.6) hasTree = true;
                    if (type !== 'water' && !isStone(type) && !hasTree) return { x: tx * SCALED_TILE + SCALED_TILE / 2, y: ty * SCALED_TILE + SCALED_TILE / 2 };
                }
            }
        }
        radius++;
    }
    return { x: startX * SCALED_TILE, y: startY * SCALED_TILE };
}

function updateStatsUI() {
    if (!isGameStarted) return;
    document.getElementById('stat-level').textContent = player.level;
    document.getElementById('stat-score').textContent = player.score;
    document.getElementById('stat-hp').textContent = Math.floor(player.hp) + '/' + player.maxHp;
    document.getElementById('stat-energy').textContent = Math.floor(player.energy) + '%';
    document.getElementById('stat-hunger').textContent = Math.floor(player.hunger) + '%';
    document.getElementById('stat-thirst').textContent = Math.floor(player.thirst) + '%';
}

function addScore(points) {
    player.score += points;
    let requiredScore = player.level * 100;
    while (player.score >= requiredScore) {
        player.score -= requiredScore;
        player.level++;
        player.maxHp += 1;
        player.hp += 1;
        requiredScore = player.level * 100;
    }
    updateStatsUI();
}

async function startGameWithSeed(seed) {
    setWorldSeed(seed); worldModifications.clear(); resetPlayerToDefaults();
    
    let savedWorldData = null;
    if (currentAccount && currentAccount.id === 'anonymous') {
        const localWorld = await dbMondi.getItem(activeWorldId);
        if (localWorld && localWorld.saveData) savedWorldData = localWorld.saveData;
    } else if (supabaseClient) {
        const { data, error } = await supabaseClient.from('worlds').select('save_data').eq('id', activeWorldId).single();
        if (data && data.save_data) {
            try { savedWorldData = JSON.parse(data.save_data); } catch(e){}
        }
    }
    
    if (savedWorldData) {
        const data = savedWorldData; player.x = data.playerX ?? 0; player.y = data.playerY ?? 0; gameTime = data.gameTime ?? 0.2;
        player.level = data.level ?? 1; player.score = data.score ?? 0; player.hp = data.hp ?? 10; player.maxHp = data.maxHp ?? 10;
        player.energy = data.energy ?? 100; player.hunger = data.hunger ?? 100; player.thirst = data.thirst ?? 100;
        if (data.inventory) player.inventory = data.inventory.map(item => item ? { type: item.type, count: item.count === 'INFINITY' ? Infinity : item.count } : null);
        if (data.hands) player.hands = data.hands.map(item => item ? { type: item.type, count: item.count === 'INFINITY' ? Infinity : item.count } : null);
        if (data.modifications) data.modifications.forEach(([key, val]) => worldModifications.set(key, val));
        droppedItems = data.droppedItems ? data.droppedItems.map(di => ({ ...di })) : [];
        entities = data.entities ? data.entities.map(e => ({ ...e })) : [];
    } else { const spawn = findSafeSpawn(0, 0); player.x = spawn.x; player.y = spawn.y; gameTime = 0.2; }

    const startScreen = document.getElementById('start-screen');
    startScreen.style.opacity = '0';
    setTimeout(() => {
        startScreen.style.display = 'none';
        document.getElementById('inventory-sidebar').style.display = 'flex';
        isGameStarted = true;
        initInventoryUI();
        initMobileControls(); // Setup controlli touch
    }, 500);
}

function setupGUI() {
    if (gui.img.naturalWidth === 0) return;
    const size = gui.img.height || 16;
    const extract = (idx) => {
        const c = document.createElement('canvas'); c.width = size; c.height = size;
        const gCtx = c.getContext('2d'); gCtx.imageSmoothingEnabled = false;
        gCtx.drawImage(gui.img, idx * size, 0, size, size, 0, 0, size, size);
        return c.toDataURL();
    };
    for (let i = 0; i < 12; i++) gui.slots[i] = extract(i);
    gui.loaded = true;
}

function initInventoryUI() {
    if (!gui.loaded || !textures.stone.complete || textures.stone.naturalWidth === 0) return;
    const equipSlots = document.querySelectorAll('.equipment-panel .slot');
    equipSlots.forEach((slot, i) => {
        const defaultIcons = [6, 0, 9, 4, 1, 5, 7, 2, 8, 7, 3, 8];
        slot.style.backgroundImage = `url(${gui.slots[defaultIcons[i]]})`;
        const hIdx = slot.id === 'hand-0' ? 0 : (slot.id === 'hand-1' ? 1 : -1);
        if (hIdx !== -1) { slot.onclick = () => { player.selectedHand = hIdx; updateInventoryUI(); }; }
    });
    updateInventoryUI();
}

function updateInventoryUI() {
    if (!gui.loaded) return;
    const slotBg = gui.slots[10];

    document.querySelectorAll('.hand-slot').forEach((s, i) => {
        const item = player.hands[i];
        if (i === player.selectedHand) s.classList.add('active'); else s.classList.remove('active');
        s.onclick = (e) => {
            e.stopPropagation();
            if (draggedItem) { const temp = player.hands[i]; player.hands[i] = draggedItem; if (draggedItemSource.type === 'inv') player.inventory[draggedItemSource.index] = temp; else player.hands[draggedItemSource.index] = temp; draggedItem = null; draggedItemSource = null; updateInventoryUI(); }
            else if (item) { draggedItem = item; draggedItemSource = { type: 'hand', index: i }; updateInventoryUI(); } else { player.selectedHand = i; updateInventoryUI(); }
        };
        s.style.filter = (draggedItem && draggedItemSource.type === 'hand' && draggedItemSource.index === i) ? 'brightness(0.5)' : 'none';

        let itemIcon = s.querySelector('.item-icon');
        if (!itemIcon) { itemIcon = document.createElement('img'); itemIcon.className = 'item-icon'; itemIcon.style.width = '70%'; itemIcon.style.pointerEvents = 'none'; s.appendChild(itemIcon); }
        if (item) { itemIcon.src = getItemIcon(item.type); itemIcon.style.display = 'block'; } else itemIcon.style.display = 'none';

        let countTag = s.querySelector('.count-tag');
        if (!countTag) { countTag = document.createElement('span'); countTag.className = 'count-tag'; countTag.style.position = 'absolute'; countTag.style.bottom = '4px'; countTag.style.right = '6px'; countTag.style.fontSize = '10px'; countTag.style.color = '#fff'; countTag.style.textShadow = '1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000'; countTag.style.pointerEvents = 'none'; s.appendChild(countTag); }
        if (item && item.count !== undefined) countTag.textContent = item.count === Infinity ? '∞' : (item.count > 1 ? item.count : ''); else countTag.textContent = '';
    });

    const grid = document.getElementById('inventory-grid'); grid.innerHTML = '';
    for (let i = 0; i < 10; i++) {
        const s = document.createElement('div'); s.className = 'slot inv-slot'; s.style.backgroundImage = `url(${slotBg})`;
        const item = player.inventory[i];
        s.onclick = (e) => {
            e.stopPropagation();
            if (draggedItem) { const temp = player.inventory[i]; player.inventory[i] = draggedItem; if (draggedItemSource.type === 'inv') player.inventory[draggedItemSource.index] = temp; else player.hands[draggedItemSource.index] = temp; draggedItem = null; draggedItemSource = null; updateInventoryUI(); }
            else if (item) { draggedItem = item; draggedItemSource = { type: 'inv', index: i }; updateInventoryUI(); }
        };
        if (draggedItem && draggedItemSource.type === 'inv' && draggedItemSource.index === i) s.style.filter = 'brightness(0.5)';
        if (item) { const img = document.createElement('img'); img.src = getItemIcon(item.type); img.style.width = '70%'; img.style.pointerEvents = 'none'; s.appendChild(img); }
        grid.appendChild(s);
    }
}

window.addEventListener('keydown', async (e) => {
    if (!isGameStarted) return;
    if (e.key === '1') { player.selectedHand = 0; updateInventoryUI(); }
    if (e.key === '3') { player.selectedHand = 1; updateInventoryUI(); }
    if (e.key === 'Escape') {
        await saveAccountData(); isGameStarted = false;
        document.getElementById('inventory-sidebar').style.display = 'none';
        let startScreen = document.getElementById('start-screen');
        startScreen.style.display = 'flex'; startScreen.style.opacity = '1';
        await renderSavedWorlds();
    }
});

// --- AUTENTICAZIONE E SALVATAGGIO CLOUD (Supabase) ---

document.getElementById('show-register').addEventListener('click', showRegisterView);
document.getElementById('show-login').addEventListener('click', showLoginView);

document.getElementById('anon-login-btn').addEventListener('click', async () => {
    let localAnon = await dbUtenti.getItem('anonymous_profile');
    if (localAnon) {
        currentAccount = localAnon;
    } else {
        currentAccount = {
            id: 'anonymous',
            email: 'anon@local',
            displayName: 'Anonimo',
            worlds: []
        };
        await dbUtenti.setItem('anonymous_profile', currentAccount);
    }
    localStorage.setItem('blochnyy_last_active_user', 'anonymous_profile');
    showProfileView();
});

document.getElementById('register-btn').addEventListener('click', async () => {
    if (!supabaseClient) return alert("Inserisci prima URL e Key di Supabase in game.js!");
    const username = document.getElementById('register-username').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const pass = document.getElementById('register-password').value;
    const confirm = document.getElementById('register-password-confirm').value;

    if (!username || !email || !pass || !confirm) return alert('Compila tutti i campi!');
    if (pass !== confirm) return alert('Le password non coincidono!');

    const { data, error } = await supabaseClient.auth.signUp({
        email, password: pass, options: { data: { username } }
    });
    
    if (error) return alert("Errore di registrazione: " + error.message);
    alert("Registrazione completata! (Controlla la tua email o accedi direttamente).");
    showLoginView();
    document.querySelectorAll('#register-view input').forEach(i => i.value = '');
});

document.getElementById('login-btn').addEventListener('click', async () => {
    if (!supabaseClient) return alert("Inserisci prima URL e Key di Supabase in game.js!");
    const email = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-password').value;

    if (!email || !pass) return alert('Inserisci email e password!');
    
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
    if (error) return alert('Credenziali non valide: ' + error.message);
    
    currentAccount = {
        id: data.user.id,
        email: data.user.email,
        displayName: data.user.user_metadata.username || data.user.email,
        worlds: []
    };
    await loadCloudWorlds();
    showProfileView(); 
    document.querySelectorAll('#login-view input').forEach(i => i.value = '');
});

document.getElementById('logout-btn').addEventListener('click', async () => { 
    if (supabaseClient) await supabaseClient.auth.signOut();
    currentAccount = null; 
    showLoginView(); 
});

document.getElementById('play-btn').addEventListener('click', async () => {
    const nameInput = document.getElementById('world-name'), seedInput = document.getElementById('world-seed');
    const name = nameInput.value.trim() || `World ${currentAccount.worlds.length + 1}`;
    let seed = seedInput.value.trim(); if (!seed) seed = Math.floor(Math.random() * 1000000).toString();
    const worldId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(); 
    activeWorldId = worldId;
    currentAccount.worlds.push({ id: worldId, name, seed });
    await saveAccountData(); 
    startGameWithSeed(seed);
    nameInput.value = ''; seedInput.value = '';
});

// Import logic
document.getElementById('import-world-btn').addEventListener('click', () => {
    document.getElementById('import-world-input').click();
});

document.getElementById('import-world-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
        try {
            const imported = JSON.parse(ev.target.result);
            if (!imported.meta || !imported.data) throw new Error("Formato non valido");
            
            const newId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString();
            imported.meta.id = newId;
            imported.meta.name += " (Importato)";
            
            currentAccount.worlds.push({ id: newId, name: imported.meta.name, seed: imported.meta.seed });
            
            if (currentAccount.id === 'anonymous') {
                await dbMondi.setItem(newId, { saveData: imported.data });
                await dbUtenti.setItem('anonymous_profile', currentAccount);
            } else if (supabaseClient) {
                await supabaseClient.from('worlds').upsert({
                    id: newId, user_id: currentAccount.id, name: imported.meta.name, seed: imported.meta.seed, save_data: JSON.stringify(imported.data)
                });
            }
            renderSavedWorlds();
            alert("Mondo importato con successo!");
        } catch(err) {
            alert("Errore durante l'importazione: file non compatibile.");
        }
        e.target.value = '';
    };
    reader.readAsText(file);
});

// ==========================================
// FUNZIONE UNIFICATA INTERAZIONE (PC E MOBILE)
// ==========================================
let lastHitTime = 0;
function handleInteraction(screenX, screenY, isPlaceAction) {
    if (!isGameStarted) return;
    const selectedItem = player.hands[player.selectedHand];
    
    if (isPlaceAction && selectedItem && (selectedItem.type === 'bread' || selectedItem.type === 'purified_water')) {
        if (player.energy < 2) return; // Non abbastanza energia per mangiare/bere
        let now = performance.now() / 1000;
        if (now - lastHitTime < 0.5) return;
        lastHitTime = now;
        
        if (selectedItem.type === 'bread') player.hunger = Math.min(100, player.hunger + 30);
        if (selectedItem.type === 'purified_water') player.thirst = Math.min(100, player.thirst + 30);
        
        if (selectedItem.count !== Infinity) selectedItem.count--;
        if (selectedItem.count <= 0) player.hands[player.selectedHand] = null;
        player.energy -= 2; // Costo per mangiare/bere
        updateInventoryUI();
        updateStatsUI();
        return;
    }

    if (!isPlaceAction) {
        let now = performance.now() / 1000;
        if (now - lastHitTime < 0.5) return;
        lastHitTime = now;
    }
    const camX = player.x - width / 2; const camY = player.y - height / 2;
    const worldX = screenX + camX; const worldY = screenY + camY;
    const tx = Math.floor(worldX / SCALED_TILE); const ty = Math.floor(worldY / SCALED_TILE);
    const key = `${tx},${ty}`;
    const pTx = Math.floor(player.x / SCALED_TILE); const pTy = Math.floor(player.y / SCALED_TILE);
    const dist = Math.hypot(tx - pTx, ty - pTy);
    if (isPlaceAction && dist > MAX_REACH) return;
    if (!isPlaceAction && dist > 1.5) return;

    const currentTile = getTile(tx, ty);

    if (isPlaceAction) { 
        // Logica Costruzione (Tasto Destro o Modalità Build su Mobile)
        if (selectedItem && selectedItem.count > 0) {
            const unplaceableItems = ['mazzascia', 'bread', 'purified_water'];
            if (unplaceableItems.includes(selectedItem.type)) return;
            if (selectedItem.type !== 'stone' && currentTile.type === 'water') return;
            if (selectedItem.type === 'stone') {
                const px = tx * SCALED_TILE, py = ty * SCALED_TILE, pLeft = player.x - SCALED_TILE * 0.25, pRight = player.x + SCALED_TILE * 0.25, pTop = player.y - SCALED_TILE * 0.2, pBottom = player.y + SCALED_TILE * 0.1;
                if (pRight > px && pLeft < px + SCALED_TILE && pBottom > py && pTop < py + SCALED_TILE) return;
            }
            if (!isStone(currentTile.type) && currentTile.decoration !== 'tree') {
                if (player.energy < 1) return; // Non abbastanza energia per piazzare
                player.energy -= 1; // Costo per piazzare
                worldModifications.set(key, { type: selectedItem.type === 'stone' ? 'stone' : currentTile.type, decoration: selectedItem.type !== 'stone' ? selectedItem.type : null });
                if (selectedItem.count !== Infinity) selectedItem.count--;
                [key, `${tx},${ty - 1}`, `${tx + 1},${ty}`, `${tx},${ty + 1}`, `${tx - 1},${ty}`].forEach(k => mapCache.delete(k));
                updateInventoryUI();
                addScore(1); // Placing block gives score
            }
        }
    } else { 
        // Combat Entità
        for (let i = 0; i < entities.length; i++) {
            let e = entities[i];
            let dx = worldX - e.x;
            let dy = worldY - e.y;
            if (Math.abs(dx) < SCALED_TILE/1.5 && Math.abs(dy) < SCALED_TILE/1.5) {
                if (player.energy < 1) return;
                player.energy -= 1;
                
                let damage = 2;
                if (selectedItem && selectedItem.type === 'mazzascia') damage = 5;
                e.hp -= damage;
                
                // Entità scappa via
                e.state = 'flee';
                e.stateTime = 2 + Math.random() * 1.5;
                let angleAway = Math.atan2(e.y - player.y, e.x - player.x);
                let fleeSpeed = 100 + Math.random() * 40; // più veloce della camminata
                e.vx = Math.cos(angleAway) * fleeSpeed;
                e.vy = Math.sin(angleAway) * fleeSpeed;
                
                damageNumbers.push({
                    text: damage.toString(),
                    x: e.x, y: e.y - SCALED_TILE/2,
                    vx: (Math.random() - 0.5) * 60, vy: -Math.random() * 40 - 30, life: 0
                });
                
                if (e.hp <= 0) {
                    addScore(1); // Uccisione
                    entities.splice(i, 1);
                }
                return; // Colpito l'entità, fermati qui
            }
        }
        
        // Logica Scavo (Tasto Sinistro o Modalità Dig su Mobile)
        if (isStone(currentTile.type) || currentTile.decoration) {
            let hp = currentTile.hp;
            let isFlower = currentTile.decoration && ['daisy', 'poppy', 'violet'].includes(currentTile.decoration);
            if (hp === undefined) {
                if (isStone(currentTile.type)) hp = Math.floor(Math.random() * 41) + 80;
                else if (currentTile.decoration === 'tree') hp = Math.floor(Math.random() * 21) + 30;
                else hp = 1;
            }

            let damage = 0;
            if (selectedItem && selectedItem.type === 'mazzascia') damage = Math.floor(Math.random() * 6) + 5;
            else if (isFlower) damage = 1;
            
            if (damage > 0) {
                if (player.energy < 1) return; // Non abbastanza energia per colpire
                player.energy -= 1; // Costo per colpire
                hp -= damage;
                damageNumbers.push({
                    text: damage.toString(),
                    x: tx * SCALED_TILE + SCALED_TILE / 2,
                    y: ty * SCALED_TILE + SCALED_TILE / 2,
                    vx: (Math.random() - 0.5) * 60,
                    vy: -Math.random() * 40 - 30,
                    life: 0
                });
                if (hp <= 0) {
                    addScore(1); // Breaking block gives score
                    let rawType = getTileRawType(tx, ty), newType;
                    if (currentTile.type === 'deep_stone_2') newType = 'deep_stone';
                    else if (currentTile.type === 'deep_stone') newType = 'stone';
                    else if (currentTile.type === 'stone') newType = 'dirt';
                    else newType = isStone(rawType) ? 'dirt' : rawType;
                    
                    if (isStone(currentTile.type)) droppedItems.push({ type: 'raw_stone', x: tx * SCALED_TILE + SCALED_TILE/2, y: ty * SCALED_TILE + SCALED_TILE/2, z: 20, vz: 100 + Math.random()*50, vx: (Math.random()-0.5)*150, vy: (Math.random()-0.5)*150, age: 0 });
                    else if (currentTile.decoration === 'tree') droppedItems.push({ type: 'wood', x: tx * SCALED_TILE + SCALED_TILE/2, y: ty * SCALED_TILE + SCALED_TILE/2, z: 20, vz: 100 + Math.random()*50, vx: (Math.random()-0.5)*150, vy: (Math.random()-0.5)*150, age: 0 });
                    
                    worldModifications.set(key, { type: newType, decoration: null });
                } else {
                    worldModifications.set(key, Object.assign({}, currentTile, { hp: hp }));
                }
                [key, `${tx},${ty - 1}`, `${tx + 1},${ty}`, `${tx},${ty + 1}`, `${tx - 1},${ty}`].forEach(k => mapCache.delete(k));
            }
        }
    }
}

// Eventi Mouse (PC)
canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    handleInteraction(e.clientX - rect.left, e.clientY - rect.top, e.button === 2);
});

canvas.addEventListener('contextmenu', e => e.preventDefault());
document.getElementById('world-seed').addEventListener('input', (e) => { setWorldSeed(e.target.value.trim()); });
loadAccount();

function update(dt) {
    if (!isGameStarted) return;
    gameTime = (gameTime + dt / (18 * 60)) % 1;
    const dayEnd = 12 / 18;

    if (gameTime < dayEnd) {
        let progress = gameTime / dayEnd; shadowSkew = (0.5 - progress) * 3; shadowLength = 0.4; shadowAlpha = (1 - Math.abs(progress - 0.5) * 2) * 0.4 + 0.05;
    } else {
        let progress = (gameTime - dayEnd) / (1 - dayEnd); shadowSkew = (0.5 - progress) * 3; shadowLength = 0.4; shadowAlpha = (1 - Math.abs(progress - 0.5) * 2) * 0.1;
    }

    const colors = [
        { t: 0.0, r: 255, g: 150, b: 50, a: 0.3 }, { t: dayEnd * 0.3, r: 0, g: 0, b: 0, a: 0.0 }, { t: dayEnd * 0.7, r: 0, g: 0, b: 0, a: 0.0 },
        { t: dayEnd, r: 255, g: 100, b: 50, a: 0.4 }, { t: dayEnd + (1 - dayEnd) * 0.2, r: 5, g: 5, b: 30, a: 0.75 },
        { t: dayEnd + (1 - dayEnd) * 0.5, r: 0, g: 0, b: 15, a: 0.88 }, { t: dayEnd + (1 - dayEnd) * 0.8, r: 5, g: 5, b: 30, a: 0.75 }, { t: 1.0, r: 255, g: 150, b: 50, a: 0.3 }
    ];

    let c1 = colors[0], c2 = colors[1];
    for (let i = 0; i < colors.length - 1; i++) { if (gameTime >= colors[i].t && gameTime <= colors[i + 1].t) { c1 = colors[i]; c2 = colors[i + 1]; break; } }
    let factor = (c2.t - c1.t) > 0 ? (gameTime - c1.t) / (c2.t - c1.t) : 0;
    ambientColor = `rgba(${Math.floor(c1.r + (c2.r - c1.r) * factor)},${Math.floor(c1.g + (c2.g - c1.g) * factor)},${Math.floor(c1.b + (c2.b - c1.b) * factor)},${c1.a + (c2.a - c1.a) * factor})`;

    let mx = 0, my = 0;
    if (keys.w || keys.ArrowUp) my -= 1; if (keys.s || keys.ArrowDown) my += 1;
    if (keys.a || keys.ArrowLeft) mx -= 1; if (keys.d || keys.ArrowRight) mx += 1;

    if (joyActive) { mx = joyVector.x; my = joyVector.y; }

    const dist = Math.hypot(mx, my);
    const isMoving = dist > 0 || joyActive;
    const currentTileType = getTile(Math.floor(player.x / SCALED_TILE), Math.floor(player.y / SCALED_TILE)).type;

    // Survival mechanics: l'efficienza aumenta con il livello
    let efficiency = 1 + (player.level - 1) * 0.05;
    let baseRate = 0.046 / efficiency;
    
    player.hunger -= baseRate * dt; // Più sei di livello alto, più dura
    player.thirst -= baseRate * dt;
    if (player.hunger < 0) player.hunger = 0;
    if (player.thirst < 0) player.thirst = 0;

    player.energy -= baseRate * dt; // Costo base (tempo da svegli)
    if (isMoving && currentTileType === 'water') {
        player.energy -= (player.speed / efficiency) * dt; // Nuoto costa di meno
    }
    if (player.energy < 0) player.energy = 0;
    if (player.energy > 100) player.energy = 100;

    // HP logic
    if (player.hunger === 0 || player.thirst === 0) {
        player.hp -= 0.5 * dt;
        if (player.hp < 0) player.hp = 0; // Doesn't die yet
    } else if (player.hunger > 80 && player.thirst > 80) {
        player.hp += 0.5 * dt;
        if (player.hp > player.maxHp) player.hp = player.maxHp;
    }
    updateStatsUI();
    if (dist > 0 && !joyActive) { mx /= dist; my /= dist; }

    const moveSpeed = player.speed * SCALED_TILE * dt;
    if (!checkCollision(player.x + mx * moveSpeed, player.y, 'player')) player.x += mx * moveSpeed;
    if (!checkCollision(player.x, player.y + my * moveSpeed, 'player')) player.y += my * moveSpeed;

    if (dist > 0.1 || joyActive) {
        player.animTime += dt * 8;
        const cycle = Math.floor(player.animTime) % 4; player.frame = cycle % 2;
        if (Math.abs(mx) > Math.abs(my)) { player.dir = 2; player.flipX = mx < 0; }
        else if (my > 0) { player.dir = 0; player.flipX = (cycle >= 2); }
        else { player.dir = 1; player.flipX = (cycle >= 2); }
    }

    for (let i = damageNumbers.length - 1; i >= 0; i--) {
        let dn = damageNumbers[i];
        dn.x += dn.vx * dt;
        dn.y += dn.vy * dt;
        dn.vy += 150 * dt; // Gravity
        dn.life += dt;
        if (dn.life > 1) {
            damageNumbers.splice(i, 1);
        }
    }

    // Entity AI loop
    if (Math.random() < 0.2 * dt && entities.length < 30) {
        let spawnAngle = Math.random() * Math.PI * 2;
        let spawnDist = 400 + Math.random() * 400; // spawn outside immediate view
        let spawnX = player.x + Math.cos(spawnAngle) * spawnDist;
        let spawnY = player.y + Math.sin(spawnAngle) * spawnDist;
        if (!checkCollision(spawnX, spawnY)) {
            let types = ['cow', 'pig', 'sheep'];
            let type = types[Math.floor(Math.random() * types.length)];
            entities.push({
                id: Math.random().toString(), type: type,
                x: spawnX, y: spawnY, hp: 20,
                vx: 0, vy: 0,
                dir: 0, frame: 0, flipX: false, animTime: 0,
                stateTime: 0, state: 'idle'
            });
        }
    }

    for (let i = entities.length - 1; i >= 0; i--) {
        let e = entities[i];
        
        // Despawn if too far
        if (Math.hypot(e.x - player.x, e.y - player.y) > 2000) {
            entities.splice(i, 1);
            continue;
        }

        e.stateTime -= dt;
        if (e.stateTime <= 0) {
            if (e.state === 'idle') {
                e.state = 'walk';
                e.stateTime = 1 + Math.random() * 3;
                let angle = Math.random() * Math.PI * 2;
                let speed = 20 + Math.random() * 20;
                e.vx = Math.cos(angle) * speed;
                e.vy = Math.sin(angle) * speed;
            } else {
                e.state = 'idle';
                e.stateTime = 2 + Math.random() * 4;
                e.vx = 0; e.vy = 0;
            }
        }
        
        if (e.state === 'walk' || e.state === 'flee') {
            if (!checkCollision(e.x + e.vx * dt, e.y, e.id)) {
                e.x += e.vx * dt;
            } else { e.vx *= -1; e.stateTime *= 0.5; }
            
            if (!checkCollision(e.x, e.y + e.vy * dt, e.id)) {
                e.y += e.vy * dt;
            } else { e.vy *= -1; e.stateTime *= 0.5; }
            
            e.animTime += dt * 8;
            const cycle = Math.floor(e.animTime) % 4; e.frame = cycle % 2;
            if (Math.abs(e.vx) > Math.abs(e.vy)) { e.dir = 2; e.flipX = e.vx < 0; }
            else if (e.vy > 0) { e.dir = 0; e.flipX = (cycle >= 2); }
            else { e.dir = 1; e.flipX = (cycle >= 2); }
        } else {
            e.frame = 0;
        }
    }

    for (let i = droppedItems.length - 1; i >= 0; i--) {
        let item = droppedItems[i];
        item.age += dt;
        if (item.z !== undefined) {
            item.x += item.vx * dt;
            item.y += item.vy * dt;
            item.z += item.vz * dt;
            item.vz -= 400 * dt; // gravity
            if (item.z < 0) {
                item.z = 0;
                item.vz = -item.vz * 0.4; // bounce dampening
                item.vx *= 0.6; // friction
                item.vy *= 0.6;
                if (Math.abs(item.vz) < 15) item.vz = 0;
            }
        }
        if (item.age >= 130) {
            droppedItems.splice(i, 1);
            continue;
        }
        let dx = item.x - player.x;
        let dy = item.y - player.y;
        if (Math.hypot(dx, dy) < SCALED_TILE * 0.5) {
            if (giveItem(item.type, 1)) {
                droppedItems.splice(i, 1);
                updateInventoryUI();
            }
        }
    }
}

function draw() {
    checkAndGenerateOverlays();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, width, height);

    const camX = player.x - width / 2; const camY = player.y - height / 2;
    const startCol = Math.floor(camX / SCALED_TILE) - 1, endCol = Math.floor((camX + width) / SCALED_TILE) + 1;
    const startRow = Math.floor(camY / SCALED_TILE) - 1, endRow = Math.floor((camY + height) / SCALED_TILE) + 1;

    ctx.save(); ctx.translate(Math.floor(-camX), Math.floor(-camY));

    for (let y = startRow; y <= endRow; y++) {
        for (let x = startCol; x <= endCol; x++) {
            const tile = getTile(x, y), px = x * SCALED_TILE, py = y * SCALED_TILE;
            const drawBleed = (baseLightness, baseX, baseY, drawX, drawY) => {
                const checkDir = (nx, ny, dir) => { const nType = getEffectiveType(nx, ny); if (LIGHTNESS[nType] && LIGHTNESS[nType] > baseLightness && ditherOverlays[nType] && ditherOverlays[nType][dir]) ctx.drawImage(ditherOverlays[nType][dir], drawX, drawY, SCALED_TILE, SCALED_TILE); };
                checkDir(baseX, baseY - 1, 'top'); checkDir(baseX + 1, baseY, 'right'); checkDir(baseX, baseY + 1, 'bottom'); checkDir(baseX - 1, baseY, 'left');
            };

            if (isStone(tile.type)) {
                let isDeep = tile.type === 'deep_stone' || tile.type === 'deep_stone_2', terrainType = getTileRawType(x, y);
                let floorType = isDeep ? 'stone' : ((isStone(terrainType) || terrainType === 'water') ? 'grass' : terrainType);
                let floorImg = textures[floorType];
                if (floorImg && floorImg.complete && floorImg.naturalWidth > 0) {
                    ctx.drawImage(floorImg, 4 * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE, px, py, SCALED_TILE, SCALED_TILE);
                    if (!isDeep) drawBleed(LIGHTNESS[floorType] || 1, x, y, px, py);
                }
            } else {
                let img = textures[tile.type];
                if (img && img.complete && img.naturalWidth > 0) {
                    if (tile.type === 'grass' || tile.type === 'sand' || tile.type === 'dirt') {
                        ctx.save(); ctx.translate(px + SCALED_TILE / 2, py + SCALED_TILE / 2); ctx.rotate(tile.rot * Math.PI / 180);
                        if (tile.isStraight) { ctx.drawImage(img, 3 * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE / 2, -SCALED_TILE / 2, -SCALED_TILE / 2, SCALED_TILE, SCALED_TILE / 2); ctx.scale(1, -1); ctx.drawImage(img, 3 * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE / 2, -SCALED_TILE / 2, -SCALED_TILE / 2, SCALED_TILE, SCALED_TILE / 2); }
                        else ctx.drawImage(img, tile.variant * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE, -SCALED_TILE / 2, -SCALED_TILE / 2, SCALED_TILE, SCALED_TILE);
                        ctx.restore();
                        drawBleed(LIGHTNESS[tile.type] || 1, x, y, px, py);
                    } else ctx.drawImage(img, px, py, SCALED_TILE, SCALED_TILE);
                }
            }

            if (tile.decoration && tile.decoration !== 'tree') { let decImg = textures[tile.decoration]; if (decImg && decImg.complete && decImg.naturalWidth > 0) ctx.drawImage(decImg, px, py, SCALED_TILE, SCALED_TILE); }
        }
    }

    let drawables = [];
    for (let e of entities) {
        let eImg = textures[e.type];
        if (eImg && eImg.complete && eImg.naturalWidth > 0) {
            drawables.push({
                y: e.y + SCALED_TILE * 0.1,
                draw: () => {
                    const eFeetX = Math.floor(e.x / SCALED_TILE), eFeetY = Math.floor((e.y + SCALED_TILE * 0.2) / SCALED_TILE), eInWater = getEffectiveType(eFeetX, eFeetY) === 'water';
                    ctx.save(); ctx.translate(Math.floor(e.x), Math.floor(e.y)); if (e.flipX) ctx.scale(-1, 1);
                    ctx.drawImage(eImg, (e.dir * 2 + e.frame) * TILE_SIZE, 0, TILE_SIZE, eInWater ? 10 : TILE_SIZE, -SCALED_TILE / 2, -SCALED_TILE / 2, SCALED_TILE, eInWater ? (10 / 16) * SCALED_TILE : SCALED_TILE);
                    ctx.restore();
                }
            });
        }
    }

    if (textures.player && textures.player.complete && textures.player.naturalWidth > 0) {
        drawables.push({
            y: player.y + SCALED_TILE * 0.1,
            draw: () => {
                const feetX = Math.floor(player.x / SCALED_TILE), feetY = Math.floor((player.y + SCALED_TILE * 0.2) / SCALED_TILE), inWater = getEffectiveType(feetX, feetY) === 'water';
                ctx.save(); ctx.translate(player.x, player.y); if (player.flipX) ctx.scale(-1, 1);
                ctx.drawImage(textures.player, (player.dir * 2 + player.frame) * TILE_SIZE, 0, TILE_SIZE, inWater ? 10 : TILE_SIZE, -SCALED_TILE / 2, -SCALED_TILE / 2, SCALED_TILE, inWater ? (10 / 16) * SCALED_TILE : SCALED_TILE);
                ctx.restore();
            }
        });
    }

    for (let y = startRow; y <= endRow; y++) {
        for (let x = startCol; x <= endCol; x++) {
            const tile = getTile(x, y), px = x * SCALED_TILE, py = y * SCALED_TILE;
            if (isStone(tile.type) && textures['stone'] && textures['stone'].complete && textures['stone'].naturalWidth > 0) {
                drawables.push({
                    y: py + SCALED_TILE * 0.5,
                    draw: () => {
                        ctx.save(); ctx.translate(px + SCALED_TILE / 2, py + SCALED_TILE / 2); ctx.rotate(tile.rot * Math.PI / 180);
                        if (tile.isStraight) { ctx.drawImage(textures['stone'], 3 * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE / 2, -SCALED_TILE / 2, -SCALED_TILE / 2, SCALED_TILE, SCALED_TILE / 2); ctx.scale(1, -1); ctx.drawImage(textures['stone'], 3 * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE / 2, -SCALED_TILE / 2, -SCALED_TILE / 2, SCALED_TILE, SCALED_TILE / 2); }
                        else ctx.drawImage(textures['stone'], tile.variant * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE, -SCALED_TILE / 2, -SCALED_TILE / 2, SCALED_TILE, SCALED_TILE);
                        ctx.restore();
                    }
                });
            }
            if (tile.decoration === 'tree' && textures[tile.decoration] && textures[tile.decoration].complete && textures[tile.decoration].naturalWidth > 0) { drawables.push({ y: py + SCALED_TILE * 0.9, draw: () => { ctx.drawImage(textures[tile.decoration], px, py, SCALED_TILE, SCALED_TILE); } }); }
        }
    }

    drawables.sort((a, b) => a.y - b.y);

    if (shadowAlpha > 0.01) {
        shadowCtx.clearRect(0, 0, width, height); shadowCtx.save(); shadowCtx.translate(Math.floor(-camX), Math.floor(-camY));
        const drawShadow = (px, py, pivotY, drawFn) => { shadowCtx.save(); shadowCtx.translate(px + SCALED_TILE / 2, pivotY); shadowCtx.transform(1, 0, shadowSkew, shadowLength, 0, 0); shadowCtx.translate(-(px + SCALED_TILE / 2), -pivotY); drawFn(shadowCtx); shadowCtx.restore(); };

        for (let y = startRow; y <= endRow; y++) {
            for (let x = startCol; x <= endCol; x++) {
                const tile = getTile(x, y), px = x * SCALED_TILE, py = y * SCALED_TILE;
                if (isStone(tile.type) && textures['stone'] && textures['stone'].complete && textures['stone'].naturalWidth > 0) {
                    let hMultiplier = tile.type === 'deep_stone' ? 2 : (tile.type === 'deep_stone_2' ? 3 : 1), totalSteps = 4 * hMultiplier;
                    for (let i = 1; i <= totalSteps; i++) {
                        shadowCtx.save(); shadowCtx.translate(px + SCALED_TILE / 2 - (SCALED_TILE * 0.5 * shadowSkew * i) / 4, py + SCALED_TILE * 0.4 - (SCALED_TILE * 0.5 * shadowLength * 2.5 * i) / 4); shadowCtx.rotate(tile.rot * Math.PI / 180);
                        if (tile.isStraight) { shadowCtx.drawImage(textures['stone'], 3 * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE / 2, -SCALED_TILE / 2, -SCALED_TILE / 2, SCALED_TILE, SCALED_TILE / 2); shadowCtx.scale(1, -1); shadowCtx.drawImage(textures['stone'], 3 * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE / 2, -SCALED_TILE / 2, -SCALED_TILE / 2, SCALED_TILE, SCALED_TILE / 2); }
                        else shadowCtx.drawImage(textures['stone'], tile.variant * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE, -SCALED_TILE / 2, -SCALED_TILE / 2, SCALED_TILE, SCALED_TILE);
                        shadowCtx.restore();
                    }
                }
                if (tile.decoration === 'tree' && textures[tile.decoration] && textures[tile.decoration].complete && textures[tile.decoration].naturalWidth > 0) drawShadow(px, py, py + SCALED_TILE * 0.9, (sCtx) => { sCtx.drawImage(textures[tile.decoration], px, py, SCALED_TILE, SCALED_TILE); });
            }
        }

        for (let e of entities) {
            let eImg = textures[e.type];
            if (eImg && eImg.complete && eImg.naturalWidth > 0) {
                const eFeetX = Math.floor(e.x / SCALED_TILE), eFeetY = Math.floor((e.y + SCALED_TILE * 0.2) / SCALED_TILE), eInWater = getEffectiveType(eFeetX, eFeetY) === 'water';
                drawShadow(e.x - SCALED_TILE / 2, e.y - SCALED_TILE / 2, eInWater ? e.y + SCALED_TILE * 0.125 : e.y + SCALED_TILE * 0.4, (sCtx) => {
                    sCtx.save(); sCtx.translate(e.x, e.y); if (e.flipX) sCtx.scale(-1, 1);
                    sCtx.drawImage(eImg, (e.dir * 2 + e.frame) * TILE_SIZE, 0, TILE_SIZE, eInWater ? 10 : TILE_SIZE, -SCALED_TILE / 2, -SCALED_TILE / 2, SCALED_TILE, eInWater ? (10 / 16) * SCALED_TILE : SCALED_TILE);
                    sCtx.restore();
                });
            }
        }

        if (textures.player && textures.player.complete && textures.player.naturalWidth > 0) {
            const feetX = Math.floor(player.x / SCALED_TILE), feetY = Math.floor((player.y + SCALED_TILE * 0.2) / SCALED_TILE), inWater = getEffectiveType(feetX, feetY) === 'water';
            drawShadow(player.x - SCALED_TILE / 2, player.y - SCALED_TILE / 2, inWater ? player.y + SCALED_TILE * 0.125 : player.y + SCALED_TILE * 0.4, (sCtx) => {
                sCtx.save(); sCtx.translate(player.x, player.y); if (player.flipX) sCtx.scale(-1, 1);
                sCtx.drawImage(textures.player, (player.dir * 2 + player.frame) * TILE_SIZE, 0, TILE_SIZE, inWater ? 10 : TILE_SIZE, -SCALED_TILE / 2, -SCALED_TILE / 2, SCALED_TILE, inWater ? (10 / 16) * SCALED_TILE : SCALED_TILE);
                sCtx.restore();
            });
        }
        shadowCtx.restore(); shadowCtx.save(); shadowCtx.globalCompositeOperation = 'source-in'; shadowCtx.fillStyle = '#000'; shadowCtx.fillRect(0, 0, width, height); shadowCtx.restore();
        ctx.save(); ctx.resetTransform(); ctx.globalAlpha = shadowAlpha; ctx.drawImage(shadowCanvas, 0, 0); ctx.restore();
    }

    for (let item of droppedItems) {
        if (item.age > 120 && Math.floor(item.age * 5) % 2 === 0) continue;
        let img = textures[item.type];
        if (img && img.complete && img.naturalWidth > 0) {
            drawables.push({
                y: item.y,
                draw: () => {
                    ctx.save(); ctx.translate(Math.floor(item.x), Math.floor(item.y - (item.z || 0) + Math.sin(gameTime * 20) * 5));
                    ctx.drawImage(img, -SCALED_TILE/4, -SCALED_TILE/4, SCALED_TILE/2, SCALED_TILE/2);
                    ctx.restore();
                }
            });
        }
    }
    
    for (let item of drawables) item.draw();

    // Draw damage numbers on top of everything
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let dn of damageNumbers) {
        let alpha = 1 - (dn.life / 1); // Fade out
        if (alpha < 0) alpha = 0;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 3;
        ctx.strokeStyle = "black";
        ctx.strokeText(dn.text, Math.floor(dn.x), Math.floor(dn.y));
        ctx.fillStyle = "white";
        ctx.fillText(dn.text, Math.floor(dn.x), Math.floor(dn.y));
    }
    ctx.globalAlpha = 1.0;

    if (isMouseOnScreen && !joyActive) { 
        const hoverTx = Math.floor((screenMouseX + camX) / SCALED_TILE), hoverTy = Math.floor((screenMouseY + camY) / SCALED_TILE), px = hoverTx * SCALED_TILE, py = hoverTy * SCALED_TILE;
        const dist = Math.hypot(hoverTx - Math.floor(player.x / SCALED_TILE), hoverTy - Math.floor(player.y / SCALED_TILE));
        const canBreak = dist <= 1.5;
        const canPlace = dist <= MAX_REACH;
        const isPlayerInTheWay = (player.x + SCALED_TILE * 0.25 > px && player.x - SCALED_TILE * 0.25 < px + SCALED_TILE && player.y + SCALED_TILE * 0.1 > py && player.y - SCALED_TILE * 0.2 < py + SCALED_TILE);
        
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)'; ctx.strokeRect(px, py, SCALED_TILE, SCALED_TILE);
        ctx.lineWidth = 2; 
        if (!canPlace || isPlayerInTheWay) {
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
        } else if (canBreak) {
            ctx.strokeStyle = 'rgba(0, 150, 255, 0.8)'; // Azzurro
        } else {
            ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)'; // Verde
        }
        ctx.strokeRect(px, py, SCALED_TILE, SCALED_TILE);
    }
    ctx.fillStyle = ambientColor; ctx.fillRect(Math.floor(camX), Math.floor(camY), width, height); ctx.restore();
}

function loop(time) {
    const dt = (time - lastTime) / 1000; lastTime = time;
    if (dt < 0.1) update(dt);
    draw();
    requestAnimationFrame(loop);
}
