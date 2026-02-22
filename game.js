// Infinite Dungeon Roguelike (Explore-Generated, Chunked, Multi-depth)
// v4.5
// - UI/Controls:
//   - "E" is now contextual: interacts with shrines OR uses stairs (up/down) when standing on them.
//   - Confirm prompts for starting a New Run via "R", and for clicking New Seed / Hard Reset buttons.
//     Prompts explain exactly what each action does.

const CHUNK = 32;
const TILE = 256;
const VIEW_RADIUS = 14;

const MINI_SCALE = 3;
const MINI_RADIUS = 40;

const WALL = "#";
const FLOOR = ".";
const DOOR_CLOSED = "+";  // blocks movement + LOS, bump opens (spend turn)
const DOOR_OPEN = "/";    // passable, does NOT block LOS
const LOCK_RED = "R";
const LOCK_BLUE = "B";
const LOCK_GREEN = "G";
const STAIRS_DOWN = ">";
const STAIRS_UP = "<";
const SURFACE_LEVEL = -1;
const SURFACE_HALF_SIZE = 22;

const SAVE_KEY = "infinite_dungeon_roguelike_save_v4";
const XP_SCALE = 100;
const COMBAT_SCALE = 100;
const XP_DAMAGE_PER_LEGACY_DAMAGE = 6;
const XP_KILL_BONUS_PER_MONSTER_XP = 12;
const STAIRS_DOWN_SPAWN_CHANCE = 0.48;
const STAIRS_UP_SPAWN_CHANCE = 0.40;
const EDGE_SHADE_PX = Math.max(2, Math.floor(TILE * 0.12));
const CORNER_CHAMFER_PX = Math.max(3, Math.floor(TILE * 0.22));
const EDGE_SOFT_PX = Math.max(2, Math.floor(TILE * 0.08));

// ---------- DOM ----------
const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
const metaEl = document.getElementById("meta");
const logEl = document.getElementById("log");
const contextActionBtn = document.getElementById("contextActionBtn");
const contextPotionBtn = document.getElementById("contextPotionBtn");
const contextAttackListEl = document.getElementById("contextAttackList");
const depthDisplayEl = document.getElementById("depthDisplay");
const invListEl = document.getElementById("invList");
const equipTextEl = document.getElementById("equipText");
const effectsTextEl = document.getElementById("effectsText");
const deathOverlayEl = document.getElementById("deathOverlay");
const btnRespawnEl = document.getElementById("btnRespawn");
const btnNewDungeonEl = document.getElementById("btnNewDungeon");
const shopOverlayEl = document.getElementById("shopOverlay");
const shopCloseBtnEl = document.getElementById("shopCloseBtn");
const shopTabBuyEl = document.getElementById("shopTabBuy");
const shopTabSellEl = document.getElementById("shopTabSell");
const shopGoldEl = document.getElementById("shopGold");
const shopRefreshEl = document.getElementById("shopRefresh");
const shopListEl = document.getElementById("shopList");
const shopDetailTitleEl = document.getElementById("shopDetailTitle");
const shopDetailBodyEl = document.getElementById("shopDetailBody");
const shopActionBtnEl = document.getElementById("shopActionBtn");
const mainCanvasWrapEl = document.getElementById("mainCanvasWrap");
const surfaceCompassEl = document.getElementById("surfaceCompass");
const surfaceCompassArrowEl = document.getElementById("surfaceCompassArrow");

// Right-side panels: panels are always visible; keep references for layout if needed
const wrapEl = document.getElementById("wrap");
const rightColEl = document.getElementById("rightCol");

const mini = document.getElementById("mini");
const mctx = mini.getContext("2d");

const viewSize = VIEW_RADIUS * 2 + 1;
const LOGICAL_CANVAS_SIZE = viewSize * TILE;
const MAX_RENDER_CANVAS_DIM = 4096;
const RENDER_SCALE = Math.min(1, MAX_RENDER_CANVAS_DIM / LOGICAL_CANVAS_SIZE);
canvas.width = Math.max(1, Math.floor(LOGICAL_CANVAS_SIZE * RENDER_SCALE));
canvas.height = Math.max(1, Math.floor(LOGICAL_CANVAS_SIZE * RENDER_SCALE));

mini.width = (MINI_RADIUS * 2 + 1) * MINI_SCALE;
mini.height = (MINI_RADIUS * 2 + 1) * MINI_SCALE;

let fogEnabled = true;
let minimapEnabled = true;
const shopUi = { open: false, mode: "buy", selectedBuy: 0, selectedSell: 0 };
let contextAuxSignature = "";

// ---------- RNG (deterministic base gen) ----------
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}
function sfc32(a, b, c, d) {
  return function () {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
function makeRng(seedStr) {
  const seed = xmur3(seedStr);
  return sfc32(seed(), seed(), seed(), seed());
}
function randInt(rng, lo, hiInclusive) {
  const span = hiInclusive - lo + 1;
  return lo + Math.floor(rng() * span);
}
function choice(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

// ---------- Helpers ----------
function floorDiv(a, b) { return Math.floor(a / b); }
function splitWorldToChunk(wx, wy) {
  const cx = floorDiv(wx, CHUNK);
  const cy = floorDiv(wy, CHUNK);
  const lx = wx - cx * CHUNK;
  const ly = wy - cy * CHUNK;
  return { cx, cy, lx, ly };
}
function keyXYZ(x, y, z) { return `${z}|${x},${y}`; }
function keyZCXCY(z, cx, cy) { return `${z}|${cx},${cy}`; }
function keyXY(x, y) { return `${x},${y}`; }
function inBounds(x, y) { return x >= 0 && y >= 0 && x < CHUNK && y < CHUNK; }

// ---------- Themes ----------
function themeForDepth(z) {
  if (z <= 2) return {
    name: "Stone",
    wallV: "#2a3142", wallNV: "#161b26",
    floorV: "#0f1a2e", floorNV: "#0b1220",
    doorC_V: "#3a2f1e", doorC_NV: "#211a10",
    doorO_V: "#2b3a50", doorO_NV: "#162033",
    lockR_V: "#4a1f1f", lockR_NV: "#2b1111",
    lockB_V: "#1f2f4a", lockB_NV: "#111a2b",
    lockG_V: "#1f4a2a", lockG_NV: "#112b18",
    downV: "#263a2a", downNV: "#162218",
    upV: "#2a263a", upNV: "#1b1623",
    overlay: "rgba(0,0,0,0.55)",
  };
  if (z <= 6) return {
    name: "Moss",
    wallV: "#2b3a3c", wallNV: "#172224",
    floorV: "#102822", floorNV: "#0b1916",
    doorC_V: "#3a2f1e", doorC_NV: "#211a10",
    doorO_V: "#20403a", doorO_NV: "#102622",
    lockR_V: "#4a1f1f", lockR_NV: "#2b1111",
    lockB_V: "#1f2f4a", lockB_NV: "#111a2b",
    lockG_V: "#1f4a2a", lockG_NV: "#112b18",
    downV: "#1f3a2a", downNV: "#132217",
    upV: "#2a263a", upNV: "#1b1623",
    overlay: "rgba(0,0,0,0.55)",
  };
  if (z <= 10) return {
    name: "Crypt",
    wallV: "#3a2f3a", wallNV: "#211a21",
    floorV: "#241326", floorNV: "#160b18",
    doorC_V: "#3a2f1e", doorC_NV: "#211a10",
    doorO_V: "#3a2340", doorO_NV: "#221627",
    lockR_V: "#5a2222", lockR_NV: "#311111",
    lockB_V: "#2a3c66", lockB_NV: "#16213a",
    lockG_V: "#2a6640", lockG_NV: "#163a22",
    downV: "#243a2a", downNV: "#162218",
    upV: "#2a263a", upNV: "#1b1623",
    overlay: "rgba(0,0,0,0.58)",
  };
  return {
    name: "Abyss",
    wallV: "#3a3a2b", wallNV: "#222217",
    floorV: "#1f1f0f", floorNV: "#12120b",
    doorC_V: "#3a2f1e", doorC_NV: "#211a10",
    doorO_V: "#3a3a1a", doorO_NV: "#232312",
    lockR_V: "#6b2a2a", lockR_NV: "#3a1515",
    lockB_V: "#2a4b7d", lockB_NV: "#1a2a46",
    lockG_V: "#2a7d46", lockG_NV: "#1a462a",
    downV: "#2a3a26", downNV: "#182216",
    upV: "#2a263a", upNV: "#1b1623",
    overlay: "rgba(0,0,0,0.62)",
  };
}

// ---------- Edge hashing (deterministic border openings) ----------
function edgeCanonical(z, cx, cy, dir) {
  let ax = cx, ay = cy, bx = cx, by = cy;
  if (dir === "E") bx = cx + 1;
  else if (dir === "W") bx = cx - 1;
  else if (dir === "S") by = cy + 1;
  else if (dir === "N") by = cy - 1;
  else throw new Error("bad dir");
  if (ax > bx || (ax === bx && ay > by)) { [ax, bx] = [bx, ax]; [ay, by] = [by, ay]; }
  return { z, ax, ay, bx, by };
}
function edgeInfo(seedStr, z, cx, cy, dir) {
  const { ax, ay, bx, by } = edgeCanonical(z, cx, cy, dir);
  const rng = makeRng(`${seedStr}|edge|z${z}|${ax},${ay}|${bx},${by}`);
  const open = rng() < 0.78;
  const pos = 2 + Math.floor(rng() * (CHUNK - 4));
  return { open, pos };
}

// ---------- Grid carving ----------
function newGrid(fill = WALL) {
  const g = new Array(CHUNK);
  for (let y = 0; y < CHUNK; y++) g[y] = new Array(CHUNK).fill(fill);
  return g;
}
function carveRect(grid, x, y, w, h, tile = FLOOR) {
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++)
      if (inBounds(xx, yy)) grid[yy][xx] = tile;
}
function carveOval(grid, cx, cy, rx, ry, tile = FLOOR) {
  const rx2 = rx * rx, ry2 = ry * ry;
  for (let y = cy - ry; y <= cy + ry; y++) {
    for (let x = cx - rx; x <= cx + rx; x++) {
      if (!inBounds(x, y)) continue;
      const dx = x - cx, dy = y - cy;
      if ((dx * dx) / rx2 + (dy * dy) / ry2 <= 1) grid[y][x] = tile;
    }
  }
}
function carveLine(grid, x1, y1, x2, y2, width, tile = FLOOR) {
  if (x1 === x2) {
    const [ya, yb] = y1 < y2 ? [y1, y2] : [y2, y1];
    for (let y = ya; y <= yb; y++)
      for (let dx = -Math.floor(width / 2); dx <= Math.floor(width / 2); dx++)
        if (inBounds(x1 + dx, y)) grid[y][x1 + dx] = tile;
  } else if (y1 === y2) {
    const [xa, xb] = x1 < x2 ? [x1, x2] : [x2, x1];
    for (let x = xa; x <= xb; x++)
      for (let dy = -Math.floor(width / 2); dy <= Math.floor(width / 2); dy++)
        if (inBounds(x, y1 + dy)) grid[y1 + dy][x] = tile;
  }
}
function carveCorridor(grid, rng, x1, y1, x2, y2) {
  const width = rng() < 0.25 ? 2 : 1;

  if (rng() < 0.28) {
    let x = x1, y = y1, safety = 800;
    while ((x !== x2 || y !== y2) && safety-- > 0) {
      for (let dy = -Math.floor(width / 2); dy <= Math.floor(width / 2); dy++)
        for (let dx = -Math.floor(width / 2); dx <= Math.floor(width / 2); dx++)
          if (inBounds(x + dx, y + dy)) grid[y + dy][x + dx] = FLOOR;

      const dxTo = x2 - x, dyTo = y2 - y;
      const opts = [];
      if (dxTo !== 0) opts.push({ x: x + Math.sign(dxTo), y, w: 3 });
      if (dyTo !== 0) opts.push({ x, y: y + Math.sign(dyTo), w: 3 });
      if (rng() < 0.35) {
        opts.push({ x: x + (rng() < 0.5 ? -1 : 1), y, w: 1 });
        opts.push({ x, y: y + (rng() < 0.5 ? -1 : 1), w: 1 });
      }
      const total = opts.reduce((s, o) => s + o.w, 0);
      let r = rng() * total;
      let pick = opts[0];
      for (const o of opts) { r -= o.w; if (r <= 0) { pick = o; break; } }
      x = clamp(pick.x, 1, CHUNK - 2);
      y = clamp(pick.y, 1, CHUNK - 2);
    }
    return;
  }

  if (rng() < 0.5) {
    const midX = clamp(x2 + (rng() < 0.35 ? randInt(rng, -3, 3) : 0), 1, CHUNK - 2);
    carveLine(grid, x1, y1, midX, y1, width);
    carveLine(grid, midX, y1, midX, y2, width);
    carveLine(grid, midX, y2, x2, y2, width);
  } else {
    const midY = clamp(y2 + (rng() < 0.35 ? randInt(rng, -3, 3) : 0), 1, CHUNK - 2);
    carveLine(grid, x1, y1, x1, midY, width);
    carveLine(grid, x1, midY, x2, midY, width);
    carveLine(grid, x2, midY, x2, y2, width);
  }
}

function tileBlocksLOS(t) {
  if (t === WALL) return true;
  if (t === DOOR_CLOSED) return true;
  if (t === LOCK_RED || t === LOCK_BLUE || t === LOCK_GREEN) return true;
  if (t === "*") return true; // old compat
  return false;
}

function floodConnected(grid, sx, sy) {
  const passable = (t) => t === FLOOR || t === DOOR_OPEN || t === STAIRS_DOWN || t === STAIRS_UP;
  const q = [{ x: sx, y: sy }];
  const seen = new Set([keyXY(sx, sy)]);
  while (q.length) {
    const { x, y } = q.shift();
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      if (!passable(grid[ny][nx])) continue;
      const k = keyXY(nx, ny);
      if (seen.has(k)) continue;
      seen.add(k);
      q.push({ x: nx, y: ny });
    }
  }
  return seen;
}
function ensureChunkConnectivity(grid, rng) {
  const passable = (t) => t === FLOOR || t === DOOR_OPEN || t === STAIRS_DOWN || t === STAIRS_UP;
  let carved = 0;
  let start = null;
  for (let y = 1; y < CHUNK - 1 && !start; y++)
    for (let x = 1; x < CHUNK - 1; x++)
      if (passable(grid[y][x])) { start = { x, y }; break; }
  if (!start) return;

  while (true) {
    const connected = floodConnected(grid, start.x, start.y);
    let island = null;
    for (let y = 1; y < CHUNK - 1 && !island; y++)
      for (let x = 1; x < CHUNK - 1; x++)
        if (passable(grid[y][x]) && !connected.has(keyXY(x, y))) { island = { x, y }; break; }
    if (!island) break;

    let best = null, bestD = Infinity;
    for (const k of connected) {
      const [cx, cy] = k.split(",").map(Number);
      const dx = cx - island.x, dy = cy - island.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = { x: cx, y: cy }; }
    }
    if (!best) break;
    carveCorridor(grid, rng, island.x, island.y, best.x, best.y);
    carved += 1;
  }
  return carved;
}

function pickLockColor(rng, z) {
  return LOCK_RED;
}

function placeInternalDoors(grid, rng, z) {
  const floorish = (t) => t === FLOOR || t === DOOR_OPEN || t === STAIRS_DOWN || t === STAIRS_UP;
  for (let y = 1; y < CHUNK - 1; y++) {
    for (let x = 1; x < CHUNK - 1; x++) {
      if (grid[y][x] !== WALL) continue;
      const n = grid[y - 1][x], s = grid[y + 1][x], w = grid[y][x - 1], e = grid[y][x + 1];
      const ns = floorish(n) && floorish(s) && w === WALL && e === WALL;
      const we = floorish(w) && floorish(e) && n === WALL && s === WALL;
      if ((ns || we) && rng() < 0.50) {
        // Keep base generation as regular connector doors; locks are applied via proximity conversion.
        grid[y][x] = DOOR_CLOSED;
      }
    }
  }
}

// ---------- Special rooms ----------
function rectMostlyWalls(grid, x, y, w, h) {
  let walls = 0, total = 0;
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      if (!inBounds(xx, yy)) return false;
      total++;
      if (grid[yy][xx] === WALL) walls++;
    }
  }
  return walls / total >= 0.9;
}

function tryAddTreasureRoom(seedStr, rng, z, grid, anchors) {
  const specials = {};
  const chance = clamp(0.10 + z * 0.007, 0, 0.30);
  if (rng() >= chance) return specials;

  for (let attempt = 0; attempt < 12; attempt++) {
    const a = anchors[randInt(rng, 0, anchors.length - 1)];
    const dir = choice(rng, ["N","S","W","E"]);
    const w = randInt(rng, 6, 10);
    const h = randInt(rng, 5, 8);

    let x = a.cx - Math.floor(w / 2);
    let y = a.cy - Math.floor(h / 2);
    const gap = 2;
    if (dir === "N") y = a.cy - h - gap;
    if (dir === "S") y = a.cy + gap;
    if (dir === "W") x = a.cx - w - gap;
    if (dir === "E") x = a.cx + gap;

    x = clamp(x, 2, CHUNK - 2 - w);
    y = clamp(y, 2, CHUNK - 2 - h);

    if (!rectMostlyWalls(grid, x, y, w, h)) continue;

    carveRect(grid, x, y, w, h, FLOOR);

    let doorX = clamp(a.cx, x + 1, x + w - 2);
    let doorY = clamp(a.cy, y + 1, y + h - 2);
    let outsideX = doorX, outsideY = doorY;

    if (dir === "N") { doorY = y + h - 1; outsideY = doorY + 1; }
    if (dir === "S") { doorY = y; outsideY = doorY - 1; }
    if (dir === "W") { doorX = x + w - 1; outsideX = doorX + 1; }
    if (dir === "E") { doorX = x; outsideX = doorX - 1; }

    carveCorridor(grid, rng, a.cx, a.cy, outsideX, outsideY);

    grid[doorY][doorX] = DOOR_CLOSED;

    specials.treasure = { lx: x + Math.floor(w / 2), ly: y + Math.floor(h / 2) };
    return specials;
  }
  return specials;
}

function tryAddShrineRoom(seedStr, rng, z, grid, anchors) {
  const specials = {};
  // increase base shrine chance and depth scaling so shrines appear more often
  const chance = clamp(0.14 + z * 0.01, 0, 0.35);
  if (rng() >= chance) return specials;

  for (let attempt = 0; attempt < 12; attempt++) {
    const a = anchors[randInt(rng, 0, anchors.length - 1)];
    const dir = choice(rng, ["N","S","W","E"]);
    const w = randInt(rng, 6, 10);
    const h = randInt(rng, 5, 8);

    let x = a.cx - Math.floor(w / 2);
    let y = a.cy - Math.floor(h / 2);
    const gap = 2;
    if (dir === "N") y = a.cy - h - gap;
    if (dir === "S") y = a.cy + gap;
    if (dir === "W") x = a.cx - w - gap;
    if (dir === "E") x = a.cx + gap;

    x = clamp(x, 2, CHUNK - 2 - w);
    y = clamp(y, 2, CHUNK - 2 - h);

    if (!rectMostlyWalls(grid, x, y, w, h)) continue;

    carveRect(grid, x, y, w, h, FLOOR);

    let doorX = clamp(a.cx, x + 1, x + w - 2);
    let doorY = clamp(a.cy, y + 1, y + h - 2);
    let outsideX = doorX, outsideY = doorY;

    if (dir === "N") { doorY = y + h - 1; outsideY = doorY + 1; }
    if (dir === "S") { doorY = y; outsideY = doorY - 1; }
    if (dir === "W") { doorX = x + w - 1; outsideX = doorX + 1; }
    if (dir === "E") { doorX = x; outsideX = doorX - 1; }

    carveCorridor(grid, rng, a.cx, a.cy, outsideX, outsideY);

    grid[doorY][doorX] = DOOR_CLOSED;

    specials.shrine = { lx: x + Math.floor(w / 2), ly: y + Math.floor(h / 2) };
    return specials;
  }
  return specials;
}

// ---------- Chunk generation ----------
function generateSurfaceChunk(z, cx, cy) {
  const grid = newGrid(WALL);
  for (let ly = 0; ly < CHUNK; ly++) {
    for (let lx = 0; lx < CHUNK; lx++) {
      const wx = cx * CHUNK + lx;
      const wy = cy * CHUNK + ly;
      const ax = Math.abs(wx);
      const ay = Math.abs(wy);
      if (ax < SURFACE_HALF_SIZE && ay < SURFACE_HALF_SIZE) grid[ly][lx] = FLOOR;
      else if (
        (ax === SURFACE_HALF_SIZE && ay <= SURFACE_HALF_SIZE) ||
        (ay === SURFACE_HALF_SIZE && ax <= SURFACE_HALF_SIZE)
      ) grid[ly][lx] = WALL;

      // Surface return ladder is fixed at the center.
      if (wx === 0 && wy === 0) grid[ly][lx] = STAIRS_DOWN;
    }
  }
  return {
    z, cx, cy, grid,
    specials: {},
    explore: { rooms: 0, corridors: 0 },
    surface: true,
  };
}

function generateChunk(seedStr, z, cx, cy) {
  if (z === SURFACE_LEVEL) return generateSurfaceChunk(z, cx, cy);

  const rng = makeRng(`${seedStr}|chunk|z${z}|${cx},${cy}`);
  const grid = newGrid(WALL);

  const edges = {
    N: edgeInfo(seedStr, z, cx, cy, "N"),
    S: edgeInfo(seedStr, z, cx, cy, "S"),
    W: edgeInfo(seedStr, z, cx, cy, "W"),
    E: edgeInfo(seedStr, z, cx, cy, "E"),
  };

  const rooms = [];
  let corridorCount = 0;
  const roomCount = randInt(rng, 2, 4);

  for (let i = 0; i < roomCount; i++) {
    const t = choice(rng, ["rect","rect","L","oval"]);
    if (t === "rect") {
      const w = randInt(rng, 5, 13);
      const h = randInt(rng, 4, 10);
      const x = randInt(rng, 2, CHUNK - 2 - w);
      const y = randInt(rng, 2, CHUNK - 2 - h);
      carveRect(grid, x, y, w, h, FLOOR);
      rooms.push({ cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2) });
    } else if (t === "L") {
      const w1 = randInt(rng, 6, 13);
      const h1 = randInt(rng, 4, 10);
      const w2 = randInt(rng, 4, 9);
      const h2 = randInt(rng, 4, 9);
      const x = randInt(rng, 2, CHUNK - 2 - Math.max(w1, w2));
      const y = randInt(rng, 2, CHUNK - 2 - Math.max(h1, h2));
      carveRect(grid, x, y, w1, h1, FLOOR);

      const attach = choice(rng, ["right-down","left-down","right-up","left-up"]);
      let x2 = x, y2 = y;
      if (attach.includes("right")) x2 = x + Math.max(1, w1 - Math.floor(w2 / 2));
      else x2 = Math.max(2, x - Math.floor(w2 / 2));
      if (attach.includes("down")) y2 = y + Math.max(1, h1 - Math.floor(h2 / 2));
      else y2 = Math.max(2, y - Math.floor(h2 / 2));
      x2 = clamp(x2, 2, CHUNK - 2 - w2);
      y2 = clamp(y2, 2, CHUNK - 2 - h2);
      carveRect(grid, x2, y2, w2, h2, FLOOR);

      rooms.push({
        cx: Math.floor((x + x2 + Math.floor(w1 / 2) + Math.floor(w2 / 2)) / 2),
        cy: Math.floor((y + y2 + Math.floor(h1 / 2) + Math.floor(h2 / 2)) / 2),
      });
    } else {
      const rx = randInt(rng, 3, 6);
      const ry = randInt(rng, 3, 6);
      const ox = randInt(rng, 2 + rx, CHUNK - 3 - rx);
      const oy = randInt(rng, 2 + ry, CHUNK - 3 - ry);
      carveOval(grid, ox, oy, rx, ry, FLOOR);
      rooms.push({ cx: ox, cy: oy });
    }
  }

  for (let i = 1; i < rooms.length; i++) {
    carveCorridor(grid, rng, rooms[i - 1].cx, rooms[i - 1].cy, rooms[i].cx, rooms[i].cy);
    corridorCount += 1;
  }
  if (rooms.length >= 3 && rng() < 0.6) {
    carveCorridor(grid, rng, rooms[0].cx, rooms[0].cy, rooms[rooms.length - 1].cx, rooms[rooms.length - 1].cy);
    corridorCount += 1;
  }

  const openCount = ["N","S","W","E"].reduce((n, d) => n + (edges[d].open ? 1 : 0), 0);
  if (openCount === 0) edges.E.open = true;

  const anchors = rooms.length ? rooms : [{ cx: Math.floor(CHUNK / 2), cy: Math.floor(CHUNK / 2) }];
  const nearestAnchor = (x, y) => {
    let best = anchors[0], bestD = Infinity;
    for (const a of anchors) {
      const dx = a.cx - x, dy = a.cy - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = a; }
    }
    return best;
  };

  function openDoorAt(dir) {
    const info = edges[dir];
    if (!info.open) return;

    if (dir === "N") {
      const x = info.pos;
      grid[0][x] = DOOR_CLOSED;
      grid[1][x] = FLOOR;
      const a = nearestAnchor(x, 1);
      carveCorridor(grid, rng, x, 1, a.cx, a.cy);
      corridorCount += 1;
    } else if (dir === "S") {
      const x = info.pos;
      grid[CHUNK - 1][x] = DOOR_CLOSED;
      grid[CHUNK - 2][x] = FLOOR;
      const a = nearestAnchor(x, CHUNK - 2);
      carveCorridor(grid, rng, x, CHUNK - 2, a.cx, a.cy);
      corridorCount += 1;
    } else if (dir === "W") {
      const y = info.pos;
      grid[y][0] = DOOR_CLOSED;
      grid[y][1] = FLOOR;
      const a = nearestAnchor(1, y);
      carveCorridor(grid, rng, 1, y, a.cx, a.cy);
      corridorCount += 1;
    } else if (dir === "E") {
      const y = info.pos;
      grid[y][CHUNK - 1] = DOOR_CLOSED;
      grid[y][CHUNK - 2] = FLOOR;
      const a = nearestAnchor(CHUNK - 2, y);
      carveCorridor(grid, rng, CHUNK - 2, y, a.cx, a.cy);
      corridorCount += 1;
    }
  }

  openDoorAt("N"); openDoorAt("S"); openDoorAt("W"); openDoorAt("E");

  corridorCount += ensureChunkConnectivity(grid, rng) ?? 0;
  placeInternalDoors(grid, rng, z);

  function placeRandomStair(centerTile) {
    let best = null, bestD = Infinity;
    const tx = Math.floor(CHUNK / 2), ty = Math.floor(CHUNK / 2);
    for (let y = 2; y < CHUNK - 2; y++) for (let x = 2; x < CHUNK - 2; x++) {
      const t = grid[y][x];
      if (t !== FLOOR && t !== DOOR_CLOSED && t !== DOOR_OPEN) continue;
      const dx = x - tx, dy = y - ty;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = { x, y }; }
    }
    if (!best) return false;
    grid[best.y][best.x] = centerTile;
    return true;
  }

  // Keep start chunk dedicated to the surface ladder (no down stairs there).
  const hasDownStairs = !(z === 0 && cx === 0 && cy === 0) && rng() < STAIRS_DOWN_SPAWN_CHANCE;
  if (hasDownStairs) {
    placeRandomStair(STAIRS_DOWN);
  }
  const hasUpStairs = z > 0 && rng() < STAIRS_UP_SPAWN_CHANCE;
  if (hasUpStairs) {
    placeRandomStair(STAIRS_UP);
  }

  const specials = {
    ...tryAddTreasureRoom(seedStr, rng, z, grid, anchors),
    ...tryAddShrineRoom(seedStr, rng, z, grid, anchors),
  };
  const specialRoomCount = (specials.treasure ? 1 : 0) + (specials.shrine ? 1 : 0);
  const specialCorridorCount = specialRoomCount; // each special room uses one connector corridor
  const explore = {
    rooms: roomCount + specialRoomCount,
    corridors: corridorCount + specialCorridorCount,
  };

  return { z, cx, cy, grid, specials, explore };
}

// ---------- World ----------
class World {
  constructor(seedStr, tileOverrides = null) {
    this.seedStr = seedStr;
    this.chunks = new Map();
    this.tileOverrides = tileOverrides ?? new Map(); // keyXYZ -> tile
  }
  chunkKey(z, cx, cy) { return `${z}|${cx},${cy}`; }
  getChunk(z, cx, cy) {
    const k = this.chunkKey(z, cx, cy);
    let c = this.chunks.get(k);
    if (!c) { c = generateChunk(this.seedStr, z, cx, cy); this.chunks.set(k, c); }
    return c;
  }
  normalizeTile(t) {
    if (t === "*") return LOCK_RED;
    return t;
  }
  getTile(x, y, z) {
    const ov = this.tileOverrides.get(keyXYZ(x, y, z));
    if (ov) return this.normalizeTile(ov);
    const { cx, cy, lx, ly } = splitWorldToChunk(x, y);
    const ch = this.getChunk(z, cx, cy);
    return this.normalizeTile(ch.grid[ly][lx]);
  }
  setTile(x, y, z, tile) {
    this.tileOverrides.set(keyXYZ(x, y, z), tile);
  }
  isPassable(x, y, z) {
    const t = this.getTile(x, y, z);
    return t === FLOOR || t === DOOR_OPEN || t === STAIRS_DOWN || t === STAIRS_UP;
  }
  ensureChunksAround(x, y, z, radiusTiles) {
    const minX = x - radiusTiles, maxX = x + radiusTiles;
    const minY = y - radiusTiles, maxY = y + radiusTiles;
    const cMin = splitWorldToChunk(minX, minY);
    const cMax = splitWorldToChunk(maxX, maxY);
    for (let cy = cMin.cy; cy <= cMax.cy; cy++)
      for (let cx = cMin.cx; cx <= cMax.cx; cx++)
        this.getChunk(z, cx, cy);
  }
}

// ---------- LOS / FOV ----------
function bresenham(x0, y0, x1, y1) {
  const pts = [];
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  while (true) {
    pts.push({ x: x0, y: y0 });
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
  return pts;
}
function hasLineOfSight(world, z, x0, y0, x1, y1) {
  const pts = bresenham(x0, y0, x1, y1);
  for (let i = 1; i < pts.length - 1; i++) {
    const t = world.getTile(pts[i].x, pts[i].y, z);
    if (tileBlocksLOS(t)) return false;
  }
  return true;
}

// ---------- Monsters / Items ----------
const MONSTER_TYPES = {
  rat:          { name: "Rat",          maxHp: 600,  atkLo: 100, atkHi: 300, xp: 2,  glyph: "r" },
  goblin:       { name: "Goblin",       maxHp: 1000, atkLo: 200, atkHi: 400, xp: 4,  glyph: "g" },
  slime:        { name: "Slime",        maxHp: 1400, atkLo: 200, atkHi: 500, xp: 5,  glyph: "s" },
  rogue:        { name: "Rogue",        maxHp: 1300, atkLo: 260, atkHi: 560, xp: 7,  glyph: "r" },
  jelly_green:  { name: "Jelly",        maxHp: 1200, atkLo: 180, atkHi: 420, xp: 5,  glyph: "j" },
  jelly_yellow: { name: "Jelly",        maxHp: 1800, atkLo: 250, atkHi: 620, xp: 8,  glyph: "j" },
  jelly_red:    { name: "Jelly",        maxHp: 2500, atkLo: 360, atkHi: 820, xp: 11, glyph: "j" },
  // Backward-compat alias for older saves.
  jelly:        { name: "Jelly",        maxHp: 1800, atkLo: 250, atkHi: 620, xp: 8,  glyph: "j" },
  giant_spider: { name: "Giant Spider", maxHp: 2200, atkLo: 320, atkHi: 720, xp: 10, glyph: "S" },
  skeleton:     { name: "Skeleton",     maxHp: 1800, atkLo: 300, atkHi: 600, xp: 8,  glyph: "k" },
  archer:       { name: "Archer",       maxHp: 1200, atkLo: 200, atkHi: 400, xp: 7,  glyph: "a", range: 6, cdTurns: 2 },
};

function monsterStatsForDepth(type, z) {
  const spec = MONSTER_TYPES[type] ?? MONSTER_TYPES.rat;
  const depth = clamp(z, 0, 60);
  const hpScale = 1 + Math.min(1.8, depth * 0.12);
  const atkScale = 1 + Math.min(1.2, depth * 0.08);
  const maxHp = Math.max(1, Math.floor(spec.maxHp * hpScale));
  const atkLo = Math.max(1, Math.floor(spec.atkLo * atkScale));
  const atkHi = Math.max(atkLo, Math.floor(spec.atkHi * atkScale));
  return { ...spec, maxHp, atkLo, atkHi };
}

const WEAPON_MATERIALS = ["bronze", "iron", "steel"];
const WEAPON_KINDS = ["dagger", "sword", "axe"];
const ARMOR_MATERIALS = ["leather", "iron", "steel"];
const ARMOR_SLOTS = ["chest", "legs"];

const WEAPON_KIND_LABEL = {
  dagger: "Dagger",
  sword: "Sword",
  axe: "Axe",
};
const WEAPON_KIND_ATK = {
  dagger: 90,
  sword: 150,
  axe: 210,
};
const WEAPON_MATERIAL_ATK = {
  bronze: 0,
  iron: 120,
  steel: 260,
};
const ARMOR_MATERIAL_DEF = {
  leather: 60,
  iron: 150,
  steel: 250,
};
const ARMOR_SLOT_DEF = {
  chest: 130,
  legs: 90,
};

function capWord(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function weaponType(material, kind) { return `weapon_${material}_${kind}`; }
function armorType(material, slot) { return `armor_${material}_${slot}`; }

const ITEM_TYPES = {
  potion: { name: "Potion" },
  gold: { name: "Gold" },
  shopkeeper: { name: "Shopkeeper" },

  key_red: { name: "Red Key" },
  key_blue: { name: "Blue Key" },
  key_green: { name: "Green Key" },

  chest: { name: "Chest" },
  shrine: { name: "Shrine" },
};

const WEAPONS = {};
for (const material of WEAPON_MATERIALS) {
  for (const kind of WEAPON_KINDS) {
    const id = weaponType(material, kind);
    ITEM_TYPES[id] = { name: `${capWord(material)} ${WEAPON_KIND_LABEL[kind]}` };
    WEAPONS[id] = { atkBonus: WEAPON_KIND_ATK[kind] + WEAPON_MATERIAL_ATK[material] };
  }
}

const ARMOR_PIECES = {};
for (const material of ARMOR_MATERIALS) {
  for (const slot of ARMOR_SLOTS) {
    const id = armorType(material, slot);
    const slotLabel = slot === "chest" ? "Chest Armor" : "Leg Armor";
    ITEM_TYPES[id] = { name: `${capWord(material)} ${slotLabel}` };
    ARMOR_PIECES[id] = { slot, defBonus: ARMOR_MATERIAL_DEF[material] + ARMOR_SLOT_DEF[slot] };
  }
}

const LEGACY_ITEM_MAP = {
  weapon_dagger: weaponType("bronze", "dagger"),
  weapon_sword: weaponType("bronze", "sword"),
  weapon_axe: weaponType("bronze", "axe"),
  weapon_mace: weaponType("iron", "axe"),
  weapon_greatsword: weaponType("steel", "sword"),
  weapon_runeblade: weaponType("steel", "axe"),
  armor_leather: armorType("leather", "chest"),
  armor_chain: armorType("iron", "chest"),
  armor_plate: armorType("steel", "chest"),
};

function normalizeItemType(type) {
  return LEGACY_ITEM_MAP[type] ?? type;
}

function weightedPick(rng, entries) {
  const total = entries.reduce((s, e) => s + e.w, 0);
  let r = rng() * total;
  for (const e of entries) {
    r -= e.w;
    if (r <= 0) return e.id;
  }
  return entries[entries.length - 1].id;
}

function weaponMaterialWeightsForDepth(z) {
  if (z <= 0) return [{ id: "bronze", w: 100 }];
  if (z <= 2) return [{ id: "bronze", w: 72 }, { id: "iron", w: 28 }];
  if (z <= 4) return [{ id: "bronze", w: 48 }, { id: "iron", w: 42 }, { id: "steel", w: 10 }];
  if (z <= 8) return [{ id: "bronze", w: 28 }, { id: "iron", w: 47 }, { id: "steel", w: 25 }];
  return [{ id: "bronze", w: 14 }, { id: "iron", w: 46 }, { id: "steel", w: 40 }];
}

function armorMaterialWeightsForDepth(z) {
  if (z <= 0) return [{ id: "leather", w: 100 }];
  if (z <= 2) return [{ id: "leather", w: 70 }, { id: "iron", w: 30 }];
  if (z <= 4) return [{ id: "leather", w: 46 }, { id: "iron", w: 44 }, { id: "steel", w: 10 }];
  if (z <= 8) return [{ id: "leather", w: 24 }, { id: "iron", w: 50 }, { id: "steel", w: 26 }];
  return [{ id: "leather", w: 12 }, { id: "iron", w: 49 }, { id: "steel", w: 39 }];
}

function weaponForDepth(z, rng = Math.random) {
  const material = weightedPick(rng, weaponMaterialWeightsForDepth(z));
  const kind = weightedPick(rng, [
    { id: "dagger", w: 28 },
    { id: "sword", w: 40 },
    { id: "axe", w: 32 },
  ]);
  return weaponType(material, kind);
}

function armorForDepth(z, rng = Math.random) {
  const material = weightedPick(rng, armorMaterialWeightsForDepth(z));
  const slot = rng() < 0.56 ? "chest" : "legs";
  return armorType(material, slot);
}

function itemMarketValue(type) {
  if (type === "potion") return 60;
  if (type === "gold") return 1;
  if (type?.startsWith("weapon_")) {
    const atk = WEAPONS[type]?.atkBonus ?? 0;
    return Math.max(20, Math.floor(40 + atk * 0.55));
  }
  if (type?.startsWith("armor_")) {
    const def = ARMOR_PIECES[type]?.defBonus ?? 0;
    return Math.max(20, Math.floor(35 + def * 0.6));
  }
  return 20;
}

function shopBuyPrice(type, depth) {
  const base = itemMarketValue(type);
  const markup = type === "potion" ? 1.2 : (1.25 + Math.min(0.25, depth * 0.01));
  return Math.max(5, Math.floor(base * markup));
}

function shopSellPrice(type) {
  return Math.max(1, Math.floor(itemMarketValue(type) * 0.25));
}

function shopCatalogForDepth(depth) {
  const d = Math.max(0, depth);
  const items = [{ type: "potion", w: 10 }];

  for (const kind of WEAPON_KINDS) {
    items.push({ type: weaponType("bronze", kind), w: 9 });
  }
  for (const slot of ARMOR_SLOTS) {
    items.push({ type: armorType("leather", slot), w: 8 });
  }

  const ironWeight = d <= 0 ? 0 : d <= 2 ? 4 : 6;
  for (const kind of WEAPON_KINDS) {
    if (ironWeight > 0) items.push({ type: weaponType("iron", kind), w: ironWeight });
  }
  for (const slot of ARMOR_SLOTS) {
    if (ironWeight > 0) items.push({ type: armorType("iron", slot), w: Math.max(1, ironWeight - 1) });
  }

  const steelWeight = d < 3 ? 0 : d < 6 ? 2 : d < 10 ? 3 : 5;
  if (steelWeight > 0) {
    for (const kind of WEAPON_KINDS) {
      items.push({ type: weaponType("steel", kind), w: steelWeight });
    }
    for (const slot of ARMOR_SLOTS) {
      items.push({ type: armorType("steel", slot), w: steelWeight });
    }
  }

  return items;
}

function drawUniqueWeightedItems(rng, weightedItems, count) {
  const pool = weightedItems.map((x) => ({ ...x }));
  const out = [];
  while (pool.length && out.length < count) {
    const total = pool.reduce((s, x) => s + Math.max(0, x.w), 0);
    if (total <= 0) break;
    let r = rng() * total;
    let pickIndex = 0;
    for (let i = 0; i < pool.length; i++) {
      r -= Math.max(0, pool[i].w);
      if (r <= 0) {
        pickIndex = i;
        break;
      }
    }
    out.push(pool[pickIndex].type);
    pool.splice(pickIndex, 1);
  }
  return out;
}

function ensureShopState(state) {
  if (state.shop) return;
  const now = Date.now();
  const depth = Math.max(0, state.player.z) + Math.floor((state.player.level - 1) / 2);
  const catalog = shopCatalogForDepth(depth);
  const size = clamp(7 + Math.floor(depth / 4), 7, Math.min(12, catalog.length));
  const types = drawUniqueWeightedItems(Math.random, catalog, size);
  state.shop = {
    stock: types.map((type) => ({ type, price: shopBuyPrice(type, depth) })),
    lastRefreshMs: now,
    nextRefreshMs: now + randInt(Math.random, 5, 15) * 60 * 1000,
  };
}

function refreshShopStock(state, force = false) {
  ensureShopState(state);
  const now = Date.now();
  if (!force && now < (state.shop?.nextRefreshMs ?? 0)) return false;

  const depth = Math.max(0, state.player.z) + Math.floor((state.player.level - 1) / 2);
  const catalog = shopCatalogForDepth(depth);
  const targetCount = clamp(7 + Math.floor(depth / 4), 7, Math.min(12, catalog.length));
  let nextTypes = (state.shop?.stock ?? []).map((s) => s.type).slice(0, targetCount);

  if (nextTypes.length < targetCount) {
    const fill = drawUniqueWeightedItems(
      Math.random,
      catalog.filter((c) => !nextTypes.includes(c.type)),
      targetCount - nextTypes.length
    );
    nextTypes = nextTypes.concat(fill);
  }

  if (nextTypes.length === 0) {
    nextTypes = drawUniqueWeightedItems(Math.random, catalog, targetCount);
  } else {
    const changeCount = randInt(Math.random, 1, nextTypes.length);
    const idxOrder = [...nextTypes.keys()].sort(() => Math.random() - 0.5).slice(0, changeCount);
    for (const idx of idxOrder) {
      const current = nextTypes[idx];
      const alternatives = catalog.filter((c) => c.type !== current && !nextTypes.includes(c.type));
      if (!alternatives.length) continue;
      const picked = drawUniqueWeightedItems(Math.random, alternatives, 1)[0];
      if (picked) nextTypes[idx] = picked;
    }
  }

  state.shop.stock = nextTypes.map((type) => ({ type, price: shopBuyPrice(type, depth) }));
  state.shop.lastRefreshMs = now;
  state.shop.nextRefreshMs = now + randInt(Math.random, 5, 15) * 60 * 1000;
  return true;
}

function isShopOverlayOpen() {
  return !!shopUi.open && !!shopOverlayEl?.classList.contains("show");
}

function formatMs(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

function getSellableInventory(state) {
  return state.inv
    .map((entry, idx) => ({
      idx,
      type: entry.type,
      amount: entry.amount ?? 1,
      price: shopSellPrice(entry.type),
    }))
    .filter((entry) =>
      entry.type === "potion" ||
      entry.type.startsWith("weapon_") ||
      entry.type.startsWith("armor_")
    );
}

function closeShopOverlay() {
  shopUi.open = false;
  if (!shopOverlayEl) return;
  shopOverlayEl.classList.remove("show");
  shopOverlayEl.setAttribute("aria-hidden", "true");
}

function updateShopOverlayMeta(state) {
  if (!shopUi.open) return;
  const now = Date.now();
  if (shopGoldEl) shopGoldEl.textContent = `Gold: ${state.player.gold}`;
  if (shopRefreshEl) {
    const remaining = (state.shop?.nextRefreshMs ?? now) - now;
    shopRefreshEl.textContent = `Refresh in ${formatMs(remaining)}`;
  }
}

function openShopOverlay(state, mode = "buy") {
  if (!shopOverlayEl) return false;
  ensureShopState(state);
  refreshShopStock(state, false);
  shopUi.open = true;
  shopUi.mode = mode === "sell" ? "sell" : "buy";
  if (shopUi.selectedBuy < 0) shopUi.selectedBuy = 0;
  if (shopUi.selectedSell < 0) shopUi.selectedSell = 0;
  shopOverlayEl.classList.add("show");
  shopOverlayEl.setAttribute("aria-hidden", "false");
  renderShopOverlay(state);
  return true;
}

function renderShopOverlay(state) {
  if (!shopUi.open || !shopOverlayEl || !shopListEl) return;

  const stock = state.shop?.stock ?? [];
  const sellable = getSellableInventory(state);
  const isBuyMode = shopUi.mode === "buy";
  const entries = isBuyMode ? stock : sellable;

  if (isBuyMode) shopUi.selectedBuy = clamp(shopUi.selectedBuy, 0, Math.max(0, entries.length - 1));
  else shopUi.selectedSell = clamp(shopUi.selectedSell, 0, Math.max(0, entries.length - 1));
  const selectedIdx = isBuyMode ? shopUi.selectedBuy : shopUi.selectedSell;
  const selected = entries[selectedIdx] ?? null;

  shopTabBuyEl?.classList.toggle("active", isBuyMode);
  shopTabSellEl?.classList.toggle("active", !isBuyMode);
  updateShopOverlayMeta(state);

  shopListEl.innerHTML = "";
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = isBuyMode ? "(no stock available)" : "(nothing sellable in inventory)";
    shopListEl.appendChild(empty);
  } else {
    entries.forEach((entry, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `shopItemBtn${idx === selectedIdx ? " active" : ""}`;
      const nm = ITEM_TYPES[entry.type]?.name ?? entry.type;
      if (isBuyMode) btn.textContent = `${idx + 1}. ${nm} - ${entry.price}g`;
      else btn.textContent = `${idx + 1}. ${nm} x${entry.amount} - ${entry.price}g`;
      btn.addEventListener("click", () => {
        if (isBuyMode) shopUi.selectedBuy = idx;
        else shopUi.selectedSell = idx;
        renderShopOverlay(state);
      });
      shopListEl.appendChild(btn);
    });
  }

  if (!selected) {
    if (shopDetailTitleEl) shopDetailTitleEl.textContent = "Select an item";
    if (shopDetailBodyEl) shopDetailBodyEl.textContent = "Tap an item to view details.";
    if (shopActionBtnEl) {
      shopActionBtnEl.textContent = isBuyMode ? "Buy" : "Sell";
      shopActionBtnEl.disabled = true;
      shopActionBtnEl.onclick = null;
    }
    return;
  }

  const selectedName = ITEM_TYPES[selected.type]?.name ?? selected.type;
  const atk = WEAPONS[selected.type]?.atkBonus ?? 0;
  const def = ARMOR_PIECES[selected.type]?.defBonus ?? 0;
  const details = [];
  if (atk > 0) details.push(`ATK Bonus: +${atk}`);
  if (def > 0) details.push(`DEF Bonus: +${def}`);
  if (!atk && !def && selected.type === "potion") details.push("Consumable healing item.");
  if (!atk && !def && selected.type !== "potion") details.push("Utility item.");
  if (!isBuyMode) details.push(`Inventory: ${selected.amount}`);
  details.push(`Value: ${itemMarketValue(selected.type)}g`);

  if (shopDetailTitleEl) shopDetailTitleEl.textContent = selectedName;
  if (shopDetailBodyEl) {
    const actionLine = isBuyMode ? `Buy price: ${selected.price}g` : `Sell price: ${selected.price}g`;
    shopDetailBodyEl.textContent = `${details.join("\n")}\n${actionLine}`;
  }
  if (!shopActionBtnEl) return;
  shopActionBtnEl.textContent = isBuyMode ? "Buy Selected" : "Sell One";
  shopActionBtnEl.disabled = isBuyMode ? state.player.gold < selected.price : selected.amount <= 0;
  shopActionBtnEl.onclick = () => {
    if (isBuyMode) {
      if (state.player.gold < selected.price) {
        pushLog(state, "Not enough gold.");
      } else {
        state.player.gold -= selected.price;
        invAdd(state, selected.type, 1);
        pushLog(state, `Bought ${selectedName} for ${selected.price} gold.`);
      }
    } else {
      if (!invConsume(state, selected.type, 1)) {
        pushLog(state, "Couldn't complete that sale.");
      } else {
        state.player.gold += selected.price;
        pushLog(state, `Sold ${selectedName} for ${selected.price} gold.`);
      }
    }
    recalcDerivedStats(state);
    renderInventory(state);
    renderEquipment(state);
    saveNow(state);
    renderShopOverlay(state);
  };
}

function weightedChoice(rng, entries) {
  const total = entries.reduce((s, e) => s + e.w, 0);
  let r = rng() * total;
  for (const e of entries) {
    r -= e.w;
    if (r <= 0) return e.id;
  }
  return entries[entries.length - 1].id;
}
function monsterTableForDepth(z) {
  if (z <= 1) return [{ id: "rat", w: 5 }, { id: "goblin", w: 3 }, { id: "jelly_green", w: 3 }];
  if (z <= 3) return [{ id: "rat", w: 3 }, { id: "goblin", w: 5 }, { id: "rogue", w: 2 }, { id: "jelly_yellow", w: 2 }];
  if (z <= 5) return [{ id: "goblin", w: 3 }, { id: "slime", w: 4 }, { id: "rogue", w: 3 }, { id: "jelly_yellow", w: 3 }, { id: "jelly_red", w: 2 }, { id: "giant_spider", w: 2 }];
  if (z <= 10) return [{ id: "slime", w: 3 }, { id: "rogue", w: 3 }, { id: "jelly_red", w: 5 }, { id: "giant_spider", w: 4 }, { id: "skeleton", w: 4 }, { id: "archer", w: 2 }];
  return [{ id: "rogue", w: 2 }, { id: "jelly_red", w: 6 }, { id: "giant_spider", w: 5 }, { id: "skeleton", w: 5 }, { id: "archer", w: 3 }];
}

function keyTypeForDepth(z, rng) {
  return "key_red";
}

function samplePassableCellsInChunk(grid, rng, count) {
  const passable = (t) => t === FLOOR || t === DOOR_OPEN || t === DOOR_CLOSED || t === STAIRS_DOWN || t === STAIRS_UP;
  const cells = [];
  for (let y = 2; y < CHUNK - 2; y++)
    for (let x = 2; x < CHUNK - 2; x++)
      if (passable(grid[y][x])) cells.push({ x, y });
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return cells.slice(0, Math.min(count, cells.length));
}

function chunkBaseSpawns(worldSeed, chunk) {
  const { z, cx, cy, grid, specials } = chunk;
  if (z === SURFACE_LEVEL || chunk.surface) return { monsters: [], items: [] };
  const rng = makeRng(`${worldSeed}|spawns|z${z}|${cx},${cy}`);
  const isOpenCell = (x, y) => {
    const t = grid[y]?.[x];
    return t === FLOOR || t === DOOR_OPEN || t === STAIRS_DOWN || t === STAIRS_UP;
  };
  const occupiedItemCells = new Set();
  const cellKey = (x, y) => `${x},${y}`;

  const depthBoost = clamp(z, 0, 60);

  const monsterCount = clamp(
    randInt(rng, 2, 5) + (rng() < depthBoost / 50 ? 1 : 0) + (rng() < 0.38 ? 1 : 0),
    0,
    10
  );

  // Higher baseline item density for a richer dungeon.
  const itemCount = clamp(randInt(rng, 2, 6) + (rng() < 0.30 ? 1 : 0), 0, 9);

  const cells = samplePassableCellsInChunk(grid, rng, monsterCount + itemCount + 18);
  const monsters = [];
  const mTable = monsterTableForDepth(z);

  for (let i = 0; i < monsterCount; i++) {
    const c = cells[i];
    if (!c) break;
    const type = weightedChoice(rng, mTable);
    const id = `m|${z}|${cx},${cy}|${i}`;
    monsters.push({ id, type, lx: c.x, ly: c.y });
  }

  const items = [];
  const pushItem = (item) => {
    items.push(item);
    occupiedItemCells.add(cellKey(item.lx, item.ly));
  };
  const findOpenCellNear = (ox, oy, maxR) => {
    for (let attempt = 0; attempt < 36; attempt++) {
      const dx = randInt(rng, -maxR, maxR);
      const dy = randInt(rng, -maxR, maxR);
      const x = clamp(ox + dx, 1, CHUNK - 2);
      const y = clamp(oy + dy, 1, CHUNK - 2);
      if (x === ox && y === oy) continue;
      if (!isOpenCell(x, y)) continue;
      if (occupiedItemCells.has(cellKey(x, y))) continue;
      return { x, y };
    }
    for (let y = Math.max(1, oy - maxR); y <= Math.min(CHUNK - 2, oy + maxR); y++) {
      for (let x = Math.max(1, ox - maxR); x <= Math.min(CHUNK - 2, ox + maxR); x++) {
        if (x === ox && y === oy) continue;
        if (!isOpenCell(x, y)) continue;
        if (occupiedItemCells.has(cellKey(x, y))) continue;
        return { x, y };
      }
    }
    return null;
  };

  for (let i = 0; i < itemCount; i++) {
    const c = cells[monsterCount + i];
    if (!c) break;
    const roll = rng();
    // Potions are common; equipment appears regularly; keys are occasional.
    const equipmentType = rng() < 0.6 ? weaponForDepth(z, rng) : armorForDepth(z, rng);
    const type = roll < 0.45 ? "potion" : roll < 0.66 ? "gold" : roll < 0.94 ? equipmentType : keyTypeForDepth(z, rng);
    const id = `i|${z}|${cx},${cy}|${i}`;
    const amount = type === "gold" ? randInt(rng, 4, 22) + clamp(z, 0, 30) : 1;
    // Small chance this item is actually a chest (locked or unlocked)
    if (rng() < 0.24) {
      const locked = rng() < 0.6;
      let keyType = null;
      if (locked) {
        // choose a key type for this locked chest
        keyType = keyTypeForDepth(z, rng);
        // Place chest key only on open, reachable tiles.
        const near = findOpenCellNear(c.x, c.y, CHUNK);
        if (near) {
          pushItem({ id: `key_near_inline|${z}|${cx},${cy}|${i}`, type: keyType, amount: 1, lx: near.x, ly: near.y });
        }
      }
      // push the chest as a chest entity but include locked/keyType metadata
      pushItem({ id: `chest_inline|${z}|${cx},${cy}|${i}`, type: "chest", amount: 1, lx: c.x, ly: c.y, locked: locked, keyType });
    } else {
      let lx = c.x;
      let ly = c.y;
      if (type.startsWith("key_") && !isOpenCell(lx, ly)) {
        const near = findOpenCellNear(c.x, c.y, CHUNK);
        if (!near) continue;
        lx = near.x;
        ly = near.y;
      }
      pushItem({ id, type, amount, lx, ly });
    }
  }

  // bump chance for extra chests (more frequent, scales with depth)
  if (rng() < clamp(0.50 + z * 0.02, 0.50, 0.78)) {
    const c = cells[monsterCount + itemCount] ?? cells[cells.length - 1];
    if (c) {
      pushItem({ id: `chest_extra|${z}|${cx},${cy}`, type: "chest", amount: 1, lx: c.x, ly: c.y });
    }
  }

  if (specials?.treasure) {
    pushItem({
      id: `chest|${z}|${cx},${cy}`,
      type: "chest",
      amount: 1,
      lx: specials.treasure.lx,
      ly: specials.treasure.ly,
    });
  }
  if (specials?.shrine) {
    pushItem({
      id: `shrine|${z}|${cx},${cy}`,
      type: "shrine",
      amount: 1,
      lx: specials.shrine.lx,
      ly: specials.shrine.ly,
    });
  }

  return { monsters, items };
}

// ---------- Game state ----------
function randomSeedString() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  const r = makeRng(`seedmaker|${Date.now()}|${Math.random()}`);
  for (let i = 0; i < 8; i++) s += alphabet[Math.floor(r() * alphabet.length)];
  return s;
}

function pushLog(state, msg) {
  state.log.push(msg);
  if (state.log.length > 160) state.log.shift();
  renderLog(state);
}
function renderLog(state) {
  const last = state.log.slice(-55);
  logEl.textContent = last.join("\n");
  logEl.scrollTop = logEl.scrollHeight;
}

function updateDeathOverlay(state) {
  if (!deathOverlayEl) return;
  const show = !!state?.player?.dead;
  deathOverlayEl.classList.toggle("show", show);
  deathOverlayEl.setAttribute("aria-hidden", show ? "false" : "true");
}

function resolveContextAction(state, occupancy = null) {
  const p = state.player;
  if (p.dead) return null;

  const here = state.world.getTile(p.x, p.y, p.z);
  if (here === STAIRS_DOWN) return { type: "stairs-down", label: "Descend Stairs", run: () => tryUseStairs(state, "down") };
  if (here === STAIRS_UP) return { type: "stairs-up", label: "Ascend Stairs", run: () => tryUseStairs(state, "up") };

  const occ = occupancy ?? buildOccupancy(state);
  const attackTarget = getAdjacentMonsterTarget(state, occ);
  if (attackTarget) {
    const nm = MONSTER_TYPES[attackTarget.type]?.name ?? attackTarget.type;
    return { type: "attack", targetMonsterId: attackTarget.id, label: `Attack ${nm}`, run: () => attackMonsterById(state, attackTarget.id) };
  }
  const itemsHere = getItemsAt(state, p.x, p.y, p.z);
  if (itemsHere.length) {
    const shop = itemsHere.find((e) => e.type === "shopkeeper");
    if (shop) return { type: "shop", label: "Open Shop", run: () => interactShopkeeper(state) };

    const takeable = itemsHere.filter((e) => isDirectlyTakeableItem(e.type));
    if (takeable.length) {
      const target = takeable[0];
      const nm = titleCaseLowerLabel(ITEM_TYPES[target.type]?.name ?? target.type);
      const more = takeable.length > 1 ? ` (+${takeable.length - 1} more)` : "";
      return { type: "pickup", label: `Take ${nm}${more}`, run: () => pickup(state) };
    }

    const shrine = itemsHere.find((e) => e.type === "shrine");
    if (shrine) return { type: "shrine", label: "Pray at Shrine", run: () => interactShrine(state) };
  }

  const dirs = [[0,-1],[1,0],[0,1],[-1,0]];
  for (const [dx, dy] of dirs) {
    const x = p.x + dx, y = p.y + dy;
    const t = state.world.getTile(x, y, p.z);
    if (t !== DOOR_OPEN) continue;
    const blocked = occ.monsters.get(keyXYZ(x, y, p.z)) || occ.items.get(keyXYZ(x, y, p.z));
    if (blocked) continue;
    return { type: "close-door", label: "Close Door", run: () => tryCloseAdjacentDoor(state) };
  }
  for (const [dx, dy] of dirs) {
    const x = p.x + dx, y = p.y + dy;
    const t = state.world.getTile(x, y, p.z);
    if (t === DOOR_CLOSED) return { type: "open-door", label: "Open Door", run: () => tryOpenAdjacentDoor(state) };
  }
  return null;
}

function getAdjacentMonsterTarget(state, occupancy = null) {
  const list = getAdjacentMonsters(state, occupancy);
  return list.length ? list[0].monster : null;
}

function getAdjacentMonsters(state, occupancy = null) {
  const p = state.player;
  const occ = occupancy ?? buildOccupancy(state);
  const dirs = [
    { dx: 0, dy: -1, dir: "N" },
    { dx: 1, dy: 0, dir: "E" },
    { dx: 0, dy: 1, dir: "S" },
    { dx: -1, dy: 0, dir: "W" },
  ];
  const out = [];
  for (const d of dirs) {
    const x = p.x + d.dx;
    const y = p.y + d.dy;
    const id = occ.monsters.get(keyXYZ(x, y, p.z));
    if (!id) continue;
    const m = state.entities.get(id);
    if (!m || m.kind !== "monster") continue;
    out.push({ monster: m, dir: d.dir });
  }
  return out;
}

function attackAdjacentMonster(state, occupancy = null) {
  const m = getAdjacentMonsterTarget(state, occupancy);
  if (!m) {
    pushLog(state, "No adjacent monster to attack.");
    return false;
  }
  playerAttack(state, m);
  return true;
}

function attackMonsterById(state, monsterId) {
  const m = state.entities.get(monsterId);
  if (!m || m.kind !== "monster" || m.z !== state.player.z) {
    pushLog(state, "That enemy is no longer in range.");
    return false;
  }
  const dist = Math.abs(m.x - state.player.x) + Math.abs(m.y - state.player.y);
  if (dist !== 1) {
    pushLog(state, "That enemy is no longer adjacent.");
    return false;
  }
  playerAttack(state, m);
  return true;
}

function updateContextActionButton(state, occupancy = null) {
  if (!contextActionBtn) return;
  const action = resolveContextAction(state, occupancy);
  if (!action) {
    contextActionBtn.disabled = true;
    contextActionBtn.textContent = "No Action";
    contextActionBtn.dataset.actionType = "none";
    updatePotionContextButton(state);
    updateAttackContextButtons(state, occupancy, null);
    return;
  }
  contextActionBtn.disabled = false;
  contextActionBtn.textContent = action.label;
  contextActionBtn.dataset.actionType = action.type;

  updatePotionContextButton(state);
  updateAttackContextButtons(state, occupancy, action);
}

function findPotionInventoryIndex(state) {
  return state.inv.findIndex((x) => x.type === "potion" && (x.amount ?? 0) > 0);
}

function shouldShowPotionContext(state) {
  const p = state.player;
  if (p.dead) return false;
  const maxHp = Math.max(1, p.maxHp || 1);
  if (p.hp > Math.floor(maxHp * 0.15)) return false;
  return findPotionInventoryIndex(state) >= 0;
}

function usePotionFromContext(state) {
  const idx = findPotionInventoryIndex(state);
  if (idx < 0) {
    pushLog(state, "No potion available.");
    return false;
  }
  useInventoryIndex(state, idx);
  return false;
}

function updatePotionContextButton(state) {
  if (!contextPotionBtn) return;
  if (!shouldShowPotionContext(state)) {
    contextPotionBtn.style.display = "none";
    contextPotionBtn.disabled = true;
    return;
  }
  contextPotionBtn.style.display = "";
  contextPotionBtn.disabled = false;
}

function buildAuxContextActions(state, occupancy = null, primaryAction = null) {
  const p = state.player;
  const occ = occupancy ?? buildOccupancy(state);
  const actions = [];

  const here = state.world.getTile(p.x, p.y, p.z);
  if (here === STAIRS_DOWN && primaryAction?.type !== "stairs-down") {
    actions.push({
      id: "aux|stairs-down",
      label: "Descend Stairs",
      run: () => tryUseStairs(state, "down"),
    });
  }
  if (here === STAIRS_UP && primaryAction?.type !== "stairs-up") {
    actions.push({
      id: "aux|stairs-up",
      label: "Ascend Stairs",
      run: () => tryUseStairs(state, "up"),
    });
  }

  const adjacent = getAdjacentMonsters(state, occ);
  for (const entry of adjacent) {
    const id = entry.monster.id;
    if (primaryAction?.type === "attack" && primaryAction?.targetMonsterId === id) continue;
    const nm = MONSTER_TYPES[entry.monster.type]?.name ?? entry.monster.type;
    actions.push({
      id: `aux|attack|${id}`,
      label: `Attack ${nm} (${entry.dir})`,
      run: () => attackMonsterById(state, id),
    });
  }

  const itemsHere = getItemsAt(state, p.x, p.y, p.z);
  if (itemsHere.length) {
    const shop = itemsHere.find((e) => e.type === "shopkeeper");
    if (shop && primaryAction?.type !== "shop") {
      actions.push({
        id: "aux|shop",
        label: "Open Shop",
        run: () => interactShopkeeper(state),
      });
    }

    const takeable = itemsHere.filter((e) => isDirectlyTakeableItem(e.type));
    if (takeable.length && primaryAction?.type !== "pickup") {
      const target = takeable[0];
      const nm = titleCaseLowerLabel(ITEM_TYPES[target.type]?.name ?? target.type);
      const more = takeable.length > 1 ? ` (+${takeable.length - 1} more)` : "";
      actions.push({
        id: `aux|pickup|${target.type}|${takeable.length}`,
        label: `Take ${nm}${more}`,
        run: () => pickup(state),
      });
    }

    const shrine = itemsHere.find((e) => e.type === "shrine");
    if (shrine && primaryAction?.type !== "shrine") {
      actions.push({
        id: "aux|shrine",
        label: "Pray at Shrine",
        run: () => interactShrine(state),
      });
    }
  }

  return actions;
}

function updateAttackContextButtons(state, occupancy = null, primaryAction = null) {
  if (!contextAttackListEl) return;
  const actions = buildAuxContextActions(state, occupancy, primaryAction);
  const signature = actions.map((a) => `${a.id}|${a.label}`).join("||");
  if (signature === contextAuxSignature) return;
  contextAuxSignature = signature;

  if (!actions.length) {
    contextAttackListEl.style.display = "none";
    contextAttackListEl.classList.remove("grid");
    contextAttackListEl.innerHTML = "";
    return;
  }

  contextAttackListEl.innerHTML = "";
  contextAttackListEl.classList.toggle("grid", actions.length > 2);
  contextAttackListEl.style.display = actions.length > 2 ? "grid" : "flex";
  for (const action of actions) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "contextAttackBtn";
    btn.textContent = action.label;
    btn.addEventListener("click", () => {
      takeTurn(state, action.run());
    });
    contextAttackListEl.appendChild(btn);
  }
}

function isStackable(type) {
  return type === "potion" ||
    type === "key_red" || type === "key_blue" || type === "key_green" ||
    type.startsWith("weapon_") || type.startsWith("armor_");
}
function invAdd(state, type, amount = 1) {
  if (isStackable(type)) {
    const idx = state.inv.findIndex((x) => x.type === type);
    if (idx >= 0) state.inv[idx].amount += amount;
    else state.inv.push({ type, amount });
  } else {
    for (let i = 0; i < amount; i++) state.inv.push({ type, amount: 1 });
  }
}
function invConsume(state, type, amount = 1) {
  const idx = state.inv.findIndex((x) => x.type === type);
  if (idx < 0) return false;
  const it = state.inv[idx];
  if (it.amount < amount) return false;
  it.amount -= amount;
  if (it.amount <= 0) state.inv.splice(idx, 1);
  return true;
}
function invCount(state, type) {
  return state.inv.find((x) => x.type === type)?.amount ?? 0;
}

function xpToNext(level) {
  return (8 + level * 6) * XP_SCALE;
}

function xpFromDamage(dmg) {
  // Normalize combat-scaled damage back to legacy-sized units, then award a modest amount per point.
  return Math.max(0, Math.floor((dmg / COMBAT_SCALE) * XP_DAMAGE_PER_LEGACY_DAMAGE));
}

function xpKillBonus(monsterType) {
  const base = MONSTER_TYPES[monsterType]?.xp ?? 2;
  return base * XP_KILL_BONUS_PER_MONSTER_XP;
}

function xpExplorationBonus(roomCount, corridorCount) {
  return Math.max(0, roomCount * 25 + corridorCount * 15);
}

function recalcDerivedStats(state) {
  const p = state.player;
  const equip = p.equip ?? {};
  const weapon = p.equip.weapon ? WEAPONS[p.equip.weapon] : null;
  const chestArmor = equip.chest ? ARMOR_PIECES[equip.chest] : null;
  const legsArmor = equip.legs ? ARMOR_PIECES[equip.legs] : null;

  const effAtk = state.player.effects
    .filter(e => e.type === "bless" || e.type === "curse")
    .reduce((s, e) => s + e.atkDelta, 0);

  p.atkBonus = (weapon?.atkBonus ?? 0) + effAtk;
  p.defBonus = (chestArmor?.defBonus ?? 0) + (legsArmor?.defBonus ?? 0);

  p.atkLo = 200 + Math.floor((p.level - 1) / 2) * 100;
  p.atkHi = 500 + Math.floor((p.level - 1) / 2) * 100;
}

function renderEquipment(state) {
  const p = state.player;
  const equip = p.equip ?? {};
  const w = equip.weapon ? (ITEM_TYPES[equip.weapon]?.name ?? equip.weapon) : "(none)";
  const chest = equip.chest ? (ITEM_TYPES[equip.chest]?.name ?? equip.chest) : "(none)";
  const legs = equip.legs ? (ITEM_TYPES[equip.legs]?.name ?? equip.legs) : "(none)";
  equipTextEl.textContent =
    `Weapon: ${w}\nChest:  ${chest}\nLegs:   ${legs}\nATK bonus: ${p.atkBonus >= 0 ? "+" : ""}${p.atkBonus}  DEF: +${p.defBonus}`;
}

function renderEffects(state) {
  const eff = state.player.effects;
  if (!eff.length) {
    effectsTextEl.textContent = "(none)";
    return;
  }
  effectsTextEl.textContent = eff
    .map(e => {
      if (e.type === "regen") return `Regen (+${e.healPerTurn}/turn) \u2014 ${e.turnsLeft} turns`;
      if (e.type === "bless") return `Blessing (ATK +${e.atkDelta}) \u2014 ${e.turnsLeft} turns`;
      if (e.type === "curse") return `Curse (ATK ${e.atkDelta}) \u2014 ${e.turnsLeft} turns`;
      if (e.type === "reveal") return `Revelation \u2014 ${e.turnsLeft} turns`;
      return `${e.type} \u2014 ${e.turnsLeft} turns`;
    })
    .join("\n");
}

function renderInventory(state) {
  invListEl.innerHTML = "";
  if (state.inv.length === 0) {
    const div = document.createElement("div");
    div.className = "muted";
    div.textContent = "(empty)";
    invListEl.appendChild(div);
    return;
  }
  getInventoryDisplayEntries(state).slice(0, 9).forEach((entry, idx) => {
    const it = entry.item;
    const invIdx = entry.invIndex;
    const nm = ITEM_TYPES[it.type]?.name ?? it.type;
    const btn = document.createElement("button");
    btn.className = 'invLabelBtn';
    btn.type = 'button';

    const row = document.createElement("span");
    row.className = "invRow";

    const iconWrap = document.createElement("span");
    iconWrap.className = "invIconWrap";
    const icon = inventoryIconNode(it.type);
    if (icon) iconWrap.appendChild(icon);

    const label = document.createElement("span");
    label.className = "invLabelText";
    label.textContent = `${idx + 1}. ${nm}${isStackable(it.type) ? ` x${it.amount}` : ""}`;

    row.appendChild(iconWrap);
    row.appendChild(label);
    btn.appendChild(row);

    const invoke = () => useInventoryIndex(state, invIdx);
    const clickHandler = (e) => { e.stopPropagation(); invoke(); };
    btn.addEventListener('click', clickHandler);
    btn.addEventListener('touchstart', (e) => { e.stopPropagation(); e.preventDefault(); invoke(); }, { passive: false });
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      takeTurn(state, dropInventoryIndex(state, invIdx));
    });

    invListEl.appendChild(btn);
  });
}

function getInventoryDisplayEntries(state) {
  const entries = state.inv.map((item, invIndex) => ({
    item,
    invIndex,
    priority: item.type === "potion" ? 0 : 1,
  }));
  entries.sort((a, b) => (a.priority - b.priority) || (a.invIndex - b.invIndex));
  return entries;
}

function inventoryIconNode(type) {
  const spriteId = itemSpriteId({ type });
  if (spriteId && SPRITE_SOURCES[spriteId]) {
    const img = document.createElement("img");
    img.src = SPRITE_SOURCES[spriteId];
    img.alt = "";
    return img;
  }
  const glyphInfo = itemGlyph(type);
  const glyph = document.createElement("span");
  glyph.className = "invIconGlyph";
  glyph.textContent = glyphInfo?.g ?? "?";
  glyph.style.color = glyphInfo?.c ?? "#e6e6e6";
  return glyph;
}

function resolveSurfaceLink(state) {
  const cand = state.surfaceLink;
  if (cand && Number.isFinite(cand.x) && Number.isFinite(cand.y) && Number.isFinite(cand.z)) {
    return { x: Math.floor(cand.x), y: Math.floor(cand.y), z: Math.floor(cand.z) };
  }

  // Backward-compat fallback for saves without surfaceLink: prefer stairs-up near start area.
  const z = 0;
  const targetX = Math.floor(CHUNK / 2);
  const targetY = Math.floor(CHUNK / 2);
  let best = null, bestD = Infinity;
  for (let y = 0; y < CHUNK; y++) {
    for (let x = 0; x < CHUNK; x++) {
      const t = state.world.getTile(x, y, z);
      if (t !== STAIRS_UP) continue;
      const dx = x - targetX, dy = y - targetY;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = { x, y, z }; }
    }
  }
  return best ?? { x: targetX, y: targetY, z };
}

function ensureSurfaceLinkTile(state) {
  const link = resolveSurfaceLink(state);
  state.surfaceLink = link;
  state.world.setTile(link.x, link.y, link.z, STAIRS_UP);
  return link;
}

function placeInitialSurfaceStairs(state) {
  const p = state.player;
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];

  for (const [dx, dy] of dirs) {
    const x = p.x + dx, y = p.y + dy, z = p.z;
    const t = state.world.getTile(x, y, z);
    if (t === FLOOR || t === DOOR_OPEN) {
      state.world.setTile(x, y, z, STAIRS_UP);
      state.surfaceLink = { x, y, z };
      return;
    }
  }

  const fx = p.x + 1, fy = p.y;
  state.world.setTile(fx, fy, p.z, FLOOR);
  state.world.setTile(fx, fy, p.z, STAIRS_UP);
  state.surfaceLink = { x: fx, y: fy, z: p.z };
}

function computeInitialDepth0Spawn(world) {
  world.ensureChunksAround(0, 0, 0, VIEW_RADIUS + 2);
  const ch = world.getChunk(0, 0, 0);
  const target = { x: Math.floor(CHUNK / 2), y: Math.floor(CHUNK / 2) };
  let best = null, bestD = Infinity;
  for (let y = 1; y < CHUNK - 1; y++) for (let x = 1; x < CHUNK - 1; x++) {
    const t = ch.grid[y][x];
    if (t === WALL) continue;
    const dx = x - target.x, dy = y - target.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = { x, y, z: 0 }; }
  }
  return best ?? { x: target.x, y: target.y, z: 0 };
}

function respawnAtStart(state) {
  const p = state.player;
  const sp = state.startSpawn ?? computeInitialDepth0Spawn(state.world);
  state.startSpawn = sp;

  p.dead = false;
  p.hp = p.maxHp;
  p.effects = [];
  p.x = sp.x; p.y = sp.y; p.z = sp.z;

  if (!state.world.isPassable(p.x, p.y, p.z)) state.world.setTile(p.x, p.y, p.z, FLOOR);
  ensureSurfaceLinkTile(state);
  ensureShopState(state);
  hydrateNearby(state);
  pushLog(state, "You awaken at the dungeon entrance.");
  renderInventory(state);
  renderEquipment(state);
  renderEffects(state);
  updateContextActionButton(state);
  updateDeathOverlay(state);
  saveNow(state);
}

function confirmNewDungeonFromDeath() {
  return confirm(
    "Start a NEW DUNGEON?\n\n" +
    "This will reset all current run progress (position, depth, discovered areas, inventory, and progress).\n\n" +
    "Start new dungeon now?"
  );
}

function makeNewGame(seedStr = randomSeedString()) {
  const world = new World(seedStr);

  const player = {
    x: 0, y: 0, z: 0,
    dead: false,
    level: 1,
    xp: 0,
    hp: 1800, maxHp: 1800,
    atkLo: 200, atkHi: 500,
    atkBonus: 0,
    defBonus: 0,
    gold: 0,
    equip: { weapon: null, chest: null, legs: null },
    effects: [],
  };

  const state = {
    world,
    player,
    seen: new Set(),
    visible: new Set(),
    log: [],
    entities: new Map(),
    removedIds: new Set(),
    entityOverrides: new Map(),
    inv: [],
    dynamic: new Map(),
    turn: 0,
    visitedDoors: new Set(),
    exploredChunks: new Set(),
    surfaceLink: null,
    startSpawn: null,
    shop: null,
  };
  const start = computeInitialDepth0Spawn(world);
  state.startSpawn = start;
  player.x = start.x;
  player.y = start.y;
  player.z = start.z;
  placeInitialSurfaceStairs(state);
  ensureSurfaceLinkTile(state);
  ensureShopState(state);

  recalcDerivedStats(state);
  pushLog(state, "You enter the dungeon...");
  hydrateNearby(state);
  maybeGrantExplorationXP(state);
  renderInventory(state);
  renderEquipment(state);
  renderEffects(state);
  return state;
}

// ---------- Hydration ----------
function hydrateChunkEntities(state, z, cx, cy) {
  const chunk = state.world.getChunk(z, cx, cy);
  const base = chunkBaseSpawns(state.world.seedStr, chunk);

  for (const m of base.monsters) {
    if (state.removedIds.has(m.id)) continue;
    if (state.entities.has(m.id)) continue;

    const wx = cx * CHUNK + m.lx;
    const wy = cy * CHUNK + m.ly;

    const ov = state.entityOverrides.get(m.id);
    const mx = ov?.x ?? wx;
    const my = ov?.y ?? wy;
    const mz = ov?.z ?? z;

    const spec = monsterStatsForDepth(m.type, z);
    const hp = ov?.hp ?? spec.maxHp;
    const cd = ov?.cd ?? 0;

    state.entities.set(m.id, {
      id: m.id,
      origin: "base",
      kind: "monster",
      type: m.type,
      x: mx, y: my, z: mz,
      hp, maxHp: spec.maxHp,
      awake: false,
      cd,
    });
  }

  for (const it of base.items) {
    if (state.removedIds.has(it.id)) continue;
    if (state.entities.has(it.id)) continue;

    const wx = cx * CHUNK + it.lx;
    const wy = cy * CHUNK + it.ly;

    state.entities.set(it.id, {
      id: it.id,
      origin: "base",
      kind: "item",
      type: it.type,
      amount: it.amount ?? 1,
      x: wx, y: wy, z,
      locked: it.locked,
      keyType: it.keyType,
    });
  }

  if (z === SURFACE_LEVEL && cx === 0 && cy === 0) {
    const id = "shopkeeper|surface|0,0";
    if (!state.removedIds.has(id) && !state.entities.has(id)) {
      state.world.setTile(1, 0, z, FLOOR);
      state.entities.set(id, {
        id,
        origin: "base",
        kind: "item",
        type: "shopkeeper",
        amount: 1,
        x: 1, y: 0, z,
      });
    }
  }
}

function hydrateNearby(state) {
  const p = state.player;
  state.world.ensureChunksAround(p.x, p.y, p.z, VIEW_RADIUS + 2);

  for (const e of state.dynamic.values()) state.entities.set(e.id, e);

  const { cx: pcx, cy: pcy } = splitWorldToChunk(p.x, p.y);
  for (let cy = pcy - 1; cy <= pcy + 1; cy++)
    for (let cx = pcx - 1; cx <= pcx + 1; cx++)
      hydrateChunkEntities(state, p.z, cx, cy);
}

// ---------- Occupancy ----------
function buildOccupancy(state) {
  const monsters = new Map();
  const items = new Map();
  const pz = state.player.z;
  for (const e of state.entities.values()) {
    if (e.z !== pz) continue;
    const k = keyXYZ(e.x, e.y, e.z);
    if (e.kind === "monster") monsters.set(k, e.id);
    else if (e.kind === "item") items.set(k, e.id);
  }
  return { monsters, items };
}

function getItemsAt(state, x, y, z) {
  const items = [];
  for (const e of state.entities.values()) {
    if (e.kind !== "item") continue;
    if (e.x !== x || e.y !== y || e.z !== z) continue;
    items.push(e);
  }
  return items;
}

function findItemAtByType(state, x, y, z, type) {
  for (const e of state.entities.values()) {
    if (e.kind !== "item") continue;
    if (e.type !== type) continue;
    if (e.x === x && e.y === y && e.z === z) return e;
  }
  return null;
}

function isDirectlyTakeableItem(type) {
  return type !== "shrine" && type !== "shopkeeper";
}

function titleCaseLowerLabel(name) {
  const s = String(name ?? "").trim();
  if (!s) return "item";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// ---------- Visibility ----------
function computeVisibility(state) {
  const { world, player, seen, visible } = state;
  visible.clear();

  world.ensureChunksAround(player.x, player.y, player.z, VIEW_RADIUS + 2);

  for (let dy = -VIEW_RADIUS; dy <= VIEW_RADIUS; dy++) {
    for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
      const wx = player.x + dx;
      const wy = player.y + dy;
      const dist2 = dx * dx + dy * dy;
      if (dist2 > VIEW_RADIUS * VIEW_RADIUS) continue;

      if (!fogEnabled) {
        visible.add(keyXY(wx, wy));
        seen.add(keyXYZ(wx, wy, player.z));
        continue;
      }

      if (hasLineOfSight(world, player.z, player.x, player.y, wx, wy)) {
        visible.add(keyXY(wx, wy));
        seen.add(keyXYZ(wx, wy, player.z));
      }
    }
  }
}

// ---------- Minimap ----------
function tileToMiniColor(theme, t, visible) {
  const v = visible;
  if (t === WALL) return v ? theme.wallV : theme.wallNV;
  if (t === FLOOR) return v ? theme.floorV : theme.floorNV;
  if (t === DOOR_CLOSED) return v ? theme.doorC_V : theme.doorC_NV;
  if (t === DOOR_OPEN) return v ? theme.doorO_V : theme.doorO_NV;
  if (t === LOCK_RED) return v ? theme.lockR_V : theme.lockR_NV;
  if (t === LOCK_BLUE) return v ? theme.lockB_V : theme.lockB_NV;
  if (t === LOCK_GREEN) return v ? theme.lockG_V : theme.lockG_NV;
  if (t === STAIRS_DOWN) return v ? theme.downV : theme.downNV;
  if (t === STAIRS_UP) return v ? theme.upV : theme.upNV;
  return null;
}

function drawMinimap(state) {
  if (!minimapEnabled) {
    mctx.clearRect(0, 0, mini.width, mini.height);
    return;
  }

  const p = state.player;
  const theme = themeForDepth(p.z);
  mctx.fillStyle = "#05070c";
  mctx.fillRect(0, 0, mini.width, mini.height);

  const size = MINI_RADIUS * 2 + 1;
  for (let my = 0; my < size; my++) {
    for (let mx = 0; mx < size; mx++) {
      const wx = p.x + (mx - MINI_RADIUS);
      const wy = p.y + (my - MINI_RADIUS);
      const seenKey = keyXYZ(wx, wy, p.z);
      if (!state.seen.has(seenKey)) continue;

      const isVis = state.visible.has(keyXY(wx, wy));
      const t = state.world.getTile(wx, wy, p.z);
      const c = tileToMiniColor(theme, t, isVis);
      if (!c) continue;

      mctx.fillStyle = c;
      mctx.fillRect(mx * MINI_SCALE, my * MINI_SCALE, MINI_SCALE, MINI_SCALE);

      if (wx % CHUNK === 0 || wy % CHUNK === 0) {
        mctx.fillStyle = "#0f1420";
        mctx.fillRect(mx * MINI_SCALE, my * MINI_SCALE, MINI_SCALE, 1);
      }
    }
  }

  const { monsters, items } = buildOccupancy(state);
  for (let my = 0; my < size; my++) {
    for (let mx = 0; mx < size; mx++) {
      const wx = p.x + (mx - MINI_RADIUS);
      const wy = p.y + (my - MINI_RADIUS);
      if (!state.seen.has(keyXYZ(wx, wy, p.z))) continue;

      const ik = items.get(keyXYZ(wx, wy, p.z));
      if (ik) {
        const ent = state.entities.get(ik);
        mctx.fillStyle =
          ent?.type === "shrine" ? "#b8f2e6" :
          ent?.type === "chest" ? "#d9b97a" :
          "#f4d35e";
        mctx.fillRect(mx * MINI_SCALE, my * MINI_SCALE, MINI_SCALE, MINI_SCALE);
      }

      const mk = monsters.get(keyXYZ(wx, wy, p.z));
      if (mk) {
        mctx.fillStyle = "#ff6b6b";
        mctx.fillRect(mx * MINI_SCALE, my * MINI_SCALE, MINI_SCALE, MINI_SCALE);
      }
    }
  }

  mctx.fillStyle = "#7ce3ff";
  mctx.fillRect(MINI_RADIUS * MINI_SCALE, MINI_RADIUS * MINI_SCALE, MINI_SCALE, MINI_SCALE);
}

// ---------- Effects tick ----------
function applyEffectsTick(state) {
  const p = state.player;
  if (!p.effects.length) return;

  for (const e of p.effects) {
    if (e.type === "regen") {
      if (p.hp > 0) p.hp = clamp(p.hp + e.healPerTurn, 0, p.maxHp);
    }
    e.turnsLeft -= 1;
  }
  p.effects = p.effects.filter(e => e.turnsLeft > 0);

  recalcDerivedStats(state);
  renderEquipment(state);
  renderEffects(state);
}

function applyReveal(state, radius = 28) {
  const p = state.player;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const wx = p.x + dx, wy = p.y + dy;
      state.seen.add(keyXYZ(wx, wy, p.z));
    }
  }
}

// ---------- Leveling ----------
function grantXP(state, amount) {
  const p = state.player;
  if (!Number.isFinite(amount) || amount <= 0) return;
  p.xp += amount;
  pushLog(state, `+${amount} XP`);

  while (p.xp >= xpToNext(p.level)) {
    p.xp -= xpToNext(p.level);
    p.level += 1;
    const hpGain = (3 + Math.floor(p.level / 3)) * COMBAT_SCALE;
    p.maxHp += hpGain;
    p.hp = clamp(p.hp + hpGain, 0, p.maxHp);
    pushLog(state, `*** Level up! You are now level ${p.level}. (+${hpGain} max HP)`);
  }

  recalcDerivedStats(state);
  renderEquipment(state);
}

function maybeGrantExplorationXP(state) {
  const p = state.player;
  const { cx, cy } = splitWorldToChunk(p.x, p.y);
  const key = keyZCXCY(p.z, cx, cy);
  if (state.exploredChunks?.has(key)) return;

  state.exploredChunks?.add(key);

  const chunk = state.world.getChunk(p.z, cx, cy);
  const rooms = Math.max(0, chunk.explore?.rooms ?? 0);
  const corridors = Math.max(0, chunk.explore?.corridors ?? 0);
  const xp = xpExplorationBonus(rooms, corridors);
  if (xp <= 0) return;

  grantXP(state, xp);
  pushLog(
    state,
    `Exploration: +${xp} XP (${rooms} room${rooms === 1 ? "" : "s"}, ${corridors} corridor${corridors === 1 ? "" : "s"}).`
  );
}

// ---------- Damage helpers ----------
function playerAttackDamage(state) {
  const p = state.player;
  const lo = Math.max(1, p.atkLo + p.atkBonus);
  const hi = Math.max(lo, p.atkHi + p.atkBonus);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}
function reduceIncomingDamage(state, dmg) {
  const def = state.player.defBonus;
  if (def <= 0) return dmg;
  const blocked = Math.min(dmg, Math.floor(Math.random() * (def + 1)));
  return Math.max(0, dmg - blocked);
}
function killPlayer(state) {
  state.player.hp = 0;
  state.player.dead = true;
  pushLog(state, "YOU DIED.");
}

// ---------- Doors ----------
function tileIsLocked(t) {
  return t === LOCK_RED || t === LOCK_BLUE || t === LOCK_GREEN || t === "*";
}
function lockToKeyType(t) {
  if (t === "*" || t === LOCK_RED) return "key_red";
  if (t === LOCK_BLUE) return "key_blue";
  return "key_green";
}

function tryUnlockDoor(state, x, y, z) {
  const t = state.world.getTile(x, y, z);
  if (!tileIsLocked(t)) return false;

  const keyType = lockToKeyType(t);
  if (!invConsume(state, keyType, 1)) {
    pushLog(state, `Locked door. Need a ${ITEM_TYPES[keyType].name}.`);
    renderInventory(state);
    return true;
  }

  state.world.setTile(x, y, z, DOOR_OPEN);
  pushLog(state, "You unlock and open the door.");
  renderInventory(state);
  return true;
}

function tryOpenClosedDoor(state, x, y, z) {
  const t = state.world.getTile(x, y, z);
  if (t !== DOOR_CLOSED) return false;
  state.world.setTile(x, y, z, DOOR_OPEN);
  pushLog(state, "You open the door.");
  state.visitedDoors?.add(keyXYZ(x, y, z));
  return true;
}

function tryCloseAdjacentDoor(state) {
  const p = state.player;
  const dirs = [[0,-1],[1,0],[0,1],[-1,0]];
  for (const [dx, dy] of dirs) {
    const x = p.x + dx, y = p.y + dy;
    const t = state.world.getTile(x, y, p.z);
    if (t !== DOOR_OPEN) continue;

    const { monsters, items } = buildOccupancy(state);
    const occ = monsters.get(keyXYZ(x, y, p.z)) || items.get(keyXYZ(x, y, p.z));
    if (occ) continue;

    state.world.setTile(x, y, p.z, DOOR_CLOSED);
    pushLog(state, "You close the door.");
    return true;
  }
  pushLog(state, "No open door adjacent to close.");
  return false;
}

// ---------- Dynamic drops ----------
function spawnDynamicItem(state, type, amount, x, y, z) {
  const id = `dyn|${type}|${z}|${x},${y}|${Date.now()}|${Math.floor(Math.random() * 1e9)}`;
  const ent = { id, origin: "dynamic", kind: "item", type, amount, x, y, z };
  state.dynamic.set(id, ent);
  state.entities.set(id, ent);
}

function dropEquipmentFromChest(state) {
  const z = state.player.z;
  const roll = Math.random();

  if (roll < 0.33) {
    const w = weaponForDepth(z, Math.random);
    invAdd(state, w, 1);
    pushLog(state, `Found a ${ITEM_TYPES[w].name}!`);
  } else if (roll < 0.60) {
    const a = armorForDepth(z);
    invAdd(state, a, 1);
    pushLog(state, `Found ${ITEM_TYPES[a].name}!`);
  } else if (roll < 0.80) {
    invAdd(state, "potion", 1);
    pushLog(state, "Found a Potion!");
  } else {
    const key = "key_red";
    // Only award a key if we can find/place a matching locked door nearby
    if (placeMatchingLockedDoorNearPlayer(state, key)) {
      invAdd(state, key, 1);
      pushLog(state, `Found a ${ITEM_TYPES[key].name}!`);
    }
  }
}

// ---------- Player actions ----------
function playerAttack(state, monster) {
  const hpBefore = monster.hp;
  const dmg = playerAttackDamage(state);
  monster.hp -= dmg;
  monster.awake = true;

  if (monster.origin === "base") {
    state.entityOverrides.set(monster.id, { x: monster.x, y: monster.y, z: monster.z, hp: monster.hp, cd: monster.cd ?? 0 });
  }

  pushLog(state, `You hit the ${MONSTER_TYPES[monster.type]?.name ?? monster.type} for ${dmg}.`);
  grantXP(state, xpFromDamage(Math.max(0, Math.min(dmg, hpBefore))));

  if (monster.hp <= 0) {
    pushLog(state, `The ${MONSTER_TYPES[monster.type]?.name ?? monster.type} dies.`);

    grantXP(state, xpKillBonus(monster.type));

    if (monster.origin === "base") {
      state.removedIds.add(monster.id);
      state.entityOverrides.delete(monster.id);
    }

    if (monster.type === "goblin" && Math.random() < 0.30) {
      const key = "key_red";
      if (placeMatchingLockedDoorNearPlayer(state, key)) {
        spawnDynamicItem(state, key, 1, monster.x, monster.y, monster.z);
        pushLog(state, "It dropped a Red Key!");
      }
    } else if (monster.type === "archer" && Math.random() < 0.25) {
      const key = "key_red";
      if (placeMatchingLockedDoorNearPlayer(state, key)) {
        spawnDynamicItem(state, key, 1, monster.x, monster.y, monster.z);
        pushLog(state, "It dropped a Red Key!");
      }
      placeMatchingLockedDoorNearPlayer(state, key);
    } else if (monster.type === "skeleton" && Math.random() < 0.20) {
      const drop = Math.random() < 0.5 ? weaponForDepth(state.player.z, Math.random) : armorForDepth(state.player.z);
      spawnDynamicItem(state, drop, 1, monster.x, monster.y, monster.z);
      pushLog(state, `It dropped ${ITEM_TYPES[drop].name}!`);
    } else if (Math.random() < 0.30) {
      const amt = 2 + Math.floor(Math.random() * (10 + clamp(state.player.z, 0, 20)));
      spawnDynamicItem(state, "gold", amt, monster.x, monster.y, monster.z);
    }

    state.entities.delete(monster.id);
  }
}

function playerMoveOrAttack(state, dx, dy) {
  const p = state.player;
  if (p.dead) return false;

  const nx = p.x + dx;
  const ny = p.y + dy;
  const nz = p.z;

  hydrateNearby(state);

  const tile = state.world.getTile(nx, ny, nz);

  if (tileIsLocked(tile)) {
    const handled = tryUnlockDoor(state, nx, ny, nz);
    if (!handled) return false;
    if (state.world.isPassable(nx, ny, nz)) { p.x = nx; p.y = ny; }
    return true;
  }

  if (tile === DOOR_CLOSED) {
    tryOpenClosedDoor(state, nx, ny, nz);
    return true;
  }

  const { monsters } = buildOccupancy(state);
  const mid = monsters.get(keyXYZ(nx, ny, nz));
  if (mid) {
    pushLog(state, "An enemy blocks the way. Use Attack context action.");
    return false;
  }

  if (!state.world.isPassable(nx, ny, nz)) {
    pushLog(state, "You bump into a wall.");
    return false;
  }

  const hereTile = state.world.getTile(nx, ny, nz);
  if (hereTile === DOOR_OPEN) state.visitedDoors?.add(keyXYZ(nx, ny, nz));

  p.x = nx; p.y = ny;
  return true;
}

function waitTurn(state) {
  if (state.player.dead) return false;
  pushLog(state, "You wait.");
  return true;
}

function pickup(state) {
  const p = state.player;
  if (p.dead) return false;

  const itemsHere = getItemsAt(state, p.x, p.y, p.z);
  if (!itemsHere.length) { pushLog(state, "Nothing here to pick up."); return false; }

  const it = itemsHere.find((e) => isDirectlyTakeableItem(e.type)) ?? itemsHere[0];
  if (!it) return false;

  if (it.type === "gold") {
    p.gold += it.amount ?? 1;
    pushLog(state, `Picked up ${it.amount} gold.`);
  } else if (it.type === "potion") {
    invAdd(state, "potion", it.amount ?? 1);
    pushLog(state, "Picked up a Potion.");
  } else if (it.type === "key_red" || it.type === "key_blue" || it.type === "key_green") {
    // Only add the key if a matching locked door exists or can be placed nearby.
    if (placeMatchingLockedDoorNearPlayer(state, it.type)) {
      invAdd(state, it.type, it.amount ?? 1);
      pushLog(state, `Picked up a ${ITEM_TYPES[it.type].name}.`);
    } else {
      pushLog(state, "This key doesn't seem to fit anything nearby.");
    }
  } else if (it.type.startsWith("weapon_") || it.type.startsWith("armor_")) {
    invAdd(state, it.type, 1);
    pushLog(state, `Picked up ${ITEM_TYPES[it.type].name}.`);
  } else if (it.type === "chest") {
    if (it.locked) {
      const keyType = it.keyType;
      if (!keyType || !invConsume(state, keyType, 1)) {
        pushLog(state, "The chest is locked. You need the correct key to open it.");
        return false;
      }
      pushLog(state, `You use the ${ITEM_TYPES[keyType].name} and open the Chest.`);
    }
    const g = 15 + Math.floor(Math.random() * (25 + clamp(p.z, 0, 25)));
    p.gold += g;
    pushLog(state, `You open the Chest. (+${g} gold)`);
    dropEquipmentFromChest(state);
  } else if (it.type === "shrine") {
    pushLog(state, "A Shrine hums with power. Press E to interact.");
    return false;
  } else if (it.type === "shopkeeper") {
    pushLog(state, "The shopkeeper greets you. Press E to trade.");
    return false;
  } else {
    pushLog(state, `Picked up ${it.type}.`);
    invAdd(state, it.type, it.amount ?? 1);
  }

  if (it.origin === "base") state.removedIds.add(it.id);
  else if (it.origin === "dynamic") state.dynamic.delete(it.id);

  state.entities.delete(it.id);

  recalcDerivedStats(state);
  renderInventory(state);
  renderEquipment(state);
  renderEffects(state);
  return true;
}

function useInventoryIndex(state, idx) {
  const p = state.player;
  if (p.dead) return;

  const it = state.inv[idx];
  if (!it) return;

  if (it.type === "potion") {
    const heal = (6 + Math.floor(Math.random() * 7)) * COMBAT_SCALE;
    const before = p.hp;
    p.hp = clamp(p.hp + heal, 0, p.maxHp);
    pushLog(state, `You drink a potion. (+${p.hp - before} HP)`);

    if (isStackable(it.type)) {
      it.amount -= 1;
      if (it.amount <= 0) state.inv.splice(idx, 1);
    } else {
      state.inv.splice(idx, 1);
    }

    renderInventory(state);
    return;
  }

  if (it.type.startsWith("key_")) {
    pushLog(state, "Keys are used automatically on matching locked doors.");
    return;
  }

  if (it.type.startsWith("weapon_")) {
    const prev = p.equip.weapon;
    p.equip.weapon = it.type;
    if (isStackable(it.type)) {
      it.amount -= 1;
      if (it.amount <= 0) state.inv.splice(idx, 1);
    } else {
      state.inv.splice(idx, 1);
    }
    if (prev) invAdd(state, prev, 1);
    pushLog(state, `Equipped ${ITEM_TYPES[p.equip.weapon].name}.`);
    recalcDerivedStats(state);
    renderInventory(state);
    renderEquipment(state);
    return;
  }

  if (it.type.startsWith("armor_")) {
    const piece = ARMOR_PIECES[it.type];
    if (!piece) {
      pushLog(state, "That armor can't be equipped.");
      return;
    }
    const slot = piece.slot;
    const prev = p.equip[slot] ?? null;
    p.equip[slot] = it.type;
    if (isStackable(it.type)) {
      it.amount -= 1;
      if (it.amount <= 0) state.inv.splice(idx, 1);
    } else {
      state.inv.splice(idx, 1);
    }
    if (prev) invAdd(state, prev, 1);
    pushLog(state, `Equipped ${ITEM_TYPES[p.equip[slot]].name}.`);
    recalcDerivedStats(state);
    renderInventory(state);
    renderEquipment(state);
    return;
  }

  pushLog(state, "You can't use that right now.");
}

function dropInventoryIndex(state, idx) {
  const p = state.player;
  if (p.dead) return false;

  const it = state.inv[idx];
  if (!it) {
    pushLog(state, "No item in that inventory slot.");
    return false;
  }

  const dropType = it.type;
  let dropAmount = 1;

  if (isStackable(dropType)) {
    it.amount -= 1;
    if (it.amount <= 0) state.inv.splice(idx, 1);
  } else {
    dropAmount = Math.max(1, it.amount ?? 1);
    state.inv.splice(idx, 1);
  }

  spawnDynamicItem(state, dropType, dropAmount, p.x, p.y, p.z);
  pushLog(state, `Dropped ${ITEM_TYPES[dropType]?.name ?? dropType}.`);
  renderInventory(state);
  return true;
}

function interactShopkeeper(state) {
  const p = state.player;
  if (p.dead) return null;

  const it = findItemAtByType(state, p.x, p.y, p.z, "shopkeeper");
  if (!it || it.type !== "shopkeeper") return null;

  const refreshed = refreshShopStock(state, false);
  if (refreshed) pushLog(state, "The shopkeeper restocked new wares.");
  openShopOverlay(state, "buy");
  return false;
}

// ---------- Shrine interaction ----------
function deterministicShrineEffect(seed, z, cx, cy) {
  const rng = makeRng(`${seed}|shrine|z${z}|${cx},${cy}`);
  const r = rng();
  if (r < 0.30) return { type: "heal" };
  if (r < 0.55) return { type: "bless" };
  if (r < 0.78) return { type: "regen" };
  return { type: "curse" };
}

function interactShrine(state) {
  const p = state.player;
  if (p.dead) return false;

  const it = findItemAtByType(state, p.x, p.y, p.z, "shrine");
  if (!it || it.type !== "shrine") { pushLog(state, "Nothing to interact with here."); return false; }

  const { cx, cy } = splitWorldToChunk(p.x, p.y);
  const eff = deterministicShrineEffect(state.world.seedStr, p.z, cx, cy);

  if (eff.type === "heal") {
    const before = p.hp;
    p.hp = p.maxHp;
    pushLog(state, `The Shrine heals you to full. (+${p.hp - before} HP)`);
    const curseIdx = p.effects.findIndex(e => e.type === "curse");
    if (curseIdx >= 0) { p.effects.splice(curseIdx, 1); pushLog(state, "A curse is lifted."); }
  } else if (eff.type === "bless") {
    p.effects.push({ type: "bless", atkDelta: +100, turnsLeft: 80 });
    pushLog(state, "Blessing: ATK +100 for 80 turns.");
  } else if (eff.type === "regen") {
    p.effects.push({ type: "regen", healPerTurn: 100, turnsLeft: 60 });
    pushLog(state, "Regen: +100 HP per turn for 60 turns.");
  } else if (eff.type === "curse") {
    p.effects.push({ type: "curse", atkDelta: -100, turnsLeft: 80 });
    pushLog(state, "Curse: ATK -100 for 80 turns.");
  }

  applyReveal(state, 22);
  pushLog(state, "The dungeon\u2019s outline flashes in your mind...");

  if (it.origin === "base") state.removedIds.add(it.id);
  else if (it.origin === "dynamic") state.dynamic.delete(it.id);
  state.entities.delete(it.id);

  recalcDerivedStats(state);
  renderEquipment(state);
  renderEffects(state);
  renderInventory(state);
  return true;
}

// ---------- Stairs + landing carve ----------
function carveLandingAndConnect(state, x, y, z, centerTile) {
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++)
      state.world.setTile(x + dx, y + dy, z, FLOOR);

  state.world.setTile(x, y, z, centerTile);

  const { cx, cy } = splitWorldToChunk(x, y);
  state.world.getChunk(z, cx, cy);

  let best = null, bestD = Infinity;
  for (let ly = 1; ly < CHUNK - 1; ly++) for (let lx = 1; lx < CHUNK - 1; lx++) {
    const wx = cx * CHUNK + lx;
    const wy = cy * CHUNK + ly;
    const t = state.world.getTile(wx, wy, z);
    if (t === WALL || tileIsLocked(t)) continue;
    const dx = wx - x, dy = wy - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = { x: wx, y: wy }; }
  }
  if (!best) return;

  let cx2 = x, cy2 = y;
  while (cx2 !== best.x) { cx2 += Math.sign(best.x - cx2); state.world.setTile(cx2, cy2, z, FLOOR); }
  while (cy2 !== best.y) { cy2 += Math.sign(best.y - cy2); state.world.setTile(cx2, cy2, z, FLOOR); }
}

function goToLevel(state, newZ, direction) {
  const p = state.player;
  if (p.dead) return;

  if (newZ === SURFACE_LEVEL) {
    // Surface uses a fixed central ladder location.
    state.world.ensureChunksAround(0, 0, newZ, VIEW_RADIUS + 2);
  } else {
    state.world.ensureChunksAround(p.x, p.y, newZ, VIEW_RADIUS + 2);
  }

  if (direction === "down") {
    if (p.z === SURFACE_LEVEL && newZ === 0) {
      const link = ensureSurfaceLinkTile(state);
      state.world.ensureChunksAround(link.x, link.y, newZ, VIEW_RADIUS + 2);
      p.x = link.x; p.y = link.y;

      // Guarantee at least one escape tile from the return ladder.
      const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
      let hasExit = false;
      for (const [dx, dy] of dirs) {
        if (state.world.isPassable(link.x + dx, link.y + dy, newZ)) { hasExit = true; break; }
      }
      if (!hasExit) state.world.setTile(link.x + 1, link.y, newZ, FLOOR);
    } else {
      carveLandingAndConnect(state, p.x, p.y, newZ, STAIRS_UP);
    }
    pushLog(state, `You descend to depth ${newZ}.`);
  } else {
    if (newZ === SURFACE_LEVEL) {
      p.x = 0; p.y = 0;
      state.world.setTile(0, 0, newZ, STAIRS_DOWN);
    } else {
      carveLandingAndConnect(state, p.x, p.y, newZ, STAIRS_DOWN);
      if (newZ === 0) ensureSurfaceLinkTile(state);
    }
    pushLog(state, `You ascend to depth ${newZ}.`);
  }

  p.z = newZ;

  if (!state.world.isPassable(p.x, p.y, p.z)) state.world.setTile(p.x, p.y, p.z, FLOOR);

  hydrateNearby(state);
  renderInventory(state);
  renderEquipment(state);
  renderEffects(state);
}

function tryUseStairs(state, dir) {
  const p = state.player;
  if (p.dead) return false;

  const here = state.world.getTile(p.x, p.y, p.z);

  if (dir === "down") {
    if (here !== STAIRS_DOWN) { pushLog(state, "No stairs down here."); return false; }
    goToLevel(state, p.z + 1, "down");
    return true;
  } else {
    if (here !== STAIRS_UP) { pushLog(state, "No stairs up here."); return false; }
    if (p.z <= SURFACE_LEVEL) { pushLog(state, "You can't go up any further."); return false; }
    goToLevel(state, p.z - 1, "up");
    return true;
  }
}

// Contextual interact: stairs first, then shop/shrine
function interactContext(state) {
  const p = state.player;
  if (p.dead) return false;

  const here = state.world.getTile(p.x, p.y, p.z);
  if (here === STAIRS_DOWN) return tryUseStairs(state, "down");
  if (here === STAIRS_UP) return tryUseStairs(state, "up");

  const shopResult = interactShopkeeper(state);
  if (shopResult !== null) return shopResult;
  return interactShrine(state);
}

// ---------- Monster AI ----------
function bfsNextStep(state, start, goal, maxNodes = 600, maxDist = 18) {
  const z = state.player.z;
  const passable = (x, y) => state.world.isPassable(x, y, z);

  const dx0 = start.x - goal.x, dy0 = start.y - goal.y;
  if (dx0 * dx0 + dy0 * dy0 > maxDist * maxDist) return null;

  const { monsters } = buildOccupancy(state);
  const blocked = new Set(monsters.keys());

  const q = [];
  const prev = new Map();
  const sKey = keyXY(start.x, start.y);
  q.push(start);
  prev.set(sKey, null);

  let nodes = 0;
  while (q.length && nodes++ < maxNodes) {
    const cur = q.shift();
    if (cur.x === goal.x && cur.y === goal.y) break;

    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!passable(nx, ny)) continue;

      const occ = blocked.has(keyXYZ(nx, ny, z));
      if (occ && !(nx === goal.x && ny === goal.y)) continue;

      const k = keyXY(nx, ny);
      if (prev.has(k)) continue;

      prev.set(k, cur);
      q.push({ x: nx, y: ny });
    }
  }

  const gKey = keyXY(goal.x, goal.y);
  if (!prev.has(gKey)) return null;

  let cur = { x: goal.x, y: goal.y };
  let p = prev.get(keyXY(cur.x, cur.y));
  while (p && !(p.x === start.x && p.y === start.y)) { cur = p; p = prev.get(keyXY(cur.x, cur.y)); }
  return cur;
}

function monsterHitPlayer(state, monster, baseDmgLo, baseDmgHi, verb = "hits") {
  const nm = MONSTER_TYPES[monster.type]?.name ?? monster.type;

  // Rat-specific: rats should usually miss; hit chance increases with depth.
  if (monster.type === 'rat') {
    const baseChance = 0.35; // rats usually miss
    const depth = clamp(monster.z ?? state.player.z, 0, 60);
    const hitChance = Math.min(0.85, baseChance + depth * 0.03);
    if (Math.random() >= hitChance) {
      pushLog(state, `The ${nm} misses you.`);
      return;
    }
  }

  // Base damage roll
  let raw = baseDmgLo + Math.floor(Math.random() * (baseDmgHi - baseDmgLo + 1));

  // Progressive difficulty: additional small bonus by depth for all monsters
  const depth = clamp(monster.z ?? state.player.z, 0, 60);
  const depthBonus = Math.floor(depth / 8) * 40;
  raw += depthBonus;

  // Depth 0 rats must never hit harder than 100
  if (monster.type === 'rat' && depth === 0) raw = Math.min(raw, 100);

  const dmg = reduceIncomingDamage(state, raw);
  state.player.hp -= dmg;
  pushLog(state, `The ${nm} ${verb} you for ${dmg}.`);
  if (state.player.hp <= 0) killPlayer(state);
}

function monstersTurn(state) {
  const p = state.player;
  if (p.dead) return;

  hydrateNearby(state);
  computeVisibility(state);

  const z = p.z;
  const { monsters } = buildOccupancy(state);
  const toAct = [];

  for (const e of state.entities.values()) {
    if (e.kind !== "monster") continue;
    if (e.z !== z) continue;
    const dx = e.x - p.x, dy = e.y - p.y;
    if (dx * dx + dy * dy <= (VIEW_RADIUS + 5) * (VIEW_RADIUS + 5)) toAct.push(e);
  }

  for (const m of toAct) {
    if (!state.entities.has(m.id)) continue;
    if (p.dead) return;

    if ((m.cd ?? 0) > 0) m.cd -= 1;

    const spec = monsterStatsForDepth(m.type, m.z ?? z);
    const mdx = p.x - m.x, mdy = p.y - m.y;
    const distMan = Math.abs(mdx) + Math.abs(mdy);
    const adj = distMan === 1;

    if (spec.range && distMan <= spec.range && !adj) {
      const sees = hasLineOfSight(state.world, z, m.x, m.y, p.x, p.y);
      if (sees && (m.cd ?? 0) === 0) {
        monsterHitPlayer(state, m, spec.atkLo, spec.atkHi, "shoots");
        m.cd = spec.cdTurns ?? 2;
        m.awake = true;
        if (m.origin === "base") state.entityOverrides.set(m.id, { x: m.x, y: m.y, z: m.z, hp: m.hp, cd: m.cd });
        continue;
      }
    }

    if (adj) {
      monsterHitPlayer(state, m, spec.atkLo, spec.atkHi, "hits");
      m.awake = true;
      if (m.origin === "base") state.entityOverrides.set(m.id, { x: m.x, y: m.y, z: m.z, hp: m.hp, cd: m.cd ?? 0 });
      continue;
    }

    const seesPlayer = hasLineOfSight(state.world, z, m.x, m.y, p.x, p.y);
    if (seesPlayer) {
      m.awake = true;
      const next = bfsNextStep(state, { x: m.x, y: m.y }, { x: p.x, y: p.y });
      if (next) {
        const occ = monsters.get(keyXYZ(next.x, next.y, z));
        if (!occ) {
          m.x = next.x; m.y = next.y;
          if (m.origin === "base") state.entityOverrides.set(m.id, { x: m.x, y: m.y, z: m.z, hp: m.hp, cd: m.cd ?? 0 });
        }
      }
      continue;
    }

    const wanderChance = m.awake ? 0.60 : 0.22;
    if (Math.random() < wanderChance) {
      const dirs = [[1,0],[-1,0],[0,1],[0,-1]].sort(() => Math.random() - 0.5);
      for (const [dx, dy] of dirs) {
        const nx = m.x + dx, ny = m.y + dy;
        if (!state.world.isPassable(nx, ny, z)) continue;
        const occ = monsters.get(keyXYZ(nx, ny, z));
        if (occ) continue;
        if (nx === p.x && ny === p.y) continue;
        m.x = nx; m.y = ny;
        if (m.origin === "base") state.entityOverrides.set(m.id, { x: m.x, y: m.y, z: m.z, hp: m.hp, cd: m.cd ?? 0 });
        break;
      }
    }
  }
}

// ---------- Rendering (glyph overlays) ----------
// Glyph font: slightly larger than tile size so characters/icons overlap cells a bit
const GLYPH_FONT = `bold ${Math.floor(TILE * 1.12)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace`;
const MONSTER_SPRITE_SIZE = Math.round(TILE * 1.6);
const ITEM_SPRITE_SIZE = Math.round(TILE * 1.6);
const SPRITE_SOURCES = {
  goblin: "./client/assets/goblin_dagger_full.png",
  rat: "./client/assets/rat_full.png",
  rogue: "./client/assets/rogue_full.png",
  jelly_green: "./client/assets/jelly_green_full.png",
  jelly_yellow: "./client/assets/jelly_yellow_full.png",
  jelly_red: "./client/assets/jelly_red_full.png",
  key_red: "./client/assets/red_key_full.png",
  key_blue: "./client/assets/blue_key_full.png",
  key_green: "./client/assets/green_key_full.png",
  chest: "./client/assets/chest_full.png",
  chest_red: "./client/assets/red_chest_full.png",
  chest_blue: "./client/assets/blue_chest_full.png",
  chest_green: "./client/assets/green_chest_full.png",
  gold: "./client/assets/coins_full.png",
  potion: "./client/assets/potion_hp_full.png",
  surface_entrance: "./client/assets/surface_entrance_full.png",
  weapon_bronze_dagger: "./client/assets/bronze_dagger_full.png",
  weapon_bronze_sword: "./client/assets/bronze_sword_full.png",
  weapon_bronze_axe: "./client/assets/bronze_axe_full.png",
  armor_leather_chest: "./client/assets/leather_chest_full.png",
  armor_leather_legs: "./client/assets/leather_legs_full.png",
  weapon_iron_dagger: "./client/assets/iron_dagger_full.png",
  weapon_iron_sword: "./client/assets/iron_sword_full.png",
  armor_iron_chest: "./client/assets/iron_chestplate_full.png",
  armor_iron_legs: "./client/assets/iron_platelegs_full.png",
};
const spriteImages = {};
const spriteProcessed = {};
const spriteReady = {};
function buildSpriteTransparency(id, img) {
  // Surface entrance art already has intended transparency and can be harmed
  // by corner-matte stripping; use it as-is.
  if (id === "surface_entrance") return img;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return null;

  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const octx = off.getContext("2d", { willReadFrequently: true });
  if (!octx) return null;
  octx.drawImage(img, 0, 0);

  const id = octx.getImageData(0, 0, w, h);
  const d = id.data;
  const sample = (x, y) => {
    const i = (y * w + x) * 4;
    return [d[i], d[i + 1], d[i + 2]];
  };
  const samples = [
    sample(0, 0),
    sample(w - 1, 0),
    sample(0, h - 1),
    sample(w - 1, h - 1),
    sample((w / 2) | 0, 0),
  ];
  const matte = samples.reduce((acc, c) => [acc[0] + c[0], acc[1] + c[1], acc[2] + c[2]], [0, 0, 0]).map(v => v / samples.length);
  const threshold = 30;

  for (let i = 0; i < d.length; i += 4) {
    const dr = d[i] - matte[0];
    const dg = d[i + 1] - matte[1];
    const db = d[i + 2] - matte[2];
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist <= threshold) d[i + 3] = 0;
  }

  // Trim transparent padding so rendered sprite uses the visible silhouette area.
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] <= 0) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  octx.putImageData(id, 0, 0);
  if (maxX < minX || maxY < minY) return off;

  const tw = maxX - minX + 1;
  const th = maxY - minY + 1;
  const trimmed = document.createElement("canvas");
  trimmed.width = tw;
  trimmed.height = th;
  const tctx = trimmed.getContext("2d");
  if (!tctx) return off;
  tctx.drawImage(off, minX, minY, tw, th, 0, 0, tw, th);
  return trimmed;
}
function loadProcessedSprite(id, src) {
  const img = new Image();
  spriteImages[id] = img;
  spriteProcessed[id] = null;
  spriteReady[id] = false;
  img.onload = () => {
    spriteProcessed[id] = buildSpriteTransparency(id, img);
    spriteReady[id] = true;
  };
  img.onerror = () => { spriteReady[id] = false; };
  img.src = src;
}
for (const [id, src] of Object.entries(SPRITE_SOURCES)) loadProcessedSprite(id, src);
function getSpriteIfReady(id) {
  if (!id || !spriteReady[id]) return null;
  return spriteProcessed[id] ?? spriteImages[id] ?? null;
}
function monsterSpriteId(type) {
  if (type === "goblin") return "goblin";
  if (type === "rat") return "rat";
  if (type === "rogue") return "rogue";
  if (type === "jelly_green") return "jelly_green";
  if (type === "jelly_yellow") return "jelly_yellow";
  if (type === "jelly_red") return "jelly_red";
  if (type === "jelly") return "jelly_yellow";
  return null;
}
function itemSpriteId(ent) {
  if (!ent?.type) return null;
  if (ent.type === "gold") return "gold";
  if (ent.type === "potion") return "potion";
  if (ent.type === "key_red" || ent.type === "key_blue" || ent.type === "key_green") return ent.type;
  if (ent.type === "chest" && !ent.locked) return "chest";
  if (ent.type === "chest" && ent.locked) {
    if (ent.keyType === "key_red") return "chest_red";
    if (ent.keyType === "key_blue") return "chest_blue";
    if (ent.keyType === "key_green") return "chest_green";
  }
  if (ent.type === "weapon_bronze_dagger") return "weapon_bronze_dagger";
  if (ent.type === "weapon_bronze_sword") return "weapon_bronze_sword";
  if (ent.type === "weapon_bronze_axe") return "weapon_bronze_axe";
  if (ent.type === "weapon_iron_dagger") return "weapon_iron_dagger";
  if (ent.type === "weapon_iron_sword") return "weapon_iron_sword";
  if (ent.type === "armor_leather_chest") return "armor_leather_chest";
  if (ent.type === "armor_leather_legs") return "armor_leather_legs";
  if (ent.type === "armor_iron_chest") return "armor_iron_chest";
  if (ent.type === "armor_iron_legs") return "armor_iron_legs";
  return null;
}

function drawGlyph(ctx2d, sx, sy, glyph, color = "#e6e6e6") {
  const cx = sx * TILE + TILE / 2;
  const cy = sy * TILE + TILE / 2 + 0.5;
  ctx2d.save();
  ctx2d.font = GLYPH_FONT;
  ctx2d.textAlign = "center";
  ctx2d.textBaseline = "middle";
  ctx2d.fillStyle = color;
  ctx2d.fillText(glyph, cx, cy);
  ctx2d.restore();
}
function drawCenteredSprite(ctx2d, sx, sy, img, w, h) {
  const iw = img?.width || 1;
  const ih = img?.height || 1;
  const scale = Math.min(w, h) / Math.max(iw, ih);
  const dw = Math.max(1, Math.round(iw * scale));
  const dh = Math.max(1, Math.round(ih * scale));
  const px = sx * TILE + Math.floor((TILE - dw) / 2);
  const py = sy * TILE + Math.floor((TILE - dh) / 2);
  ctx2d.drawImage(img, px, py, dw, dh);
}
function tileGlyph(t) {
  if (t === STAIRS_DOWN) return { g: "\u25BC", c: "#d6f5d6" };
  if (t === STAIRS_UP) return { g: "\u25B2", c: "#e8d6ff" };
  if (t === LOCK_RED) return { g: "R", c: "#ff9a9a" };
  if (t === LOCK_BLUE) return { g: "B", c: "#9ad0ff" };
  if (t === LOCK_GREEN) return { g: "G", c: "#a6ff9a" };
  if (t === DOOR_CLOSED) return { g: "+", c: "#e6d3b3" };
  if (t === DOOR_OPEN) return { g: "/", c: "#b8d6ff" };
  return null;
}
function tileSpriteId(state, wx, wy, wz, t) {
  if (t === STAIRS_DOWN && wz === SURFACE_LEVEL && wx === 0 && wy === 0) return "surface_entrance";
  if (t === STAIRS_UP && wz === 0) {
    const link = state.surfaceLink ?? resolveSurfaceLink(state);
    if (link && wx === link.x && wy === link.y) return "surface_entrance";
  }
  return null;
}
function itemGlyph(type) {
  // Updated colors: potions magenta, armor brown, weapons silver, chests yellow, gold gold
  if (type === "potion") return { g: "!", c: "#ff66cc" };
  if (type === "gold") return { g: "$", c: "#ffbf00" };
  if (type === "key_red") return { g: "k", c: "#ff6b6b" };
  if (type === "key_blue") return { g: "k", c: "#6bb8ff" };
  if (type === "key_green") return { g: "k", c: "#7dff6b" };
  if (type === "shopkeeper") return { g: "@", c: "#ffd166" };
  if (type === "chest") return { g: "\u25A3", c: "#ffd700" };
  if (type === "shrine") return { g: "\u2726", c: "#b8f2e6" };
  if (type?.startsWith("weapon_")) return { g: "\u2020", c: "#cfcfcf" };
  if (type?.startsWith("armor_")) return { g: "\u26E8", c: "#8b5a2b" };
  return { g: "\u2022", c: "#f4d35e" };
}
function arrowForVector(dx, dy) {
  if (dx === 0 && dy === 0) return "\u2191";
  const dirs = ["\u2192", "\u2198", "\u2193", "\u2199", "\u2190", "\u2196", "\u2191", "\u2197"];
  const oct = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return dirs[((oct % 8) + 8) % 8];
}

function updateSurfaceCompass(state) {
  if (!surfaceCompassEl || !surfaceCompassArrowEl || !mainCanvasWrapEl) return;
  const p = state.player;
  if (p.z !== 0) {
    surfaceCompassEl.style.display = "none";
    return;
  }

  const link = state.surfaceLink ?? resolveSurfaceLink(state);
  const dx = (link?.x ?? p.x) - p.x;
  const dy = (link?.y ?? p.y) - p.y;
  const isLadderOnScreen = Math.abs(dx) <= VIEW_RADIUS && Math.abs(dy) <= VIEW_RADIUS;
  if (isLadderOnScreen) {
    surfaceCompassEl.style.display = "none";
    return;
  }
  const angle = (dx === 0 && dy === 0) ? (-Math.PI / 2) : Math.atan2(dy, dx);

  const w = Math.max(1, mainCanvasWrapEl.clientWidth);
  const h = Math.max(1, mainCanvasWrapEl.clientHeight);
  const cx = w / 2;
  const cy = h / 2;
  const margin = 14;
  const radius = Math.max(18, Math.min(w, h) / 2 - margin);
  const px = cx + Math.cos(angle) * radius;
  const py = cy + Math.sin(angle) * radius;

  surfaceCompassEl.style.display = "flex";
  surfaceCompassEl.style.left = `${px}px`;
  surfaceCompassEl.style.top = `${py}px`;
  surfaceCompassArrowEl.style.transform = `rotate(${angle + Math.PI / 2}rad)`;
}

function monsterGlyph(type) {
  if (type === "rat") return { g: "r", c: "#ff6b6b" };
  if (type === "goblin") return { g: "g", c: "#ff6b6b" };
  if (type === "slime") return { g: "s", c: "#ff6b6b" };
  if (type === "rogue") return { g: "R", c: "#ff8a6b" };
  if (type === "jelly_green") return { g: "j", c: "#79ff79" };
  if (type === "jelly_yellow") return { g: "j", c: "#ffd966" };
  if (type === "jelly_red") return { g: "j", c: "#ff6b6b" };
  if (type === "jelly") return { g: "j", c: "#ffd966" };
  if (type === "giant_spider") return { g: "S", c: "#ff9f4a" };
  if (type === "skeleton") return { g: "K", c: "#ff6b6b" };
  if (type === "archer") return { g: "a", c: "#ffb36b" };
  return { g: "m", c: "#ff6b6b" };
}

function draw(state) {
  computeVisibility(state);
  hydrateNearby(state);
  const shopRestocked = refreshShopStock(state, false);

  const { world, player, seen, visible } = state;
  const { monsters, items } = buildOccupancy(state);
  updateContextActionButton(state, { monsters, items });
  const theme = themeForDepth(player.z);
  const deferredItemSprites = [];
  const deferredMonsterSprites = [];

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);

  for (let sy = 0; sy < viewSize; sy++) {
    for (let sx = 0; sx < viewSize; sx++) {
      const wx = player.x + (sx - VIEW_RADIUS);
      const wy = player.y + (sy - VIEW_RADIUS);

      const isVisible = visible.has(keyXY(wx, wy));
      const isSeen = seen.has(keyXYZ(wx, wy, player.z));
      if (!isSeen) continue;

      const t = world.getTile(wx, wy, player.z);

      let fill = "#0b0e14";
      if (t === WALL) fill = isVisible ? theme.wallV : theme.wallNV;
      if (t === FLOOR) fill = isVisible ? theme.floorV : theme.floorNV;
      if (t === DOOR_CLOSED) fill = isVisible ? theme.doorC_V : theme.doorC_NV;
      if (t === DOOR_OPEN) fill = isVisible ? theme.doorO_V : theme.doorO_NV;
      if (t === LOCK_RED) fill = isVisible ? theme.lockR_V : theme.lockR_NV;
      if (t === LOCK_BLUE) fill = isVisible ? theme.lockB_V : theme.lockB_NV;
      if (t === LOCK_GREEN) fill = isVisible ? theme.lockG_V : theme.lockG_NV;
      if (t === STAIRS_DOWN) fill = isVisible ? theme.downV : theme.downNV;
      if (t === STAIRS_UP) fill = isVisible ? theme.upV : theme.upNV;

      ctx.fillStyle = fill;
      ctx.fillRect(sx * TILE, sy * TILE, TILE, TILE);

      // Subtle bevel shading at wall/floor boundaries to reduce blocky edges at higher tile sizes.
      const wallish = (tt) => tt === WALL || tt === DOOR_CLOSED || tt === LOCK_RED || tt === LOCK_BLUE || tt === LOCK_GREEN || tt === "*";
      const openish = (tt) => tt === FLOOR || tt === DOOR_OPEN || tt === STAIRS_DOWN || tt === STAIRS_UP;
      const n = world.getTile(wx, wy - 1, player.z);
      const s = world.getTile(wx, wy + 1, player.z);
      const w = world.getTile(wx - 1, wy, player.z);
      const e = world.getTile(wx + 1, wy, player.z);
      const nw = world.getTile(wx - 1, wy - 1, player.z);
      const ne = world.getTile(wx + 1, wy - 1, player.z);
      const sw = world.getTile(wx - 1, wy + 1, player.z);
      const se = world.getTile(wx + 1, wy + 1, player.z);
      const edgeAlpha = isVisible ? 0.22 : 0.12;
      const px = sx * TILE, py = sy * TILE;
      const chamfer = CORNER_CHAMFER_PX;

      if (openish(t)) {
        ctx.fillStyle = `rgba(0,0,0,${edgeAlpha})`;
        if (wallish(n)) ctx.fillRect(px, py, TILE, EDGE_SHADE_PX);
        if (wallish(s)) ctx.fillRect(px, py + TILE - EDGE_SHADE_PX, TILE, EDGE_SHADE_PX);
        if (wallish(w)) ctx.fillRect(px, py, EDGE_SHADE_PX, TILE);
        if (wallish(e)) ctx.fillRect(px + TILE - EDGE_SHADE_PX, py, EDGE_SHADE_PX, TILE);
        // Secondary softer shade layer for smoother transitions at high resolution.
        ctx.fillStyle = `rgba(0,0,0,${isVisible ? 0.12 : 0.06})`;
        if (wallish(n)) ctx.fillRect(px, py + EDGE_SHADE_PX, TILE, EDGE_SOFT_PX);
        if (wallish(s)) ctx.fillRect(px, py + TILE - EDGE_SHADE_PX - EDGE_SOFT_PX, TILE, EDGE_SOFT_PX);
        if (wallish(w)) ctx.fillRect(px + EDGE_SHADE_PX, py, EDGE_SOFT_PX, TILE);
        if (wallish(e)) ctx.fillRect(px + TILE - EDGE_SHADE_PX - EDGE_SOFT_PX, py, EDGE_SOFT_PX, TILE);
      } else if (wallish(t)) {
        ctx.fillStyle = `rgba(255,255,255,${isVisible ? 0.08 : 0.04})`;
        if (openish(n)) ctx.fillRect(px, py, TILE, EDGE_SHADE_PX);
        if (openish(w)) ctx.fillRect(px, py, EDGE_SHADE_PX, TILE);

        // Autotile-like corner chamfers for true walls to break square "stair-steps".
        if (t === WALL) {
          ctx.fillStyle = isVisible ? theme.floorV : theme.floorNV;

          if (openish(n) && openish(w) && openish(nw)) {
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px + chamfer, py);
            ctx.lineTo(px, py + chamfer);
            ctx.closePath();
            ctx.fill();
          }
          if (openish(n) && openish(e) && openish(ne)) {
            ctx.beginPath();
            ctx.moveTo(px + TILE, py);
            ctx.lineTo(px + TILE - chamfer, py);
            ctx.lineTo(px + TILE, py + chamfer);
            ctx.closePath();
            ctx.fill();
          }
          if (openish(s) && openish(w) && openish(sw)) {
            ctx.beginPath();
            ctx.moveTo(px, py + TILE);
            ctx.lineTo(px + chamfer, py + TILE);
            ctx.lineTo(px, py + TILE - chamfer);
            ctx.closePath();
            ctx.fill();
          }
          if (openish(s) && openish(e) && openish(se)) {
            ctx.beginPath();
            ctx.moveTo(px + TILE, py + TILE);
            ctx.lineTo(px + TILE - chamfer, py + TILE);
            ctx.lineTo(px + TILE, py + TILE - chamfer);
            ctx.closePath();
            ctx.fill();
          }
        }
      }

      const tileSprite = getSpriteIfReady(tileSpriteId(state, wx, wy, player.z, t));
      if (tileSprite) {
        drawCenteredSprite(ctx, sx, sy, tileSprite, ITEM_SPRITE_SIZE, ITEM_SPRITE_SIZE);
      } else {
        const tg = tileGlyph(t);
        if (tg) {
          const col = (isVisible || !fogEnabled) ? tg.c : "rgba(230,230,230,0.45)";
          drawGlyph(ctx, sx, sy, tg.g, col);
        }
      }

      if (isVisible || !fogEnabled) {
        const mk = monsters.get(keyXYZ(wx, wy, player.z));
        const ik = items.get(keyXYZ(wx, wy, player.z));

        if (ik) {
          const ent = state.entities.get(ik);
          const itemSprite = getSpriteIfReady(itemSpriteId(ent));
          if (itemSprite) {
            deferredItemSprites.push({ sx, sy, img: itemSprite });
          } else {
            const gi = itemGlyph(ent?.type);
            if (gi) drawGlyph(ctx, sx, sy, gi.g, gi.c);
          }
        }

        if (mk) {
          const ent = state.entities.get(mk);
          const monsterSprite = getSpriteIfReady(monsterSpriteId(ent?.type));
          if (monsterSprite) {
            deferredMonsterSprites.push({ sx, sy, img: monsterSprite });
          } else {
            const gm = monsterGlyph(ent?.type);
            if (gm) drawGlyph(ctx, sx, sy, gm.g, gm.c);
          }
        }
      }
    }
  }

  for (const spr of deferredItemSprites) {
    drawCenteredSprite(ctx, spr.sx, spr.sy, spr.img, ITEM_SPRITE_SIZE, ITEM_SPRITE_SIZE);
  }
  // Draw oversized monster sprites after terrain so neighboring tiles don't overpaint overflow.
  for (const spr of deferredMonsterSprites) {
    drawCenteredSprite(ctx, spr.sx, spr.sy, spr.img, MONSTER_SPRITE_SIZE, MONSTER_SPRITE_SIZE);
  }

  ctx.fillStyle = "#ffffff";
  // Player marker as a circle centered in the tile.
  const pcx = VIEW_RADIUS * TILE + TILE / 2;
  const pcy = VIEW_RADIUS * TILE + TILE / 2;
  const prad = Math.max(3, TILE / 2 - 2);
  ctx.beginPath();
  ctx.arc(pcx, pcy, prad, 0, Math.PI * 2);
  ctx.fill();

  const { cx, cy, lx, ly } = splitWorldToChunk(player.x, player.y);
  metaEl.innerHTML =
    `<div class="meta-seed">seed: ${world.seedStr} &nbsp; theme: ${theme.name}</div>` +
    `<div class="meta-pos">pos: (${player.x}, ${player.y}) chunk: (${cx}, ${cy}) local: (${lx}, ${ly})</div>` +
    `<div class="meta-row"><div class="meta-col"><span class="label">XP</span><span class="val xp">${player.xp}/${xpToNext(player.level)}</span></div><div class="meta-col"><span class="label">Gold</span><span class="val gold">${player.gold}</span></div></div>` +
    `<div class="meta-row"><div class="meta-col"><span class="label">ATK</span><span class="val atk">${Math.max(1, player.atkLo + player.atkBonus)}-${Math.max(1, player.atkHi + player.atkBonus)}</span></div><div class="meta-col"><span class="label">DEF</span><span class="val def">+${player.defBonus}</span></div></div>` +
    `<div class="meta-row"><div class="meta-col"><span class="label">HP</span><span class="val hp">${player.hp}/${player.maxHp}</span></div><div class="meta-col"><span class="label">LVL</span><span class="val lvl">${player.level}</span></div></div>`;
  if (depthDisplayEl) depthDisplayEl.textContent = `Depth: ${player.z}`;
  updateSurfaceCompass(state);

  // Visual indicator for low HP: toggle hp-low class when HP <= 30% of max
  try {
    const hpNode = metaEl.querySelector('.val.hp');
    if (hpNode) {
      const threshold = Math.ceil((player.maxHp || 1) * 0.3);
      if (player.hp <= threshold) hpNode.classList.add('hp-low');
      else hpNode.classList.remove('hp-low');
    }
  } catch (e) { /* ignore DOM errors */ }

  drawMinimap(state);
  updateDeathOverlay(state);
  if (state.player.dead && isShopOverlayOpen()) closeShopOverlay();
  if (shopUi.open) {
    if (shopRestocked) renderShopOverlay(state);
    else updateShopOverlayMeta(state);
  }
}

// ---------- Turn handling ----------
function applyEffectsAfterPlayerAction(state) {
  if (!state.player.dead) applyEffectsTick(state);
}

function takeTurn(state, didSpendTurn) {
  if (!didSpendTurn) return;
  state.turn += 1;
  maybeGrantExplorationXP(state);

  applyEffectsAfterPlayerAction(state);
  monstersTurn(state);

  renderInventory(state);
  renderEquipment(state);
  renderEffects(state);

  saveNow(state);
}

// ---------- Confirm helpers ----------
function confirmNewRun() {
  return confirm(
    "Start a NEW RUN with a NEW SEED?\n\n" +
    "This will immediately replace your current run (position, dungeon progress, inventory, everything).\n" +
    "If you want to keep it, use Export first.\n\n" +
    "Start new run now?"
  );
}
function confirmHardReset() {
  return confirm(
    "HARD RESET (delete saved game)?\n\n" +
    "This will permanently delete the saved run from this browser (localStorage).\n" +
    "You will start a brand-new run with a new seed.\n\n" +
    "Hard reset now?"
  );
}

// ---------- Input ----------
function onKey(state, e) {
  const k = e.key.toLowerCase();
  if (isShopOverlayOpen()) {
    e.preventDefault();
    if (k === "escape") closeShopOverlay();
    return;
  }
  const digitShiftDrop = /^Digit[1-9]$/.test(e.code) && e.shiftKey;

  if (digitShiftDrop) {
    e.preventDefault();
    const displayIdx = Number(e.code.replace("Digit", "")) - 1;
    const entry = getInventoryDisplayEntries(state)[displayIdx];
    if (entry) takeTurn(state, dropInventoryIndex(state, entry.invIndex));
    return;
  }

  if (e.key >= "1" && e.key <= "9") {
    e.preventDefault();
    const displayIdx = parseInt(e.key, 10) - 1;
    const entry = getInventoryDisplayEntries(state)[displayIdx];
    if (entry) useInventoryIndex(state, entry.invIndex);
    return;
  }

  if (k === "arrowup" || k === "w") { e.preventDefault(); takeTurn(state, playerMoveOrAttack(state, 0, -1)); }
  else if (k === "arrowdown" || k === "s") { e.preventDefault(); takeTurn(state, playerMoveOrAttack(state, 0, 1)); }
  else if (k === "arrowleft" || k === "a") { e.preventDefault(); takeTurn(state, playerMoveOrAttack(state, -1, 0)); }
  else if (k === "arrowright" || k === "d") { e.preventDefault(); takeTurn(state, playerMoveOrAttack(state, 1, 0)); }
  else if (k === "." || k === " " || k === "spacebar") { e.preventDefault(); takeTurn(state, waitTurn(state)); }
  else if (k === "g") { e.preventDefault(); takeTurn(state, pickup(state)); }
  else if (k === "c") { e.preventDefault(); {
      // Try to close an open adjacent door; if none, try to open a closed adjacent door.
      const closed = tryCloseAdjacentDoor(state);
      if (closed) takeTurn(state, true);
      else takeTurn(state, tryOpenAdjacentDoor(state));
    }
  }

  // E is now contextual: stairs (up/down) OR shop/shrine interaction
  else if (k === "e") { e.preventDefault(); takeTurn(state, interactContext(state)); }
  else if (k === "enter") {
    e.preventDefault();
    const action = resolveContextAction(state);
    if (action) takeTurn(state, action.run());
  }

  else if (k === "i") { e.preventDefault(); renderInventory(state); }
  else if (k === "m") { e.preventDefault(); minimapEnabled = !minimapEnabled; saveNow(state); }
  else if (e.key === ">") { e.preventDefault(); takeTurn(state, tryUseStairs(state, "down")); }
  else if (e.key === "<") { e.preventDefault(); takeTurn(state, tryUseStairs(state, "up")); }
  else if (k === "f") { e.preventDefault(); fogEnabled = !fogEnabled; saveNow(state); }

  else if (k === "r") {
    e.preventDefault();
    if (!confirmNewRun()) return;
    game = makeNewGame();
    saveNow(game);
  }
}

// ---------- Keyâ†’Locked Door pairing (doorway-only replacement) ----------
function keyTypeToLockTile(keyType) {
  if (keyType === "key_red") return LOCK_RED;
  if (keyType === "key_blue") return LOCK_BLUE;
  return LOCK_GREEN;
}

function isDoorwayCandidate(state, x, y, z) {
  const t = state.world.getTile(x, y, z);
  if (t !== DOOR_CLOSED) return false;

  if (state.visitedDoors?.has(keyXYZ(x, y, z))) return false;

  const floorish = (tt) => tt === FLOOR || tt === DOOR_OPEN || tt === STAIRS_DOWN || tt === STAIRS_UP;
  const n = state.world.getTile(x, y - 1, z), s = state.world.getTile(x, y + 1, z);
  const w = state.world.getTile(x - 1, y, z), e = state.world.getTile(x + 1, y, z);

  const ns = floorish(n) && floorish(s) && w === WALL && e === WALL;
  const we = floorish(w) && floorish(e) && n === WALL && s === WALL;

  return ns || we;
}

function topologyWalkableTile(t) {
  return t === FLOOR || t === DOOR_OPEN || t === DOOR_CLOSED || t === STAIRS_DOWN || t === STAIRS_UP;
}

function isDoorChokepoint(state, x, y, z, maxRadius = 28, maxNodes = 2600) {
  if (!isDoorwayCandidate(state, x, y, z)) return false;

  const n = state.world.getTile(x, y - 1, z);
  const s = state.world.getTile(x, y + 1, z);
  const w = state.world.getTile(x - 1, y, z);
  const e = state.world.getTile(x + 1, y, z);

  let start = null;
  let goal = null;
  if (topologyWalkableTile(n) && topologyWalkableTile(s)) {
    start = { x, y: y - 1 };
    goal = { x, y: y + 1 };
  } else if (topologyWalkableTile(w) && topologyWalkableTile(e)) {
    start = { x: x - 1, y };
    goal = { x: x + 1, y };
  } else {
    return false;
  }

  const q = [start];
  const seen = new Set([keyXY(start.x, start.y)]);
  let nodes = 0;

  while (q.length && nodes++ < maxNodes) {
    const cur = q.shift();
    if (cur.x === goal.x && cur.y === goal.y) return false;

    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (nx === x && ny === y) continue; // treat the candidate door as blocked
      if (Math.abs(nx - x) + Math.abs(ny - y) > maxRadius) continue;

      const t = state.world.getTile(nx, ny, z);
      if (!topologyWalkableTile(t)) continue;

      const k = keyXY(nx, ny);
      if (seen.has(k)) continue;
      seen.add(k);
      q.push({ x: nx, y: ny });
    }
  }

  // If sides could not reconnect without using this door, it's a chokepoint.
  return true;
}

function placeMatchingLockedDoorNearPlayer(state, keyType) {
  const p = state.player;
  const z = p.z;
  const lockTile = keyTypeToLockTile(keyType);

  let foundExisting = false;
  for (let dy = -48; dy <= 48 && !foundExisting; dy++) {
    for (let dx = -48; dx <= 48; dx++) {
      const wx = p.x + dx, wy = p.y + dy;
      if (state.world.getTile(wx, wy, z) === lockTile) { foundExisting = true; break; }
    }
  }
  if (foundExisting) return true;

  const minDist = 10;
  const maxDist = 48;
  const candidates = [];

  for (let dy = -maxDist; dy <= maxDist; dy++) {
    for (let dx = -maxDist; dx <= maxDist; dx++) {
      const wx = p.x + dx;
      const wy = p.y + dy;
      const d = Math.abs(dx) + Math.abs(dy);
      if (d < minDist || d > maxDist) continue;
      if (!state.seen.has(keyXYZ(wx, wy, z))) continue;
      if (!isDoorwayCandidate(state, wx, wy, z)) continue;
      candidates.push({ x: wx, y: wy, d, choke: isDoorChokepoint(state, wx, wy, z) });
    }
  }

  if (!candidates.length) return false;

  const chokeCandidates = candidates.filter(c => c.choke);
  const pool = chokeCandidates.length ? chokeCandidates : candidates;
  pool.sort((a, b) => a.d - b.d);
  const pick = pool[Math.floor(pool.length * 0.65)] ?? pool[pool.length - 1];

  state.world.setTile(pick.x, pick.y, z, lockTile);
  pushLog(state, `You sense a matching locked door somewhere nearby...`);
  return true;
}

// ---------- Save / Load ----------
function exportSave(state) {
  const tileOv = Array.from(state.world.tileOverrides.entries());
  const removed = Array.from(state.removedIds);
  const entOv = Array.from(state.entityOverrides.entries());
  const seen = Array.from(state.seen).slice(0, 60000);
  const dynamic = Array.from(state.dynamic.values());
  const visitedDoors = Array.from(state.visitedDoors ?? []);
  const exploredChunks = Array.from(state.exploredChunks ?? []);

  const payload = {
    v: 7,
    seed: state.world.seedStr,
    fog: fogEnabled,
    minimap: minimapEnabled,
    player: state.player,
    inv: state.inv,
    removed,
    entOv,
    tileOv,
    seen,
    dynamic,
    log: state.log.slice(-110),
    turn: state.turn,
    visitedDoors,
    exploredChunks,
    surfaceLink: state.surfaceLink ?? null,
    startSpawn: state.startSpawn ?? null,
    shop: state.shop ?? null,
  };

  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}

function normalizeInventoryEntries(items) {
  const out = [];
  for (const raw of items ?? []) {
    if (!raw || typeof raw !== "object") continue;
    const type = normalizeItemType(raw.type);
    if (!ITEM_TYPES[type]) continue;
    const amount = Math.max(1, Math.floor(raw.amount ?? 1));
    out.push({ type, amount });
  }
  return out;
}

function normalizeDynamicEntries(items) {
  const out = [];
  for (const raw of items ?? []) {
    if (!raw || typeof raw !== "object") continue;
    const type = normalizeItemType(raw.type);
    if (!ITEM_TYPES[type]) continue;
    out.push({ ...raw, type, amount: Math.max(1, Math.floor(raw.amount ?? 1)) });
  }
  return out;
}

function normalizeEquip(equip) {
  const out = { weapon: null, chest: null, legs: null };
  const e = equip ?? {};

  const weapon = normalizeItemType(e.weapon ?? null);
  if (weapon && WEAPONS[weapon]) out.weapon = weapon;

  const candidates = [e.chest, e.legs, e.armor]
    .map((x) => normalizeItemType(x))
    .filter(Boolean);

  for (const type of candidates) {
    const piece = ARMOR_PIECES[type];
    if (!piece) continue;
    if (!out[piece.slot]) out[piece.slot] = type;
  }

  return out;
}

function migrateV3toV4(payload) {
  if (payload?.inv) {
    for (const it of payload.inv) {
      if (it.type === "key") it.type = "key_red";
    }
  }
  if (payload?.dynamic) {
    for (const it of payload.dynamic) {
      if (it.type === "key") it.type = "key_red";
    }
  }
  payload.player = payload.player ?? {};
  payload.player.dead = !!payload.player.dead;
  payload.player.level = payload.player.level ?? 1;
  payload.player.xp = payload.player.xp ?? 0;
  payload.player.equip = payload.player.equip ?? { weapon: null, armor: null };
  payload.player.effects = payload.player.effects ?? [];
  payload.turn = payload.turn ?? 0;
  return payload;
}

function deriveExploredChunksFromSeen(seenEntries) {
  const chunks = new Set();
  for (const s of seenEntries ?? []) {
    const [zPart, xyPart] = String(s).split("|");
    if (!xyPart) continue;
    const [xPart, yPart] = xyPart.split(",");
    const z = Number(zPart);
    const x = Number(xPart);
    const y = Number(yPart);
    if (!Number.isFinite(z) || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    const { cx, cy } = splitWorldToChunk(x, y);
    chunks.add(keyZCXCY(z, cx, cy));
  }
  return chunks;
}

function migrateV4toV5(payload) {
  payload.player = payload.player ?? {};
  payload.player.xp = Math.max(0, Math.floor((payload.player.xp ?? 0) * XP_SCALE));
  payload.exploredChunks = Array.from(deriveExploredChunksFromSeen(payload.seen ?? []));
  payload.v = 5;
  return payload;
}

function migrateV5toV6(payload) {
  payload.player = payload.player ?? {};
  payload.player.maxHp = Math.max(1, Math.floor((payload.player.maxHp ?? 18) * COMBAT_SCALE));
  payload.player.hp = Math.max(0, Math.floor((payload.player.hp ?? payload.player.maxHp) * COMBAT_SCALE));
  payload.player.effects = (payload.player.effects ?? []).map((e) => {
    const next = { ...e };
    if ((next.type === "bless" || next.type === "curse") && Number.isFinite(next.atkDelta) && Math.abs(next.atkDelta) < COMBAT_SCALE) {
      next.atkDelta = Math.floor(next.atkDelta * COMBAT_SCALE);
    }
    if (next.type === "regen" && Number.isFinite(next.healPerTurn) && Math.abs(next.healPerTurn) < COMBAT_SCALE) {
      next.healPerTurn = Math.floor(next.healPerTurn * COMBAT_SCALE);
    }
    return next;
  });

  payload.entOv = (payload.entOv ?? []).map(([id, ov]) => {
    if (!ov || typeof ov !== "object") return [id, ov];
    const next = { ...ov };
    if (Number.isFinite(next.hp)) next.hp = Math.max(1, Math.floor(next.hp * COMBAT_SCALE));
    return [id, next];
  });

  payload.v = 6;
  return payload;
}

function migrateV6toV7(payload) {
  payload.player = payload.player ?? {};
  payload.player.equip = normalizeEquip(payload.player.equip ?? {});
  payload.inv = normalizeInventoryEntries(payload.inv ?? []);
  payload.dynamic = normalizeDynamicEntries(payload.dynamic ?? []);
  payload.shop = payload.shop ?? null;
  payload.v = 7;
  return payload;
}

function importSave(saveStr) {
  try {
    const json = decodeURIComponent(escape(atob(saveStr)));
    let payload = JSON.parse(json);
    if (!payload) return null;

    if (payload.v === 3) payload = migrateV3toV4(payload);
    if (payload.v === 4) payload = migrateV4toV5(payload);
    if (payload.v === 5) payload = migrateV5toV6(payload);
    if (payload.v === 6) payload = migrateV6toV7(payload);
    if (payload.v !== 7) return null;

    const tileOverrides = new Map(payload.tileOv ?? []);
    const world = new World(payload.seed, tileOverrides);

    const state = {
      world,
      player: payload.player,
      seen: new Set(payload.seen ?? []),
      visible: new Set(),
      log: payload.log ?? [],
      entities: new Map(),
      removedIds: new Set(payload.removed ?? []),
      entityOverrides: new Map(payload.entOv ?? []),
      inv: normalizeInventoryEntries(payload.inv ?? []),
      dynamic: new Map(),
      turn: payload.turn ?? 0,
      visitedDoors: new Set(payload.visitedDoors ?? []),
      exploredChunks: new Set(payload.exploredChunks ?? []),
      surfaceLink: payload.surfaceLink ?? null,
      startSpawn: payload.startSpawn ?? null,
      shop: payload.shop ?? null,
    };

    fogEnabled = !!payload.fog;
    minimapEnabled = payload.minimap !== false;

    for (const e of normalizeDynamicEntries(payload.dynamic ?? [])) state.dynamic.set(e.id, e);

    state.player.dead = !!state.player.dead;
    state.player.level = state.player.level ?? 1;
    state.player.xp = Math.max(0, Math.floor(state.player.xp ?? 0));
    state.player.equip = normalizeEquip(state.player.equip ?? {});
    state.player.effects = state.player.effects ?? [];
    state.player.maxHp = state.player.maxHp ?? 1800;
    state.player.hp = clamp(state.player.hp ?? 1800, 0, state.player.maxHp);
    state.surfaceLink = resolveSurfaceLink(state);
    state.startSpawn = state.startSpawn ?? computeInitialDepth0Spawn(world);
    ensureSurfaceLinkTile(state);
    if (state.shop && Array.isArray(state.shop.stock)) {
      state.shop.stock = state.shop.stock
        .map((s) => ({ type: normalizeItemType(s?.type), price: Math.max(1, Math.floor(s?.price ?? 0)) }))
        .filter((s) => ITEM_TYPES[s.type]);
      state.shop.lastRefreshMs = Number.isFinite(state.shop.lastRefreshMs) ? state.shop.lastRefreshMs : Date.now();
      state.shop.nextRefreshMs = Number.isFinite(state.shop.nextRefreshMs) ? state.shop.nextRefreshMs : Date.now();
    } else {
      state.shop = null;
    }
    ensureShopState(state);

    recalcDerivedStats(state);

    hydrateNearby(state);
    renderLog(state);
    renderInventory(state);
    renderEquipment(state);
    renderEffects(state);

    return state;
  } catch {
    return null;
  }
}

function saveNow(state) {
  try { localStorage.setItem(SAVE_KEY, exportSave(state)); } catch {}
}

function loadSaveOrNew() {
  try {
    const s = localStorage.getItem(SAVE_KEY);
    if (s) {
      const loaded = importSave(s);
      if (loaded) return loaded;
    }
  } catch {}

  // Avoid leaking transformed state to any future direct canvas operations.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const g = makeNewGame();
  saveNow(g);
  return g;
}

// ---------- Buttons ----------
document.getElementById("btnNew").addEventListener("click", () => {
  // "New Seed" (new run w/ new seed) â€” confirm
  if (!confirmNewRun()) return;
  closeShopOverlay();
  game = makeNewGame();
  saveNow(game);
});

document.getElementById("btnFog").addEventListener("click", () => {
  fogEnabled = !fogEnabled;
  saveNow(game);
});

document.getElementById("btnReset").addEventListener("click", () => {
  // Hard Reset â€” confirm
  if (!confirmHardReset()) return;
  localStorage.removeItem(SAVE_KEY);
  closeShopOverlay();
  game = makeNewGame();
  saveNow(game);
});

document.getElementById("btnExport").addEventListener("click", async () => {
  const save = exportSave(game);
  try { await navigator.clipboard.writeText(save); alert("Save copied to clipboard."); }
  catch { prompt("Copy this save string:", save); }
});

document.getElementById("btnImport").addEventListener("click", () => {
  const str = prompt("Paste save string:");
  if (!str) return;
  const loaded = importSave(str);
  if (!loaded) return alert("Invalid save.");
  closeShopOverlay();
  game = loaded;
  updateContextActionButton(game);
  updateDeathOverlay(game);
  saveNow(game);
});
shopCloseBtnEl?.addEventListener("click", () => {
  closeShopOverlay();
});
shopTabBuyEl?.addEventListener("click", () => {
  if (!game) return;
  shopUi.mode = "buy";
  renderShopOverlay(game);
});
shopTabSellEl?.addEventListener("click", () => {
  if (!game) return;
  shopUi.mode = "sell";
  renderShopOverlay(game);
});
shopOverlayEl?.addEventListener("click", (e) => {
  if (e.target === shopOverlayEl) closeShopOverlay();
});
contextActionBtn?.addEventListener("click", () => {
  if (!game) return;
  const action = resolveContextAction(game);
  if (!action) return;
  takeTurn(game, action.run());
});
contextPotionBtn?.addEventListener("click", () => {
  if (!game) return;
  takeTurn(game, usePotionFromContext(game));
});
btnRespawnEl?.addEventListener("click", () => {
  if (!game || !game.player?.dead) return;
  closeShopOverlay();
  respawnAtStart(game);
});
btnNewDungeonEl?.addEventListener("click", () => {
  if (!confirmNewDungeonFromDeath()) return;
  closeShopOverlay();
  game = makeNewGame();
  saveNow(game);
});

// ---------- Main ----------
let game = null;

function showFatal(err) {
  console.error(err);
  try {
    if (game?.log) {
      game.log.push(`FATAL: ${err?.message ?? String(err)}`);
      renderLog(game);
    } else {
      logEl.textContent = `FATAL: ${err?.message ?? String(err)}`;
    }
  } catch {}
}

window.addEventListener("error", (e) => showFatal(e.error ?? e.message));
window.addEventListener("unhandledrejection", (e) => showFatal(e.reason ?? e));

try {
  game = loadSaveOrNew();
  updateContextActionButton(game);
  updateDeathOverlay(game);
  renderInventory(game);
  renderEquipment(game);
  renderEffects(game);
  renderLog(game);
  document.addEventListener("keydown", (e) => onKey(game, e));
  // Initialize touch controls (mobile): wire on-screen buttons to existing actions
  function initTouchControls() {
    try {
      const tc = document.getElementById('touchControls');
      if (!tc) return;

      const handleDpad = (dx, dy) => {
        if (!game) return;
        if (dx === 0 && dy === 0) {
          const action = resolveContextAction(game);
          if (action) takeTurn(game, action.run());
        } else {
          takeTurn(game, playerMoveOrAttack(game, dx, dy));
        }
      };

      // Pointer-based input handling with tap-vs-hold semantics for reliable touch
      const activePointers = new Map();
      const initialDelay = 300; // ms before repeating starts
      const repeatInterval = 120; // ms between repeats

      tc.addEventListener('pointerdown', (ev) => {
        try {
          const btn = ev.target.closest && ev.target.closest('.dpad-btn');
          if (!btn) return;
          ev.preventDefault();
          try { btn.setPointerCapture && btn.setPointerCapture(ev.pointerId); } catch {}

          if (btn.classList.contains('dpad-btn')) {
            const dx = Number(btn.dataset.dx || 0);
            const dy = Number(btn.dataset.dy || 0);
            const entry = { btn, type: 'dpad', start: Date.now(), dx, dy, firedRepeat: false };
            entry.initialTimeout = setTimeout(() => {
              // initial delay elapsed: fire first move and start repeating
              try { handleDpad(dx, dy); } catch {}
              entry.firedRepeat = true;
              entry.repeatInterval = setInterval(() => { try { handleDpad(dx, dy); } catch {} }, repeatInterval);
            }, initialDelay);
            activePointers.set(ev.pointerId, entry);
          }
        } catch (e) { /* ignore */ }
      }, { passive: false });

      const finishPointer = (ev, invokeOnTap = true) => {
        try {
          const entry = activePointers.get(ev.pointerId);
          if (!entry) return;
          try { entry.btn.releasePointerCapture && entry.btn.releasePointerCapture(ev.pointerId); } catch {}
          // clear timers
          if (entry.initialTimeout) { clearTimeout(entry.initialTimeout); entry.initialTimeout = null; }
          if (entry.repeatInterval) { clearInterval(entry.repeatInterval); entry.repeatInterval = null; }

          const elapsed = Date.now() - (entry.start || 0);
          if (entry.type === 'dpad') {
            // If the initial delay did not elapse, treat as tap on release
            if (!entry.firedRepeat && elapsed < initialDelay && invokeOnTap) {
              try { handleDpad(entry.dx, entry.dy); } catch {}
            }
          }
          activePointers.delete(ev.pointerId);
        } catch (e) { /* ignore */ }
      };

      tc.addEventListener('pointerup', (ev) => { ev.preventDefault(); finishPointer(ev, true); }, { passive: false });
      tc.addEventListener('pointercancel', (ev) => { finishPointer(ev, false); }, { passive: false });
      // Prevent synthetic clicks from causing double-invoke
      tc.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); }, true);
    } catch (e) { /* ignore */ }
  }

  window.addEventListener('load', initTouchControls);

  function loop() {
    draw(game);
    requestAnimationFrame(loop);
  }
  loop();
} catch (err) {
  showFatal(err);
}

function tryOpenAdjacentDoor(state) {
  const p = state.player;
  const dirs = [[0,-1],[1,0],[0,1],[-1,0]];
  for (const [dx, dy] of dirs) {
    const x = p.x + dx, y = p.y + dy;
    const t = state.world.getTile(x, y, p.z);
    if (t !== DOOR_CLOSED) continue;

    // Opening a closed door does not require checking occupancy
    state.world.setTile(x, y, p.z, DOOR_OPEN);
    pushLog(state, "You open the door.");
    state.visitedDoors?.add(keyXYZ(x, y, p.z));
    return true;
  }
  pushLog(state, "No closed door adjacent to open.");
  return false;
}
