// Infinite Dungeon Roguelike (Explore-Generated, Chunked, Multi-depth)
// v4.5
// - UI/Controls:
//   - "E" is now contextual: interacts with shrines OR uses stairs (up/down) when standing on them.
//   - Confirm prompts for starting a New Run via "R", and for clicking New Seed / Hard Reset buttons.
//     Prompts explain exactly what each action does.

const CHUNK = 32;
const TILE = 16;
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

const SAVE_KEY = "infinite_dungeon_roguelike_save_v4";

// ---------- DOM ----------
const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
const metaEl = document.getElementById("meta");
const logEl = document.getElementById("log");
const invListEl = document.getElementById("invList");
const equipTextEl = document.getElementById("equipText");
const effectsTextEl = document.getElementById("effectsText");

// Right-side panels / wrap toggle
const btnTogglePanels = document.getElementById("btnTogglePanels");
const wrapEl = document.getElementById("wrap");
const rightColEl = document.getElementById("rightCol");

const PANELS_KEY = "dungeon_panels_collapsed_v1";
function setPanelsCollapsed(collapsed, save = true) {
  if (!wrapEl) return;
  wrapEl.classList.toggle("panels-collapsed", !!collapsed);
  if (btnTogglePanels) btnTogglePanels.textContent = collapsed ? "Show UI" : "Hide UI";
  if (save) localStorage.setItem(PANELS_KEY, collapsed ? "1" : "0");
}

if (btnTogglePanels) {
  btnTogglePanels.addEventListener("click", () => {
    const isCollapsed = wrapEl && wrapEl.classList.contains("panels-collapsed");
    setPanelsCollapsed(!isCollapsed, true);
  });
}

// Initialize collapse state from storage or default for small screens
try {
  const saved = localStorage.getItem(PANELS_KEY);
  if (saved !== null) setPanelsCollapsed(saved === "1", false);
  else if (typeof window !== "undefined" && window.innerWidth <= 900) setPanelsCollapsed(true, false);
} catch (e) { /* ignore localStorage errors */ }

const mini = document.getElementById("mini");
const mctx = mini.getContext("2d");

const viewSize = VIEW_RADIUS * 2 + 1;
canvas.width = viewSize * TILE;
canvas.height = viewSize * TILE;

mini.width = (MINI_RADIUS * 2 + 1) * MINI_SCALE;
mini.height = (MINI_RADIUS * 2 + 1) * MINI_SCALE;

let fogEnabled = true;
let minimapEnabled = true;

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
  }
}

function pickLockColor(rng, z) {
  const rW = clamp(8 - z, 2, 8);
  const bW = clamp(2 + Math.floor(z / 2), 2, 8);
  const gW = clamp(Math.floor(z / 3), 1, 6);
  const total = rW + bW + gW;
  let r = rng() * total;
  r -= rW; if (r <= 0) return LOCK_RED;
  r -= bW; if (r <= 0) return LOCK_BLUE;
  return LOCK_GREEN;
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
        const lockChance = clamp(0.03 + z * 0.012, 0, 0.22);
        if (rng() < lockChance) grid[y][x] = pickLockColor(rng, z);
        else grid[y][x] = DOOR_CLOSED;
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

    const lock = pickLockColor(rng, z);
    grid[doorY][doorX] = lock;

    specials.treasure = { lx: x + Math.floor(w / 2), ly: y + Math.floor(h / 2), lock };
    return specials;
  }
  return specials;
}

function tryAddShrineRoom(seedStr, rng, z, grid, anchors) {
  const specials = {};
  const chance = clamp(0.08 + z * 0.006, 0, 0.25);
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
function generateChunk(seedStr, z, cx, cy) {
  const rng = makeRng(`${seedStr}|chunk|z${z}|${cx},${cy}`);
  const grid = newGrid(WALL);

  const edges = {
    N: edgeInfo(seedStr, z, cx, cy, "N"),
    S: edgeInfo(seedStr, z, cx, cy, "S"),
    W: edgeInfo(seedStr, z, cx, cy, "W"),
    E: edgeInfo(seedStr, z, cx, cy, "E"),
  };

  const rooms = [];
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

  for (let i = 1; i < rooms.length; i++)
    carveCorridor(grid, rng, rooms[i - 1].cx, rooms[i - 1].cy, rooms[i].cx, rooms[i].cy);
  if (rooms.length >= 3 && rng() < 0.6)
    carveCorridor(grid, rng, rooms[0].cx, rooms[0].cy, rooms[rooms.length - 1].cx, rooms[rooms.length - 1].cy);

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
    } else if (dir === "S") {
      const x = info.pos;
      grid[CHUNK - 1][x] = DOOR_CLOSED;
      grid[CHUNK - 2][x] = FLOOR;
      const a = nearestAnchor(x, CHUNK - 2);
      carveCorridor(grid, rng, x, CHUNK - 2, a.cx, a.cy);
    } else if (dir === "W") {
      const y = info.pos;
      grid[y][0] = DOOR_CLOSED;
      grid[y][1] = FLOOR;
      const a = nearestAnchor(1, y);
      carveCorridor(grid, rng, 1, y, a.cx, a.cy);
    } else if (dir === "E") {
      const y = info.pos;
      grid[y][CHUNK - 1] = DOOR_CLOSED;
      grid[y][CHUNK - 2] = FLOOR;
      const a = nearestAnchor(CHUNK - 2, y);
      carveCorridor(grid, rng, CHUNK - 2, y, a.cx, a.cy);
    }
  }

  openDoorAt("N"); openDoorAt("S"); openDoorAt("W"); openDoorAt("E");

  ensureChunkConnectivity(grid, rng);
  placeInternalDoors(grid, rng, z);

  const hasStairs = (z === 0 && cx === 0 && cy === 0) || rng() < 0.14;
  if (hasStairs) {
    let best = null, bestD = Infinity;
    const tx = Math.floor(CHUNK / 2), ty = Math.floor(CHUNK / 2);
    for (let y = 2; y < CHUNK - 2; y++) for (let x = 2; x < CHUNK - 2; x++) {
      const t = grid[y][x];
      if (t !== FLOOR && t !== DOOR_CLOSED && t !== DOOR_OPEN) continue;
      const dx = x - tx, dy = y - ty;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = { x, y }; }
    }
    if (best) grid[best.y][best.x] = STAIRS_DOWN;
  }

  const specials = {
    ...tryAddTreasureRoom(seedStr, rng, z, grid, anchors),
    ...tryAddShrineRoom(seedStr, rng, z, grid, anchors),
  };

  return { z, cx, cy, grid, specials };
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
  rat:      { name: "Rat",      maxHp: 6,  atkLo: 1, atkHi: 3, xp: 2,  glyph: "r" },
  goblin:   { name: "Goblin",   maxHp: 10, atkLo: 2, atkHi: 4, xp: 4,  glyph: "g" },
  slime:    { name: "Slime",    maxHp: 14, atkLo: 2, atkHi: 5, xp: 5,  glyph: "s" },
  skeleton: { name: "Skeleton", maxHp: 18, atkLo: 3, atkHi: 6, xp: 8,  glyph: "k" },
  archer:   { name: "Archer",   maxHp: 12, atkLo: 2, atkHi: 4, xp: 7,  glyph: "a", range: 6, cdTurns: 2 },
};

const ITEM_TYPES = {
  potion: { name: "Potion" },
  gold: { name: "Gold" },

  key_red: { name: "Red Key" },
  key_blue: { name: "Blue Key" },
  key_green: { name: "Green Key" },

  chest: { name: "Chest" },
  shrine: { name: "Shrine" },

  weapon_dagger: { name: "Dagger" },
  weapon_sword: { name: "Sword" },
  weapon_axe: { name: "Axe" },

  armor_leather: { name: "Leather Armor" },
  armor_chain: { name: "Chainmail" },
  armor_plate: { name: "Plate Armor" },
};

const WEAPONS = {
  weapon_dagger: { atkBonus: 1 },
  weapon_sword:  { atkBonus: 2 },
  weapon_axe:    { atkBonus: 3 },
};
const ARMORS = {
  armor_leather: { defBonus: 1 },
  armor_chain:   { defBonus: 2 },
  armor_plate:   { defBonus: 3 },
};

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
  if (z <= 2) return [{ id: "rat", w: 7 }, { id: "goblin", w: 3 }];
  if (z <= 6) return [{ id: "rat", w: 3 }, { id: "goblin", w: 6 }, { id: "slime", w: 3 }];
  if (z <= 10) return [{ id: "goblin", w: 3 }, { id: "slime", w: 5 }, { id: "skeleton", w: 3 }, { id: "archer", w: 2 }];
  return [{ id: "slime", w: 4 }, { id: "skeleton", w: 6 }, { id: "archer", w: 4 }];
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
  const rng = makeRng(`${worldSeed}|spawns|z${z}|${cx},${cy}`);

  const depthBoost = clamp(z, 0, 60);

  const monsterCount = clamp(
    randInt(rng, 1, 3) + (rng() < depthBoost / 55 ? 1 : 0) + (rng() < 0.22 ? 1 : 0),
    0,
    7
  );

  const itemCount = clamp(randInt(rng, 1, 3), 0, 4);

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
  for (let i = 0; i < itemCount; i++) {
    const c = cells[monsterCount + i];
    if (!c) break;
    const roll = rng();
    const type = roll < 0.55 ? "potion" : "gold";
    const id = `i|${z}|${cx},${cy}|${i}`;
    const amount = type === "gold" ? randInt(rng, 4, 22) + clamp(z, 0, 30) : 1;
    items.push({ id, type, amount, lx: c.x, ly: c.y });
  }

  if (rng() < clamp(0.22 + z * 0.01, 0.22, 0.45)) {
    const c = cells[monsterCount + itemCount] ?? cells[cells.length - 1];
    if (c) {
      items.push({ id: `chest_extra|${z}|${cx},${cy}`, type: "chest", amount: 1, lx: c.x, ly: c.y });
    }
  }

  if (specials?.treasure) {
    items.push({
      id: `chest|${z}|${cx},${cy}`,
      type: "chest",
      amount: 1,
      lx: specials.treasure.lx,
      ly: specials.treasure.ly,
    });
  }
  if (specials?.shrine) {
    items.push({
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

function isStackable(type) {
  return type === "potion" || type === "key_red" || type === "key_blue" || type === "key_green";
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
  return 8 + level * 6;
}

function recalcDerivedStats(state) {
  const p = state.player;
  const weapon = p.equip.weapon ? WEAPONS[p.equip.weapon] : null;
  const armor = p.equip.armor ? ARMORS[p.equip.armor] : null;

  const effAtk = state.player.effects
    .filter(e => e.type === "bless" || e.type === "curse")
    .reduce((s, e) => s + e.atkDelta, 0);

  p.atkBonus = (weapon?.atkBonus ?? 0) + effAtk;
  p.defBonus = (armor?.defBonus ?? 0);

  p.atkLo = 2 + Math.floor((p.level - 1) / 2);
  p.atkHi = 5 + Math.floor((p.level - 1) / 2);
}

function renderEquipment(state) {
  const p = state.player;
  const w = p.equip.weapon ? (ITEM_TYPES[p.equip.weapon]?.name ?? p.equip.weapon) : "(none)";
  const a = p.equip.armor ? (ITEM_TYPES[p.equip.armor]?.name ?? p.equip.armor) : "(none)";
  equipTextEl.textContent =
    `Weapon: ${w}\nArmor:  ${a}\nATK bonus: ${p.atkBonus >= 0 ? "+" : ""}${p.atkBonus}  DEF: +${p.defBonus}`;
}

function renderEffects(state) {
  const eff = state.player.effects;
  if (!eff.length) {
    effectsTextEl.textContent = "(none)";
    return;
  }
  effectsTextEl.textContent = eff
    .map(e => {
      if (e.type === "regen") return `Regen (+${e.healPerTurn}/turn) — ${e.turnsLeft} turns`;
      if (e.type === "bless") return `Blessing (ATK +${e.atkDelta}) — ${e.turnsLeft} turns`;
      if (e.type === "curse") return `Curse (ATK ${e.atkDelta}) — ${e.turnsLeft} turns`;
      if (e.type === "reveal") return `Revelation — ${e.turnsLeft} turns`;
      return `${e.type} — ${e.turnsLeft} turns`;
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
  state.inv.slice(0, 9).forEach((it, idx) => {
    const row = document.createElement("div");
    row.className = "invItem";
    const left = document.createElement("div");
    const nm = ITEM_TYPES[it.type]?.name ?? it.type;
    left.textContent = `${idx + 1}. ${nm}${isStackable(it.type) ? ` x${it.amount}` : ""}`;
    const btn = document.createElement("button");
    btn.textContent = "Use";
    btn.onclick = () => useInventoryIndex(state, idx);
    row.appendChild(left);
    row.appendChild(btn);
    invListEl.appendChild(row);
  });
}

function makeNewGame(seedStr = randomSeedString()) {
  const world = new World(seedStr);

  const player = {
    x: 0, y: 0, z: 0,
    dead: false,
    level: 1,
    xp: 0,
    hp: 18, maxHp: 18,
    atkLo: 2, atkHi: 5,
    atkBonus: 0,
    defBonus: 0,
    gold: 0,
    equip: { weapon: null, armor: null },
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
  };

  world.ensureChunksAround(0, 0, 0, VIEW_RADIUS + 2);
  const ch = world.getChunk(0, 0, 0);

  const target = { x: Math.floor(CHUNK / 2), y: Math.floor(CHUNK / 2) };
  let best = null, bestD = Infinity;
  for (let y = 1; y < CHUNK - 1; y++) for (let x = 1; x < CHUNK - 1; x++) {
    const t = ch.grid[y][x];
    if (t === WALL) continue;
    const dx = x - target.x, dy = y - target.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = { x, y }; }
  }
  if (best) { player.x = best.x; player.y = best.y; }

  recalcDerivedStats(state);
  pushLog(state, "You enter the dungeon...");
  hydrateNearby(state);
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

    const spec = MONSTER_TYPES[m.type] ?? MONSTER_TYPES.rat;
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
    });
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
  p.xp += amount;
  pushLog(state, `+${amount} XP`);

  while (p.xp >= xpToNext(p.level)) {
    p.xp -= xpToNext(p.level);
    p.level += 1;
    const hpGain = 3 + Math.floor(p.level / 3);
    p.maxHp += hpGain;
    p.hp = clamp(p.hp + hpGain, 0, p.maxHp);
    pushLog(state, `*** Level up! You are now level ${p.level}. (+${hpGain} max HP)`);
  }

  recalcDerivedStats(state);
  renderEquipment(state);
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
  pushLog(state, "YOU DIED. Press R to start a new run.");
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
    const w = z <= 4 ? "weapon_dagger" : z <= 9 ? "weapon_sword" : "weapon_axe";
    invAdd(state, w, 1);
    pushLog(state, `Found a ${ITEM_TYPES[w].name}!`);
  } else if (roll < 0.60) {
    const a = z <= 4 ? "armor_leather" : z <= 9 ? "armor_chain" : "armor_plate";
    invAdd(state, a, 1);
    pushLog(state, `Found ${ITEM_TYPES[a].name}!`);
  } else if (roll < 0.80) {
    invAdd(state, "potion", 1);
    pushLog(state, "Found a Potion!");
  } else {
    const key = z <= 4 ? "key_red"
      : z <= 10 ? (Math.random() < 0.6 ? "key_blue" : "key_red")
      : (Math.random() < 0.55 ? "key_green" : "key_blue");
    invAdd(state, key, 1);
    pushLog(state, `Found a ${ITEM_TYPES[key].name}!`);
    placeMatchingLockedDoorNearPlayer(state, key);
  }
}

// ---------- Player actions ----------
function playerAttack(state, monster) {
  const dmg = playerAttackDamage(state);
  monster.hp -= dmg;
  monster.awake = true;

  if (monster.origin === "base") {
    state.entityOverrides.set(monster.id, { x: monster.x, y: monster.y, z: monster.z, hp: monster.hp, cd: monster.cd ?? 0 });
  }

  pushLog(state, `You hit the ${MONSTER_TYPES[monster.type]?.name ?? monster.type} for ${dmg}.`);

  if (monster.hp <= 0) {
    pushLog(state, `The ${MONSTER_TYPES[monster.type]?.name ?? monster.type} dies.`);

    const xp = MONSTER_TYPES[monster.type]?.xp ?? 2;
    grantXP(state, xp);

    if (monster.origin === "base") {
      state.removedIds.add(monster.id);
      state.entityOverrides.delete(monster.id);
    }

    if (monster.type === "goblin" && Math.random() < 0.30) {
      const key = "key_red";
      spawnDynamicItem(state, key, 1, monster.x, monster.y, monster.z);
      pushLog(state, "It dropped a Red Key!");
      placeMatchingLockedDoorNearPlayer(state, key);
    } else if (monster.type === "archer" && Math.random() < 0.25) {
      const key = "key_blue";
      spawnDynamicItem(state, key, 1, monster.x, monster.y, monster.z);
      pushLog(state, "It dropped a Blue Key!");
      placeMatchingLockedDoorNearPlayer(state, key);
    } else if (monster.type === "skeleton" && Math.random() < 0.20) {
      const drop = Math.random() < 0.5 ? "weapon_sword" : "armor_chain";
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
    const m = state.entities.get(mid);
    if (m) playerAttack(state, m);
    return true;
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

  const { items } = buildOccupancy(state);
  const id = items.get(keyXYZ(p.x, p.y, p.z));
  if (!id) { pushLog(state, "Nothing here to pick up."); return false; }

  const it = state.entities.get(id);
  if (!it) return false;

  if (it.type === "gold") {
    p.gold += it.amount ?? 1;
    pushLog(state, `Picked up ${it.amount} gold.`);
  } else if (it.type === "potion") {
    invAdd(state, "potion", it.amount ?? 1);
    pushLog(state, "Picked up a Potion.");
  } else if (it.type === "key_red" || it.type === "key_blue" || it.type === "key_green") {
    invAdd(state, it.type, it.amount ?? 1);
    pushLog(state, `Picked up a ${ITEM_TYPES[it.type].name}.`);
    placeMatchingLockedDoorNearPlayer(state, it.type);
  } else if (
    it.type === "weapon_dagger" || it.type === "weapon_sword" || it.type === "weapon_axe" ||
    it.type === "armor_leather" || it.type === "armor_chain" || it.type === "armor_plate"
  ) {
    invAdd(state, it.type, 1);
    pushLog(state, `Picked up ${ITEM_TYPES[it.type].name}.`);
  } else if (it.type === "chest") {
    const g = 15 + Math.floor(Math.random() * (25 + clamp(p.z, 0, 25)));
    p.gold += g;
    pushLog(state, `You open the Chest. (+${g} gold)`);
    dropEquipmentFromChest(state);
  } else if (it.type === "shrine") {
    pushLog(state, "A Shrine hums with power. Press E to interact.");
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
    const heal = 6 + Math.floor(Math.random() * 7);
    const before = p.hp;
    p.hp = clamp(p.hp + heal, 0, p.maxHp);
    pushLog(state, `You drink a potion. (+${p.hp - before} HP)`);

    it.amount -= 1;
    if (it.amount <= 0) state.inv.splice(idx, 1);

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
    state.inv.splice(idx, 1);
    if (prev) invAdd(state, prev, 1);
    pushLog(state, `Equipped ${ITEM_TYPES[p.equip.weapon].name}.`);
    recalcDerivedStats(state);
    renderInventory(state);
    renderEquipment(state);
    return;
  }

  if (it.type.startsWith("armor_")) {
    const prev = p.equip.armor;
    p.equip.armor = it.type;
    state.inv.splice(idx, 1);
    if (prev) invAdd(state, prev, 1);
    pushLog(state, `Equipped ${ITEM_TYPES[p.equip.armor].name}.`);
    recalcDerivedStats(state);
    renderInventory(state);
    renderEquipment(state);
    return;
  }

  pushLog(state, "You can't use that right now.");
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

  const { items } = buildOccupancy(state);
  const id = items.get(keyXYZ(p.x, p.y, p.z));
  if (!id) { pushLog(state, "Nothing to interact with here."); return false; }

  const it = state.entities.get(id);
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
    p.effects.push({ type: "bless", atkDelta: +1, turnsLeft: 80 });
    pushLog(state, "Blessing: ATK +1 for 80 turns.");
  } else if (eff.type === "regen") {
    p.effects.push({ type: "regen", healPerTurn: 1, turnsLeft: 60 });
    pushLog(state, "Regen: +1 HP per turn for 60 turns.");
  } else if (eff.type === "curse") {
    p.effects.push({ type: "curse", atkDelta: -1, turnsLeft: 80 });
    pushLog(state, "Curse: ATK -1 for 80 turns.");
  }

  applyReveal(state, 22);
  pushLog(state, "The dungeon’s outline flashes in your mind...");

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

  state.world.ensureChunksAround(p.x, p.y, newZ, VIEW_RADIUS + 2);

  if (direction === "down") {
    carveLandingAndConnect(state, p.x, p.y, newZ, STAIRS_UP);
    pushLog(state, `You descend to depth ${newZ}.`);
  } else {
    carveLandingAndConnect(state, p.x, p.y, newZ, STAIRS_DOWN);
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
    if (p.z <= 0) { pushLog(state, "You can't go up any further."); return false; }
    goToLevel(state, p.z - 1, "up");
    return true;
  }
}

// Contextual interact: stairs first, then shrine
function interactContext(state) {
  const p = state.player;
  if (p.dead) return false;

  const here = state.world.getTile(p.x, p.y, p.z);
  if (here === STAIRS_DOWN) return tryUseStairs(state, "down");
  if (here === STAIRS_UP) return tryUseStairs(state, "up");

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
  const raw = baseDmgLo + Math.floor(Math.random() * (baseDmgHi - baseDmgLo + 1));
  const dmg = reduceIncomingDamage(state, raw);
  state.player.hp -= dmg;
  const nm = MONSTER_TYPES[monster.type]?.name ?? monster.type;
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

    const spec = MONSTER_TYPES[m.type] ?? MONSTER_TYPES.rat;
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
const GLYPH_FONT = `bold ${Math.floor(TILE * 0.78)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace`;
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
function tileGlyph(t) {
  if (t === STAIRS_DOWN) return { g: "▼", c: "#d6f5d6" };
  if (t === STAIRS_UP) return { g: "▲", c: "#e8d6ff" };
  if (t === LOCK_RED) return { g: "R", c: "#ff9a9a" };
  if (t === LOCK_BLUE) return { g: "B", c: "#9ad0ff" };
  if (t === LOCK_GREEN) return { g: "G", c: "#a6ff9a" };
  if (t === DOOR_CLOSED) return { g: "+", c: "#e6d3b3" };
  if (t === DOOR_OPEN) return { g: "/", c: "#b8d6ff" };
  return null;
}
function itemGlyph(type) {
  if (type === "potion") return { g: "!", c: "#ffd37c" };
  if (type === "gold") return { g: "$", c: "#ffe066" };
  if (type === "key_red") return { g: "k", c: "#ff6b6b" };
  if (type === "key_blue") return { g: "k", c: "#6bb8ff" };
  if (type === "key_green") return { g: "k", c: "#7dff6b" };
  if (type === "chest") return { g: "▣", c: "#d9b97a" };
  if (type === "shrine") return { g: "✦", c: "#b8f2e6" };
  if (type?.startsWith("weapon_")) return { g: "†", c: "#d7d0c2" };
  if (type?.startsWith("armor_")) return { g: "⛨", c: "#c0c8d8" };
  return { g: "•", c: "#f4d35e" };
}
function monsterGlyph(type) {
  if (type === "rat") return { g: "r", c: "#ff6b6b" };
  if (type === "goblin") return { g: "g", c: "#ff6b6b" };
  if (type === "slime") return { g: "s", c: "#ff6b6b" };
  if (type === "skeleton") return { g: "K", c: "#ff6b6b" };
  if (type === "archer") return { g: "a", c: "#ffb36b" };
  return { g: "m", c: "#ff6b6b" };
}

function draw(state) {
  computeVisibility(state);
  hydrateNearby(state);

  const { world, player, seen, visible } = state;
  const { monsters, items } = buildOccupancy(state);
  const theme = themeForDepth(player.z);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

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

      const tg = tileGlyph(t);
      if (tg) {
        const col = (isVisible || !fogEnabled) ? tg.c : "rgba(230,230,230,0.45)";
        drawGlyph(ctx, sx, sy, tg.g, col);
      }

      if (isVisible || !fogEnabled) {
        const mk = monsters.get(keyXYZ(wx, wy, player.z));
        const ik = items.get(keyXYZ(wx, wy, player.z));

        if (ik) {
          const ent = state.entities.get(ik);
          ctx.fillStyle =
            ent?.type === "shrine" ? "#b8f2e6" :
            ent?.type === "chest" ? "#d9b97a" :
            ent?.type?.startsWith("key_") ? "#f4d35e" :
            ent?.type?.startsWith("weapon_") ? "#c2b280" :
            ent?.type?.startsWith("armor_") ? "#a0a7b8" :
            "#f4d35e";
          ctx.fillRect(sx * TILE + 6, sy * TILE + 6, TILE - 12, TILE - 12);

          const gi = itemGlyph(ent?.type);
          if (gi) drawGlyph(ctx, sx, sy, gi.g, gi.c);
        }

        if (mk) {
          const ent = state.entities.get(mk);
          ctx.fillStyle = ent?.type === "archer" ? "#ffb36b" : "#ff6b6b";
          ctx.fillRect(sx * TILE + 4, sy * TILE + 4, TILE - 8, TILE - 8);

          const gm = monsterGlyph(ent?.type);
          if (gm) drawGlyph(ctx, sx, sy, gm.g, gm.c);
        }
      }
    }
  }

  ctx.fillStyle = "#7ce3ff";
  ctx.fillRect(VIEW_RADIUS * TILE + 3, VIEW_RADIUS * TILE + 3, TILE - 6, TILE - 6);

  const { cx, cy, lx, ly } = splitWorldToChunk(player.x, player.y);
  metaEl.textContent =
    `seed: ${world.seedStr}  depth: ${player.z}  theme: ${theme.name}\n` +
    `pos: (${player.x}, ${player.y}) chunk: (${cx}, ${cy}) local: (${lx}, ${ly})\n` +
    `HP: ${player.hp}/${player.maxHp}  LVL: ${player.level}  XP: ${player.xp}/${xpToNext(player.level)}\n` +
    `ATK: ${Math.max(1, player.atkLo + player.atkBonus)}-${Math.max(1, player.atkHi + player.atkBonus)}  DEF: +${player.defBonus}  Gold: ${player.gold}`;

  if (player.dead) {
    ctx.fillStyle = theme.overlay;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 26px system-ui, sans-serif";
    ctx.fillText("YOU DIED", 20, 44);
    ctx.font = "14px system-ui, sans-serif";
    ctx.fillText("Press R to start a new run", 20, 68);
  }

  drawMinimap(state);
}

// ---------- Turn handling ----------
function applyEffectsAfterPlayerAction(state) {
  if (!state.player.dead) applyEffectsTick(state);
}

function takeTurn(state, didSpendTurn) {
  if (!didSpendTurn) return;
  state.turn += 1;

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

  if (e.key >= "1" && e.key <= "9") {
    e.preventDefault();
    useInventoryIndex(state, parseInt(e.key, 10) - 1);
    return;
  }

  if (k === "arrowup" || k === "w") { e.preventDefault(); takeTurn(state, playerMoveOrAttack(state, 0, -1)); }
  else if (k === "arrowdown" || k === "s") { e.preventDefault(); takeTurn(state, playerMoveOrAttack(state, 0, 1)); }
  else if (k === "arrowleft" || k === "a") { e.preventDefault(); takeTurn(state, playerMoveOrAttack(state, -1, 0)); }
  else if (k === "arrowright" || k === "d") { e.preventDefault(); takeTurn(state, playerMoveOrAttack(state, 1, 0)); }
  else if (k === "." || k === " " || k === "spacebar") { e.preventDefault(); takeTurn(state, waitTurn(state)); }
  else if (k === "g") { e.preventDefault(); takeTurn(state, pickup(state)); }
  else if (k === "c") { e.preventDefault(); takeTurn(state, tryCloseAdjacentDoor(state)); }

  // E is now contextual: stairs (up/down) OR shrine interaction
  else if (k === "e") { e.preventDefault(); takeTurn(state, interactContext(state)); }

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

// ---------- Key→Locked Door pairing (doorway-only replacement) ----------
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
  if (foundExisting) return;

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
      candidates.push({ x: wx, y: wy, d });
    }
  }

  if (!candidates.length) return;

  candidates.sort((a, b) => a.d - b.d);
  const pick = candidates[Math.floor(candidates.length * 0.65)] ?? candidates[candidates.length - 1];

  state.world.setTile(pick.x, pick.y, z, lockTile);
  pushLog(state, `You sense a matching locked door somewhere nearby...`);
}

// ---------- Save / Load ----------
function exportSave(state) {
  const tileOv = Array.from(state.world.tileOverrides.entries());
  const removed = Array.from(state.removedIds);
  const entOv = Array.from(state.entityOverrides.entries());
  const seen = Array.from(state.seen).slice(0, 60000);
  const dynamic = Array.from(state.dynamic.values());
  const visitedDoors = Array.from(state.visitedDoors ?? []);

  const payload = {
    v: 4,
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
  };

  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
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

function importSave(saveStr) {
  try {
    const json = decodeURIComponent(escape(atob(saveStr)));
    let payload = JSON.parse(json);
    if (!payload) return null;

    if (payload.v === 3) payload = migrateV3toV4(payload);
    if (payload.v !== 4) return null;

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
      inv: payload.inv ?? [],
      dynamic: new Map(),
      turn: payload.turn ?? 0,
      visitedDoors: new Set(payload.visitedDoors ?? []),
    };

    fogEnabled = !!payload.fog;
    minimapEnabled = payload.minimap !== false;

    for (const e of payload.dynamic ?? []) state.dynamic.set(e.id, e);

    state.player.dead = !!state.player.dead;
    state.player.level = state.player.level ?? 1;
    state.player.xp = state.player.xp ?? 0;
    state.player.equip = state.player.equip ?? { weapon: null, armor: null };
    state.player.effects = state.player.effects ?? [];
    state.player.maxHp = state.player.maxHp ?? 18;
    state.player.hp = clamp(state.player.hp ?? 18, 0, state.player.maxHp);

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
  const g = makeNewGame();
  saveNow(g);
  return g;
}

// ---------- Buttons ----------
document.getElementById("btnNew").addEventListener("click", () => {
  // "New Seed" (new run w/ new seed) — confirm
  if (!confirmNewRun()) return;
  game = makeNewGame();
  saveNow(game);
});

document.getElementById("btnFog").addEventListener("click", () => {
  fogEnabled = !fogEnabled;
  saveNow(game);
});

document.getElementById("btnReset").addEventListener("click", () => {
  // Hard Reset — confirm
  if (!confirmHardReset()) return;
  localStorage.removeItem(SAVE_KEY);
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
  game = loaded;
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
  renderInventory(game);
  renderEquipment(game);
  renderEffects(game);
  renderLog(game);
  document.addEventListener("keydown", (e) => onKey(game, e));

  function loop() {
    draw(game);
    requestAnimationFrame(loop);
  }
  loop();
} catch (err) {
  showFatal(err);
}