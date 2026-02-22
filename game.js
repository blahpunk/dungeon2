// Infinite Dungeon Roguelike (Explore-Generated, Chunked, Multi-depth)
// v4.5
// - UI/Controls:
//   - "E" is now contextual: interacts with shrines OR uses stairs (up/down) when standing on them.
//   - Confirm prompts for starting a New Run via "R", and for clicking New Seed / Hard Reset buttons.
//     Prompts explain exactly what each action does.

const CHUNK = 32;
const TILE = 256;
const BASE_VIEW_RADIUS = 14;
const DESKTOP_TARGET_TILE_PX = 42;

const MINI_SCALE = 3;
const MINI_RADIUS = 40;

const WALL = "#";
const FLOOR = ".";
const DOOR_CLOSED = "+";  // blocks movement + LOS, bump opens (spend turn)
const DOOR_OPEN = "/";    // passable, does NOT block LOS
const DOOR_OPEN_RED = "r";
const DOOR_OPEN_GREEN = "g";
const DOOR_OPEN_BLUE = "b";
const DOOR_OPEN_PURPLE = "p";
const DOOR_OPEN_MAGENTA = "m";
const LOCK_RED = "R";
const LOCK_BLUE = "B";
const LOCK_GREEN = "G";
const LOCK_PURPLE = "P";
const LOCK_MAGENTA = "M";
const STAIRS_DOWN = ">";
const STAIRS_UP = "<";
const SURFACE_LEVEL = -1;
const SURFACE_HALF_SIZE = 22;

const KEY_RED = "key_red";
const KEY_GREEN = "key_green";
const KEY_BLUE = "key_blue";
const KEY_PURPLE = "key_purple";
const KEY_MAGENTA = "key_magenta";

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
const headerInfoEl = document.getElementById("headerInfo");
const vitalsDisplayEl = document.getElementById("vitalsDisplay");
const logEl = document.getElementById("log");
const contextActionBtn = document.getElementById("contextActionBtn");
const contextPotionBtn = document.getElementById("contextPotionBtn");
const contextAttackListEl = document.getElementById("contextAttackList");
const depthDisplayEl = document.getElementById("depthDisplay");
const invListEl = document.getElementById("invList");
const equipTextEl = document.getElementById("equipText");
const equipBadgeWeaponEl = document.getElementById("equipBadgeWeapon");
const equipBadgeHeadEl = document.getElementById("equipBadgeHead");
const equipBadgeTorsoEl = document.getElementById("equipBadgeTorso");
const equipBadgeLegsEl = document.getElementById("equipBadgeLegs");
const equipBadgeLabelWeaponEl = document.getElementById("equipBadgeLabelWeapon");
const equipBadgeLabelHeadEl = document.getElementById("equipBadgeLabelHead");
const equipBadgeLabelTorsoEl = document.getElementById("equipBadgeLabelTorso");
const equipBadgeLabelLegsEl = document.getElementById("equipBadgeLabelLegs");
const equipSectionToggleEl = document.getElementById("equipSectionToggle");
const inventorySectionToggleEl = document.getElementById("inventorySectionToggle");
const equipSectionBodyEl = document.getElementById("equipSectionBody");
const inventorySectionBodyEl = document.getElementById("inventorySectionBody");
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
const debugMenuWrapEl = document.getElementById("debugMenuWrap");
const btnDebugMenuEl = document.getElementById("btnDebugMenu");
const debugMenuEl = document.getElementById("debugMenu");
const toggleGodmodeEl = document.getElementById("toggleGodmode");
const toggleFreeShoppingEl = document.getElementById("toggleFreeShopping");
const debugDepthInputEl = document.getElementById("debugDepthInput");
const debugDepthGoEl = document.getElementById("debugDepthGo");
const mainCanvasWrapEl = document.getElementById("mainCanvasWrap");
const surfaceCompassEl = document.getElementById("surfaceCompass");
const surfaceCompassArrowEl = document.getElementById("surfaceCompassArrow");

// Right-side panels: panels are always visible; keep references for layout if needed
const wrapEl = document.getElementById("wrap");
const rightColEl = document.getElementById("rightCol");

const mini = document.getElementById("mini");
const mctx = mini.getContext("2d");

const MAX_RENDER_CANVAS_DIM = 4096;
let viewRadiusX = BASE_VIEW_RADIUS;
let viewRadiusY = BASE_VIEW_RADIUS;
let viewTilesX = viewRadiusX * 2 + 1;
let viewTilesY = viewRadiusY * 2 + 1;
let renderScale = 1;
let viewportSig = "";

function isMobileViewport() {
  const coarse = (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
    (typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || ""));
  const narrow = typeof window !== "undefined" ? window.matchMedia("(max-width: 760px)").matches : false;
  return coarse || narrow;
}
function updateViewportMetrics(force = false) {
  const wrapW = Math.max(1, Math.floor(mainCanvasWrapEl?.clientWidth ?? 0));
  const wrapH = Math.max(1, Math.floor(mainCanvasWrapEl?.clientHeight ?? 0));
  const mobile = isMobileViewport();
  const sig = `${wrapW}x${wrapH}|${mobile}`;
  if (!force && sig === viewportSig) return false;
  viewportSig = sig;

  if (mobile || wrapW <= 2 || wrapH <= 2) {
    viewRadiusX = BASE_VIEW_RADIUS;
    viewRadiusY = BASE_VIEW_RADIUS;
  } else {
    const tilesX = Math.max(BASE_VIEW_RADIUS * 2 + 1, Math.floor(wrapW / DESKTOP_TARGET_TILE_PX));
    const tilesY = Math.max(BASE_VIEW_RADIUS * 2 + 1, Math.floor(wrapH / DESKTOP_TARGET_TILE_PX));
    viewRadiusX = Math.floor((tilesX - 1) / 2);
    viewRadiusY = Math.floor((tilesY - 1) / 2);
  }
  viewTilesX = viewRadiusX * 2 + 1;
  viewTilesY = viewRadiusY * 2 + 1;

  const logicalW = Math.max(1, viewTilesX * TILE);
  const logicalH = Math.max(1, viewTilesY * TILE);
  renderScale = Math.min(1, MAX_RENDER_CANVAS_DIM / Math.max(logicalW, logicalH));
  canvas.width = Math.max(1, Math.floor(logicalW * renderScale));
  canvas.height = Math.max(1, Math.floor(logicalH * renderScale));
  return true;
}
function viewRadiusForChunks() {
  return Math.max(viewRadiusX, viewRadiusY) + 2;
}
updateViewportMetrics(true);

mini.width = (MINI_RADIUS * 2 + 1) * MINI_SCALE;
mini.height = (MINI_RADIUS * 2 + 1) * MINI_SCALE;

let fogEnabled = true;
let minimapEnabled = true;
const shopUi = { open: false, mode: "buy", selectedBuy: 0, selectedSell: 0 };
const overlaySections = { equipmentCollapsed: false, inventoryCollapsed: false };
let contextAuxSignature = "";
const MOBILE_VISIBILITY_BOOST =
  (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
  (typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || ""));

function normalizeDebugFlags(flags) {
  return {
    godmode: !!flags?.godmode,
    freeShopping: !!flags?.freeShopping,
  };
}
function stateDebug(state) {
  state.debug = normalizeDebugFlags(state?.debug);
  return state.debug;
}
function setDebugMenuOpen(open) {
  if (!debugMenuEl) return;
  debugMenuEl.classList.toggle("show", !!open);
  debugMenuEl.setAttribute("aria-hidden", open ? "false" : "true");
  if (btnDebugMenuEl) btnDebugMenuEl.setAttribute("aria-expanded", open ? "true" : "false");
}
function updateDebugMenuUi(state) {
  const d = normalizeDebugFlags(state?.debug);
  if (toggleGodmodeEl) toggleGodmodeEl.checked = d.godmode;
  if (toggleFreeShoppingEl) toggleFreeShoppingEl.checked = d.freeShopping;
  if (debugDepthInputEl) debugDepthInputEl.value = `${state?.player?.z ?? 0}`;
}
function setDebugFlag(state, key, enabled) {
  const d = stateDebug(state);
  const next = !!enabled;
  if (d[key] === next) return;
  d[key] = next;
  if (key === "godmode") pushLog(state, `Godmode ${next ? "enabled" : "disabled"}.`);
  if (key === "freeShopping") pushLog(state, `Free shopping ${next ? "enabled" : "disabled"}.`);
  saveNow(state);
}
function cellHasPassableNeighbor(world, x, y, z) {
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  for (const [dx, dy] of dirs) {
    if (world.isPassable(x + dx, y + dy, z)) return true;
  }
  return false;
}

function findNearestSafeTeleportCell(state, x, y, z, maxRadius = 24) {
  let best = null;
  let bestDist = Infinity;
  for (let dy = -maxRadius; dy <= maxRadius; dy++) {
    for (let dx = -maxRadius; dx <= maxRadius; dx++) {
      const d = Math.abs(dx) + Math.abs(dy);
      if (d > maxRadius || d >= bestDist) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (!state.world.isPassable(nx, ny, z)) continue;
      if (!cellHasPassableNeighbor(state.world, nx, ny, z)) continue;
      best = { x: nx, y: ny };
      bestDist = d;
    }
  }
  return best;
}

function ensureTeleportLanding(state) {
  const p = state.player;
  const safe = findNearestSafeTeleportCell(state, p.x, p.y, p.z, 24);
  if (safe) {
    p.x = safe.x;
    p.y = safe.y;
    return;
  }

  if (p.z === SURFACE_LEVEL) {
    p.x = 0;
    p.y = 0;
    state.world.setTile(0, 0, p.z, STAIRS_DOWN);
    return;
  }

  carveLandingAndConnect(state, p.x, p.y, p.z, FLOOR);
  if (!state.world.isPassable(p.x, p.y, p.z)) state.world.setTile(p.x, p.y, p.z, FLOOR);

  if (!cellHasPassableNeighbor(state.world, p.x, p.y, p.z)) {
    state.world.setTile(p.x + 1, p.y, p.z, FLOOR);
  }
}

function teleportPlayerToDepth(state, targetDepth) {
  const p = state.player;
  if (!p || p.dead) return false;
  if (!Number.isFinite(targetDepth)) return false;

  const newZ = Math.max(SURFACE_LEVEL, Math.trunc(targetDepth));
  if (newZ === p.z) {
    pushLog(state, `Already at depth ${newZ}.`);
    return false;
  }

  state.world.ensureChunksAround(p.x, p.y, newZ, viewRadiusForChunks());
  if (newZ === SURFACE_LEVEL) state.world.ensureChunksAround(0, 0, newZ, 1);

  p.z = newZ;
  ensureTeleportLanding(state);
  if (newZ === 0) ensureSurfaceLinkTile(state);

  hydrateNearby(state);
  renderInventory(state);
  renderEquipment(state);
  renderEffects(state);
  updateContextActionButton(state);
  updateDeathOverlay(state);
  updateDebugMenuUi(state);
  pushLog(state, `Debug: teleported to depth ${newZ}.`);
  saveNow(state);
  return true;
}

function updateOverlaySectionUi() {
  const equipCollapsed = !!overlaySections.equipmentCollapsed;
  const invCollapsed = !!overlaySections.inventoryCollapsed;
  equipSectionBodyEl?.classList.toggle("hidden", equipCollapsed);
  inventorySectionBodyEl?.classList.toggle("hidden", invCollapsed);
  if (equipSectionToggleEl) {
    equipSectionToggleEl.textContent = `Equipment ${equipCollapsed ? "+" : "-"}`;
    equipSectionToggleEl.setAttribute("aria-expanded", equipCollapsed ? "false" : "true");
  }
  if (inventorySectionToggleEl) {
    inventorySectionToggleEl.textContent = `Inventory ${invCollapsed ? "+" : "-"}`;
    inventorySectionToggleEl.setAttribute("aria-expanded", invCollapsed ? "false" : "true");
  }
}

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

function brightenHexColor(hex, amount = 0.2) {
  if (typeof hex !== "string" || hex.charAt(0) !== "#") return hex;
  let s = hex.slice(1);
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  if (s.length !== 6) return hex;
  const n = parseInt(s, 16);
  if (!Number.isFinite(n)) return hex;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lift = (v) => Math.max(0, Math.min(255, Math.round(v + (255 - v) * amount)));
  const rr = lift(r).toString(16).padStart(2, "0");
  const gg = lift(g).toString(16).padStart(2, "0");
  const bb = lift(b).toString(16).padStart(2, "0");
  return `#${rr}${gg}${bb}`;
}

function applyVisibilityBoostToTheme(theme) {
  if (!MOBILE_VISIBILITY_BOOST || !theme) return theme;
  const boosted = { ...theme };
  for (const [k, v] of Object.entries(theme)) {
    if (typeof v !== "string" || v.charAt(0) !== "#") continue;
    const amt = k.endsWith("NV") ? 0.26 : 0.2;
    boosted[k] = brightenHexColor(v, amt);
  }
  return boosted;
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

function isOpenDoorTile(t) {
  return t === DOOR_OPEN ||
    t === DOOR_OPEN_RED ||
    t === DOOR_OPEN_GREEN ||
    t === DOOR_OPEN_BLUE ||
    t === DOOR_OPEN_PURPLE ||
    t === DOOR_OPEN_MAGENTA;
}

// ---------- Themes ----------
function hueWrap(h) {
  let out = h % 360;
  if (out < 0) out += 360;
  return out;
}
function hslColor(h, s, l) {
  return `hsl(${Math.round(hueWrap(h))} ${Math.round(s)}% ${Math.round(l)}%)`;
}
function depthHueName(h) {
  const names = ["Red", "Orange", "Yellow", "Lime", "Green", "Teal", "Cyan", "Azure", "Blue", "Violet", "Magenta", "Rose"];
  const idx = Math.floor(hueWrap(h) / 30) % names.length;
  return names[idx];
}
function themeForDepth(z) {
  if (z <= SURFACE_LEVEL) {
    return {
      name: "Surface",
      wallV: "#455a52", wallNV: "#2a3832",
      floorV: "#8da380", floorNV: "#6e8462",
      doorC_V: "#6e5a3e", doorC_NV: "#4a3b29",
      doorO_V: "#4f7b63", doorO_NV: "#375241",
      lockR_V: "#8e4040", lockR_NV: "#5a2626",
      lockB_V: "#40688e", lockB_NV: "#26415a",
      lockG_V: "#3f8e55", lockG_NV: "#275a37",
      lockP_V: "#7d4aa8", lockP_NV: "#4b2c64",
      lockM_V: "#a83f8c", lockM_NV: "#632553",
      downV: "#7b6a3d", downNV: "#514528",
      upV: "#6c5a80", upNV: "#453a52",
      overlay: "rgba(0,0,0,0.35)",
    };
  }

  const depth = Math.max(0, z);
  const hue = (depth * 28) % 360;
  const wallHue = hue + 18;
  const floorHue = hue;
  const doorHue = hue + 34;
  const downHue = hue + 58;
  const upHue = hue - 52;

  return {
    name: `${depthHueName(hue)} Depth`,
    wallV: hslColor(wallHue, 24, 28),
    wallNV: hslColor(wallHue, 20, 17),
    floorV: hslColor(floorHue, 42, 18),
    floorNV: hslColor(floorHue, 34, 11),
    doorC_V: hslColor(doorHue, 40, 24),
    doorC_NV: hslColor(doorHue, 32, 14),
    doorO_V: hslColor(doorHue + 18, 36, 27),
    doorO_NV: hslColor(doorHue + 18, 30, 16),
    lockR_V: hslColor(0, 58, 26),
    lockR_NV: hslColor(0, 45, 15),
    lockB_V: hslColor(214, 56, 30),
    lockB_NV: hslColor(214, 42, 17),
    lockG_V: hslColor(132, 52, 28),
    lockG_NV: hslColor(132, 40, 16),
    lockP_V: hslColor(276, 58, 32),
    lockP_NV: hslColor(276, 46, 19),
    lockM_V: hslColor(320, 62, 33),
    lockM_NV: hslColor(320, 48, 20),
    downV: hslColor(downHue, 42, 25),
    downNV: hslColor(downHue, 34, 15),
    upV: hslColor(upHue, 38, 27),
    upNV: hslColor(upHue, 30, 16),
    overlay: "rgba(0,0,0,0.52)",
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
  if (tileIsLocked(t)) return true;
  return false;
}

function floodConnected(grid, sx, sy) {
  const passable = (t) => t === FLOOR || isOpenDoorTile(t) || t === STAIRS_DOWN || t === STAIRS_UP;
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
  const passable = (t) => t === FLOOR || isOpenDoorTile(t) || t === STAIRS_DOWN || t === STAIRS_UP;
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

function placeInternalDoors(grid, rng, z) {
  const floorish = (t) => t === FLOOR || isOpenDoorTile(t) || t === STAIRS_DOWN || t === STAIRS_UP;
  for (let y = 1; y < CHUNK - 1; y++) {
    for (let x = 1; x < CHUNK - 1; x++) {
      if (grid[y][x] !== WALL) continue;
      const n = grid[y - 1][x], s = grid[y + 1][x], w = grid[y][x - 1], e = grid[y][x + 1];
      const ns = floorish(n) && floorish(s) && w === WALL && e === WALL;
      const we = floorish(w) && floorish(e) && n === WALL && s === WALL;
      if ((ns || we) && rng() < 0.62) {
        // Keep base generation as regular connector doors; locks are applied via proximity conversion.
        grid[y][x] = DOOR_CLOSED;
      }
    }
  }
}

function chunkDoorAxis(grid, x, y) {
  const n = grid[y - 1]?.[x];
  const s = grid[y + 1]?.[x];
  const w = grid[y]?.[x - 1];
  const e = grid[y]?.[x + 1];
  const ns = chunkFloorishTile(n) && chunkFloorishTile(s) && w === WALL && e === WALL;
  if (ns) return { a: { x, y: y - 1, dx: 0, dy: -1 }, b: { x, y: y + 1, dx: 0, dy: 1 } };
  const we = chunkFloorishTile(w) && chunkFloorishTile(e) && n === WALL && s === WALL;
  if (we) return { a: { x: x - 1, y, dx: -1, dy: 0 }, b: { x: x + 1, y, dx: 1, dy: 0 } };
  return null;
}

function chunkFloorishTile(t) {
  return t === FLOOR || isOpenDoorTile(t) || t === STAIRS_DOWN || t === STAIRS_UP;
}

function chunkTopologyWalkableTile(t) {
  return t === FLOOR || isOpenDoorTile(t) || t === DOOR_CLOSED || t === STAIRS_DOWN || t === STAIRS_UP;
}

function chunkDoorwayCandidate(grid, x, y) {
  if (x <= 0 || y <= 0 || x >= CHUNK - 1 || y >= CHUNK - 1) return false;
  if (grid[y][x] !== DOOR_CLOSED) return false;
  return !!chunkDoorAxis(grid, x, y);
}

function chunkDoorIsChokepoint(grid, x, y, maxRadius = 18, maxNodes = 1500) {
  if (!chunkDoorwayCandidate(grid, x, y)) return false;
  const axis = chunkDoorAxis(grid, x, y);
  if (!axis) return false;
  const start = { x: axis.a.x, y: axis.a.y };
  const goal = { x: axis.b.x, y: axis.b.y };

  const q = [start];
  const seen = new Set([keyXY(start.x, start.y)]);
  let nodes = 0;

  while (q.length && nodes++ < maxNodes) {
    const cur = q.shift();
    if (cur.x === goal.x && cur.y === goal.y) return false;

    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (!inBounds(nx, ny)) continue;
      if (nx === x && ny === y) continue;
      if (Math.abs(nx - x) + Math.abs(ny - y) > maxRadius) continue;
      if (!chunkTopologyWalkableTile(grid[ny][nx])) continue;
      const k = keyXY(nx, ny);
      if (seen.has(k)) continue;
      seen.add(k);
      q.push({ x: nx, y: ny });
    }
  }
  return true;
}

function findRewardChestCellForDoor(grid, door, usedCells) {
  const axis = chunkDoorAxis(grid, door.x, door.y);
  if (!axis) return null;

  const center = (CHUNK - 1) / 2;
  const sides = [axis.a, axis.b]
    .map((s) => ({
      ...s,
      score: Math.abs(s.x - center) + Math.abs(s.y - center),
    }))
    .sort((a, b) => b.score - a.score);

  const suitable = (x, y) => {
    if (!inBounds(x, y)) return false;
    const t = grid[y][x];
    if (t !== FLOOR && !isOpenDoorTile(t)) return false;
    if (t === STAIRS_DOWN || t === STAIRS_UP) return false;
    if (usedCells.has(keyXY(x, y))) return false;
    return true;
  };

  for (const side of sides) {
    for (let step = 1; step <= 6; step++) {
      const x = door.x + side.dx * step;
      const y = door.y + side.dy * step;
      if (!inBounds(x, y)) break;
      const t = grid[y][x];
      if (t === WALL || t === DOOR_CLOSED || tileIsLocked(t)) break;
      if (suitable(x, y)) return { x, y };
    }
  }

  for (const side of sides) {
    for (let ry = -2; ry <= 2; ry++) {
      for (let rx = -2; rx <= 2; rx++) {
        const x = side.x + rx;
        const y = side.y + ry;
        if (Math.abs(rx) + Math.abs(ry) > 3) continue;
        if (!suitable(x, y)) continue;
        return { x, y };
      }
    }
  }
  return null;
}

function applyLockedDoorChokepoints(grid, rng, z) {
  const candidates = [];
  const center = (CHUNK - 1) / 2;
  for (let y = 1; y < CHUNK - 1; y++) {
    for (let x = 1; x < CHUNK - 1; x++) {
      if (!chunkDoorwayCandidate(grid, x, y)) continue;
      if (!chunkDoorIsChokepoint(grid, x, y)) continue;
      const dCenter = Math.abs(x - center) + Math.abs(y - center);
      candidates.push({ x, y, dCenter });
    }
  }
  if (!candidates.length) return [];

  candidates.sort((a, b) => (b.dCenter - a.dCenter) || (rng() < 0.5 ? -1 : 1));

  const desiredBase = 1 + Math.floor(Math.max(0, z) / 5);
  const desired = clamp(desiredBase + (rng() < 0.55 ? 1 : 0), 1, 6);
  const densityCap = Math.max(1, Math.floor(candidates.length * 0.55));
  const targetCount = Math.min(candidates.length, Math.max(1, Math.min(desired, densityCap)));

  const chosen = [];
  for (const cand of candidates) {
    if (chosen.some((c) => Math.abs(c.x - cand.x) + Math.abs(c.y - cand.y) < 5)) continue;
    chosen.push(cand);
    if (chosen.length >= targetCount) break;
  }
  if (chosen.length < targetCount) {
    for (const cand of candidates) {
      if (chosen.find((c) => c.x === cand.x && c.y === cand.y)) continue;
      chosen.push(cand);
      if (chosen.length >= targetCount) break;
    }
  }

  const usedChestCells = new Set();
  const rewards = [];
  for (const cand of chosen) {
    const keyType = keyTypeForDepth(z, rng);
    const lockTile = keyTypeToLockTile(keyType);
    grid[cand.y][cand.x] = lockTile;

    const chestCell = findRewardChestCellForDoor(grid, cand, usedChestCells);
    if (!chestCell) continue;
    usedChestCells.add(keyXY(chestCell.x, chestCell.y));
    rewards.push({
      keyType,
      chestX: chestCell.x,
      chestY: chestCell.y,
      lootDepth: Math.max(z + 2, z + randInt(rng, 2, 5)),
    });
  }
  return rewards;
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
      if (t !== FLOOR && t !== DOOR_CLOSED && !isOpenDoorTile(t)) continue;
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
  const lockedDoorRewards = applyLockedDoorChokepoints(grid, rng, z);
  const specialRoomCount = (specials.treasure ? 1 : 0) + (specials.shrine ? 1 : 0);
  const specialCorridorCount = specialRoomCount; // each special room uses one connector corridor
  const explore = {
    rooms: roomCount + specialRoomCount,
    corridors: corridorCount + specialCorridorCount,
  };

  return { z, cx, cy, grid, specials, explore, lockedDoorRewards };
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
    return t === FLOOR || isOpenDoorTile(t) || t === STAIRS_DOWN || t === STAIRS_UP;
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

const METAL_TIERS = [
  { id: "wood", name: "Wood", color: "#8B5A2B", atkBonus: -30, defBonus: 0, unlockDepth: 0, rampDepth: 2, maxWeight: 42 },
  { id: "bronze", name: "Bronze", color: "#CD7F32", atkBonus: 0, defBonus: 40, unlockDepth: 0, rampDepth: 2, maxWeight: 38 },
  { id: "iron", name: "Iron", color: "#5A5F66", atkBonus: 120, defBonus: 150, unlockDepth: 0, rampDepth: 3, maxWeight: 34 },
  { id: "steel", name: "Steel", color: "#B0B7C1", atkBonus: 260, defBonus: 250, unlockDepth: 3, rampDepth: 4, maxWeight: 28 },
  { id: "silversteel", name: "Silversteel", color: "#E8F0FF", atkBonus: 390, defBonus: 360, unlockDepth: 8, rampDepth: 5, maxWeight: 20 },
  { id: "storm_alloy", name: "Storm Alloy", color: "#4DA6FF", atkBonus: 530, defBonus: 480, unlockDepth: 14, rampDepth: 6, maxWeight: 16 },
  { id: "sunforged_alloy", name: "Sunforged Alloy", color: "#FFC94D", atkBonus: 680, defBonus: 610, unlockDepth: 21, rampDepth: 7, maxWeight: 13 },
  { id: "embersteel", name: "Embersteel", color: "#D9381E", atkBonus: 840, defBonus: 750, unlockDepth: 29, rampDepth: 8, maxWeight: 11 },
  { id: "star_metal", name: "Star Metal", color: "#6C7B8B", atkBonus: 1010, defBonus: 900, unlockDepth: 38, rampDepth: 9, maxWeight: 9 },
  { id: "nightsteel", name: "Nightsteel", color: "#1A1F2E", atkBonus: 1190, defBonus: 1060, unlockDepth: 49, rampDepth: 10, maxWeight: 8 },
  { id: "heartstone_alloy", name: "Heartstone Alloy", color: "#C43C7A", atkBonus: 1380, defBonus: 1230, unlockDepth: 61, rampDepth: 11, maxWeight: 7 },
  { id: "aether_alloy", name: "Aether Alloy", color: "#E0FFF7", atkBonus: 1580, defBonus: 1410, unlockDepth: 74, rampDepth: 12, maxWeight: 6 },
  { id: "prime_metal", name: "Prime Metal", color: "#F4F1D0", atkBonus: 1790, defBonus: 1600, unlockDepth: 88, rampDepth: 14, maxWeight: 5 },
  { id: "nullmetal", name: "Nullmetal", color: "#2B2B2B", atkBonus: 2010, defBonus: 1800, unlockDepth: 103, rampDepth: 16, maxWeight: 4 },
  { id: "dungeoncore_alloy", name: "Dungeoncore Alloy", color: "#6B2DFF", atkBonus: 2240, defBonus: 2010, unlockDepth: 109, rampDepth: 18, maxWeight: 3 },
  { id: "azhurite_prime", name: "Azhurite Prime", color: "#00BFFF", atkBonus: 2480, defBonus: 2230, unlockDepth: 114, rampDepth: 20, maxWeight: 2 },
  { id: "deepcore_metal", name: "Deepcore Metal", color: "#8B0000", atkBonus: 2730, defBonus: 2460, unlockDepth: 118, rampDepth: 22, maxWeight: 2 },
  { id: "singularity_steel", name: "Singularity Steel", color: "#7A00CC", atkBonus: 2990, defBonus: 2700, unlockDepth: 120, rampDepth: 24, maxWeight: 1 },
];
const MATERIAL_DEPTH_WINDOWS = {
  // Early game hard cutoffs requested: wood <= 1, iron <= 4, steel <= 6.
  wood: { minDepth: 0, peakDepth: 0, maxDepth: 1, peakWeight: 44 },
  bronze: { minDepth: 0, peakDepth: 1, maxDepth: 3, peakWeight: 40 },
  iron: { minDepth: 0, peakDepth: 2, maxDepth: 4, peakWeight: 46 },
  steel: { minDepth: 2, peakDepth: 4, maxDepth: 6, peakWeight: 38 },
  silversteel: { minDepth: 4, peakDepth: 7, maxDepth: 10, peakWeight: 30 },
  storm_alloy: { minDepth: 6, peakDepth: 10, maxDepth: 15, peakWeight: 27 },
  sunforged_alloy: { minDepth: 9, peakDepth: 14, maxDepth: 21, peakWeight: 23 },
  embersteel: { minDepth: 13, peakDepth: 19, maxDepth: 28, peakWeight: 20 },
  star_metal: { minDepth: 18, peakDepth: 26, maxDepth: 36, peakWeight: 17 },
  nightsteel: { minDepth: 24, peakDepth: 33, maxDepth: 45, peakWeight: 15 },
  heartstone_alloy: { minDepth: 31, peakDepth: 42, maxDepth: 56, peakWeight: 13 },
  aether_alloy: { minDepth: 39, peakDepth: 52, maxDepth: 68, peakWeight: 12 },
  prime_metal: { minDepth: 48, peakDepth: 63, maxDepth: 81, peakWeight: 10 },
  nullmetal: { minDepth: 58, peakDepth: 75, maxDepth: 95, peakWeight: 8 },
  dungeoncore_alloy: { minDepth: 70, peakDepth: 89, maxDepth: 108, peakWeight: 7 },
  azhurite_prime: { minDepth: 82, peakDepth: 101, maxDepth: 116, peakWeight: 5 },
  deepcore_metal: { minDepth: 93, peakDepth: 112, maxDepth: 122, peakWeight: 4 },
  singularity_steel: { minDepth: 105, peakDepth: 126, maxDepth: Number.POSITIVE_INFINITY, peakWeight: 3 },
};
const MATERIAL_BY_ID = Object.fromEntries(METAL_TIERS.map((m) => [m.id, m]));
const MATERIAL_COLOR_BY_ID = Object.fromEntries(METAL_TIERS.map((m) => [m.id, m.color]));
const WEAPON_MATERIALS = METAL_TIERS.map((m) => m.id);
const WEAPON_KINDS = ["dagger", "sword", "axe"];
const ARMOR_MATERIALS = METAL_TIERS.map((m) => m.id);
const ARMOR_SLOTS = ["head", "chest", "legs"];

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
const WEAPON_MATERIAL_ATK = Object.fromEntries(METAL_TIERS.map((m) => [m.id, m.atkBonus]));
const ARMOR_MATERIAL_DEF = Object.fromEntries(METAL_TIERS.map((m) => [m.id, m.defBonus]));
const ARMOR_SLOT_DEF = {
  head: 70,
  chest: 130,
  legs: 90,
};

function capWord(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function titleFromId(s) { return String(s ?? "").split("_").map(capWord).join(" "); }
function materialLabel(material) { return MATERIAL_BY_ID[material]?.name ?? titleFromId(material); }
function weaponType(material, kind) { return `weapon_${material}_${kind}`; }
function armorType(material, slot) { return `armor_${material}_${slot}`; }

const ITEM_TYPES = {
  potion: { name: "Potion" },
  gold: { name: "Gold" },
  shopkeeper: { name: "Shopkeeper" },

  key_red: { name: "Red Key" },
  key_green: { name: "Green Key" },
  key_blue: { name: "Blue Key" },
  key_purple: { name: "Purple Key" },
  key_magenta: { name: "Magenta Key" },

  chest: { name: "Chest" },
  shrine: { name: "Shrine" },
};

const WEAPONS = {};
for (const material of WEAPON_MATERIALS) {
  for (const kind of WEAPON_KINDS) {
    const id = weaponType(material, kind);
    ITEM_TYPES[id] = { name: `${materialLabel(material)} ${WEAPON_KIND_LABEL[kind]}` };
    WEAPONS[id] = { atkBonus: WEAPON_KIND_ATK[kind] + WEAPON_MATERIAL_ATK[material] };
  }
}

const ARMOR_PIECES = {};
for (const material of ARMOR_MATERIALS) {
  for (const slot of ARMOR_SLOTS) {
    const id = armorType(material, slot);
    const slotLabel = slot === "head" ? "Helmet" : (slot === "chest" ? "Chestplate" : "Platelegs");
    ITEM_TYPES[id] = { name: `${materialLabel(material)} ${slotLabel}` };
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
  armor_leather: armorType("wood", "chest"),
  armor_leather_chest: armorType("wood", "chest"),
  armor_leather_legs: armorType("wood", "legs"),
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

function depthWindowWeight(depth, window) {
  if (!window) return 0;
  const min = Math.max(0, Math.floor(window.minDepth ?? 0));
  const peak = Math.max(min, Math.floor(window.peakDepth ?? min));
  const maxRaw = window.maxDepth ?? Number.POSITIVE_INFINITY;
  const max = Number.isFinite(maxRaw) ? Math.max(peak, Math.floor(maxRaw)) : Number.POSITIVE_INFINITY;
  if (depth < min || depth > max) return 0;

  const peakWeight = Math.max(1, Math.floor(window.peakWeight ?? 1));
  if (!Number.isFinite(max) || (min === peak && peak === max)) return peakWeight;
  if (depth === peak) return peakWeight;

  if (depth < peak) {
    const denom = Math.max(1, peak - min);
    const t = (depth - min) / denom;
    return Math.max(1, Math.round(1 + (peakWeight - 1) * t));
  }

  if (!Number.isFinite(max)) return peakWeight;
  const denom = Math.max(1, max - peak);
  const t = (max - depth) / denom;
  return Math.max(1, Math.round(1 + (peakWeight - 1) * t));
}

function fallbackMaterialForDepth(depth) {
  if (depth <= 1) return "wood";
  if (depth <= 3) return "bronze";
  if (depth <= 4) return "iron";
  if (depth <= 6) return "steel";
  return METAL_TIERS[METAL_TIERS.length - 1].id;
}

function materialWeightsForDepth(z) {
  const depth = Math.max(0, Math.floor(z));
  const weighted = [];
  for (const tier of METAL_TIERS) {
    const w = depthWindowWeight(depth, MATERIAL_DEPTH_WINDOWS[tier.id]);
    if (w > 0) weighted.push({ id: tier.id, w });
  }

  if (weighted.length > 0) return weighted;
  return [{ id: fallbackMaterialForDepth(depth), w: 1 }];
}

function weaponMaterialWeightsForDepth(z) {
  return materialWeightsForDepth(z);
}

function armorMaterialWeightsForDepth(z) {
  return materialWeightsForDepth(z);
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
  const slot = weightedPick(rng, [
    { id: "head", w: 20 },
    { id: "chest", w: 45 },
    { id: "legs", w: 35 },
  ]);
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

function shopProgressScore(state) {
  const depthScore = Math.max(0, state.player.z);
  const levelScore = Math.max(0, Math.floor((state.player.level - 1) * 0.9));
  return depthScore + levelScore;
}

function shopCatalogForDepth(depth) {
  const d = Math.max(0, depth);
  const items = [{ type: "potion", w: Math.max(6, 14 - Math.floor(d / 16)) }];

  const weaponMats = weaponMaterialWeightsForDepth(d);
  for (const mat of weaponMats) {
    for (const kind of WEAPON_KINDS) {
      const mul = kind === "sword" ? 1.1 : (kind === "axe" ? 1.0 : 0.95);
      items.push({
        type: weaponType(mat.id, kind),
        w: Math.max(1, Math.round(mat.w * mul)),
      });
    }
  }

  const armorMats = armorMaterialWeightsForDepth(d);
  for (const mat of armorMats) {
    for (const slot of ARMOR_SLOTS) {
      const mul = slot === "chest" ? 1 : 0.92;
      items.push({
        type: armorType(mat.id, slot),
        w: Math.max(1, Math.round(mat.w * mul)),
      });
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

function buildShopStockEntry(type, depth) {
  const amount = type === "potion" ? randInt(Math.random, 1, 5) : 1;
  return { type, price: shopBuyPrice(type, depth), amount };
}

function ensureShopState(state) {
  if (state.shop) return;
  const now = Date.now();
  const depth = shopProgressScore(state);
  const catalog = shopCatalogForDepth(depth);
  const size = clamp(10 + Math.floor(depth / 2), 10, Math.min(17, catalog.length));
  const types = drawUniqueWeightedItems(Math.random, catalog, size);
  state.shop = {
    stock: types.map((type) => buildShopStockEntry(type, depth)),
    lastRefreshMs: now,
    nextRefreshMs: now + randInt(Math.random, 5, 15) * 60 * 1000,
  };
}

function refreshShopStock(state, force = false) {
  ensureShopState(state);
  const now = Date.now();
  if (!force && now < (state.shop?.nextRefreshMs ?? 0)) return false;

  const depth = shopProgressScore(state);
  const catalog = shopCatalogForDepth(depth);
  const targetCount = clamp(10 + Math.floor(depth / 2), 10, Math.min(17, catalog.length));
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

  state.shop.stock = nextTypes.map((type) => buildShopStockEntry(type, depth));
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
      if (isBuyMode) btn.textContent = `${idx + 1}. ${nm} x${Math.max(1, entry.amount ?? 1)} - ${entry.price}g`;
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
  if (isBuyMode) details.push(`Stock: ${Math.max(1, selected.amount ?? 1)}`);
  if (!isBuyMode) details.push(`Inventory: ${selected.amount}`);
  details.push(`Value: ${itemMarketValue(selected.type)}g`);

  if (shopDetailTitleEl) shopDetailTitleEl.textContent = selectedName;
  if (shopDetailBodyEl) {
    const freeShopping = !!stateDebug(state).freeShopping;
    const actionLine = isBuyMode
      ? (freeShopping ? "Buy price: FREE" : `Buy price: ${selected.price}g`)
      : `Sell price: ${selected.price}g`;
    shopDetailBodyEl.textContent = `${details.join("\n")}\n${actionLine}`;
  }
  if (!shopActionBtnEl) return;
  shopActionBtnEl.textContent = isBuyMode ? "Buy Selected" : "Sell One";
  shopActionBtnEl.disabled = !selected || (!isBuyMode && selected.amount <= 0);
  shopActionBtnEl.onclick = () => {
    const currentStock = state.shop?.stock ?? [];
    const currentSellable = getSellableInventory(state);
    const liveIsBuyMode = shopUi.mode === "buy";
    const liveEntries = liveIsBuyMode ? currentStock : currentSellable;
    const liveIndex = liveIsBuyMode ? shopUi.selectedBuy : shopUi.selectedSell;
    const liveSelected = liveEntries[liveIndex] ?? null;
    if (!liveSelected) return;
    const liveSelectedName = ITEM_TYPES[liveSelected.type]?.name ?? liveSelected.type;

    if (liveIsBuyMode) {
      const freeShopping = !!stateDebug(state).freeShopping;
      if (!freeShopping && state.player.gold < liveSelected.price) {
        pushLog(state, "Not enough gold.");
      } else {
        if (!freeShopping) state.player.gold -= liveSelected.price;
        invAdd(state, liveSelected.type, 1);
        const left = Math.max(0, (liveSelected.amount ?? 1) - 1);
        liveSelected.amount = left;
        if (left <= 0) {
          currentStock.splice(liveIndex, 1);
          if (shopUi.selectedBuy >= currentStock.length) shopUi.selectedBuy = Math.max(0, currentStock.length - 1);
        }
        if (freeShopping) pushLog(state, `Bought ${liveSelectedName} for free.`);
        else pushLog(state, `Bought ${liveSelectedName} for ${liveSelected.price} gold.`);
      }
    } else {
      if (!invConsume(state, liveSelected.type, 1)) {
        pushLog(state, "Couldn't complete that sale.");
      } else {
        state.player.gold += liveSelected.price;
        pushLog(state, `Sold ${liveSelectedName} for ${liveSelected.price} gold.`);
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

function keyWeightsForDepth(z) {
  const d = Math.max(0, z | 0);
  if (d <= 1) return [
    { id: KEY_RED, w: 70 },
    { id: KEY_GREEN, w: 20 },
    { id: KEY_BLUE, w: 8 },
    { id: KEY_PURPLE, w: 2 },
    { id: KEY_MAGENTA, w: 1 },
  ];
  if (d <= 4) return [
    { id: KEY_RED, w: 56 },
    { id: KEY_GREEN, w: 24 },
    { id: KEY_BLUE, w: 14 },
    { id: KEY_PURPLE, w: 5 },
    { id: KEY_MAGENTA, w: 1 },
  ];
  if (d <= 10) return [
    { id: KEY_RED, w: 42 },
    { id: KEY_GREEN, w: 25 },
    { id: KEY_BLUE, w: 20 },
    { id: KEY_PURPLE, w: 10 },
    { id: KEY_MAGENTA, w: 3 },
  ];
  if (d <= 20) return [
    { id: KEY_RED, w: 30 },
    { id: KEY_GREEN, w: 24 },
    { id: KEY_BLUE, w: 24 },
    { id: KEY_PURPLE, w: 16 },
    { id: KEY_MAGENTA, w: 6 },
  ];
  return [
    { id: KEY_RED, w: 22 },
    { id: KEY_GREEN, w: 22 },
    { id: KEY_BLUE, w: 24 },
    { id: KEY_PURPLE, w: 20 },
    { id: KEY_MAGENTA, w: 10 },
  ];
}

function keyTypeForDepth(z, rng = Math.random) {
  return weightedChoice(rng, keyWeightsForDepth(z));
}

function keyRarityFactor(keyType) {
  if (keyType === KEY_RED) return 1.0;
  if (keyType === KEY_GREEN) return 0.78;
  if (keyType === KEY_BLUE) return 0.58;
  if (keyType === KEY_PURPLE) return 0.38;
  if (keyType === KEY_MAGENTA) return 0.22;
  return 0.5;
}

function samplePassableCellsInChunk(grid, rng, count) {
  const passable = (t) => t === FLOOR || isOpenDoorTile(t) || t === DOOR_CLOSED || t === STAIRS_DOWN || t === STAIRS_UP;
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
  const { z, cx, cy, grid, specials, lockedDoorRewards = [] } = chunk;
  if (z === SURFACE_LEVEL || chunk.surface) return { monsters: [], items: [] };
  const rng = makeRng(`${worldSeed}|spawns|z${z}|${cx},${cy}`);
  const isOpenCell = (x, y) => {
    const t = grid[y]?.[x];
    return t === FLOOR || isOpenDoorTile(t) || t === STAIRS_DOWN || t === STAIRS_UP;
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

  // Reward chests beyond generated locked chokepoint doors.
  for (let i = 0; i < lockedDoorRewards.length; i++) {
    const reward = lockedDoorRewards[i];
    const cxr = clamp(reward.chestX ?? 0, 1, CHUNK - 2);
    const cyr = clamp(reward.chestY ?? 0, 1, CHUNK - 2);
    if (isOpenCell(cxr, cyr) && !occupiedItemCells.has(cellKey(cxr, cyr))) {
      pushItem({
        id: `chest_lock_reward|${z}|${cx},${cy}|${i}`,
        type: "chest",
        amount: 1,
        lx: cxr,
        ly: cyr,
        rewardChest: true,
        lootDepth: Math.max(z + 1, Math.floor(reward.lootDepth ?? (z + 2))),
        lockKeyType: reward.keyType ?? keyTypeForDepth(z, rng),
      });
    }

    const keyType = reward.keyType ?? keyTypeForDepth(z, rng);
    const keyChance = clamp(0.20 * keyRarityFactor(keyType) + 0.12, 0.10, 0.32);
    if (rng() < keyChance) {
      const near = findOpenCellNear(cxr, cyr, 10);
      if (near) {
        pushItem({
          id: `key_lock_reward|${z}|${cx},${cy}|${i}`,
          type: keyType,
          amount: 1,
          lx: near.x,
          ly: near.y,
        });
      }
    }
  }

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

function stairContextLabel(state, dir) {
  const z = state?.player?.z ?? 0;
  if (dir === "down" && z === SURFACE_LEVEL) return "Enter dungeon";
  if (dir === "up" && z === 0) return "Ascend to surface";
  return dir === "down" ? "Descend Stairs" : "Ascend Stairs";
}

function resolveContextAction(state, occupancy = null) {
  const p = state.player;
  if (p.dead) return null;

  const here = state.world.getTile(p.x, p.y, p.z);
  if (here === STAIRS_DOWN) return { type: "stairs-down", label: stairContextLabel(state, "down"), run: () => tryUseStairs(state, "down") };
  if (here === STAIRS_UP) return { type: "stairs-up", label: stairContextLabel(state, "up"), run: () => tryUseStairs(state, "up") };

  const occ = occupancy ?? buildOccupancy(state);
  const attackTarget = getAdjacentMonsterTarget(state, occ);
  if (attackTarget) {
    const nm = MONSTER_TYPES[attackTarget.type]?.name ?? attackTarget.type;
    return {
      type: "attack",
      targetMonsterId: attackTarget.id,
      monsterType: attackTarget.type,
      label: `Attack ${nm}`,
      run: () => attackMonsterById(state, attackTarget.id),
    };
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
      return {
        type: "pickup",
        pickupType: target.type,
        label: `Take ${nm}${more}`,
        run: () => pickup(state),
      };
    }

    const shrine = itemsHere.find((e) => e.type === "shrine");
    if (shrine) return { type: "shrine", label: "Pray at Shrine", run: () => interactShrine(state) };
  }

  const dirs = [[0,-1],[1,0],[0,1],[-1,0]];
  for (const [dx, dy] of dirs) {
    const x = p.x + dx, y = p.y + dy;
    const t = state.world.getTile(x, y, p.z);
    if (!isOpenDoorTile(t)) continue;
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

function iconSpecForItemType(type) {
  if (!type) return null;
  const spriteId = itemSpriteId({ type });
  if (spriteId && SPRITE_SOURCES[spriteId]) return { spriteId };
  const glyphInfo = itemGlyph(type);
  if (glyphInfo) return { glyph: glyphInfo.g, color: glyphInfo.c };
  return null;
}

function iconSpecForMonsterType(type) {
  if (!type) return null;
  const spriteId = monsterSpriteId(type);
  if (spriteId && SPRITE_SOURCES[spriteId]) return { spriteId };
  const glyphInfo = monsterGlyph(type);
  if (glyphInfo) return { glyph: glyphInfo.g, color: glyphInfo.c };
  return null;
}

function iconSpecForContextAction(state, action) {
  if (!action) return null;
  if (action.type === "attack") {
    const mType = action.monsterType ?? state.entities.get(action.targetMonsterId)?.type ?? null;
    return iconSpecForMonsterType(mType);
  }
  if (action.type === "pickup") {
    return iconSpecForItemType(action.pickupType ?? null);
  }
  if (action.type === "shop") return iconSpecForItemType("shopkeeper");
  if (action.type === "shrine") return iconSpecForItemType("shrine");
  if (action.type === "open-door") {
    const g = tileGlyph(DOOR_CLOSED);
    return g ? { glyph: g.g, color: g.c } : null;
  }
  if (action.type === "close-door") {
    const g = tileGlyph(DOOR_OPEN);
    return g ? { glyph: g.g, color: g.c } : null;
  }
  if (action.type === "stairs-up") {
    if (state.player.z === 0) return { spriteId: "surface_entrance" };
    const g = tileGlyph(STAIRS_UP);
    return g ? { glyph: g.g, color: g.c } : null;
  }
  if (action.type === "stairs-down") {
    if (state.player.z === SURFACE_LEVEL) return { spriteId: "surface_entrance" };
    const g = tileGlyph(STAIRS_DOWN);
    return g ? { glyph: g.g, color: g.c } : null;
  }
  return null;
}

function setContextButtonContent(btn, label, iconSpec = null) {
  if (!btn) return;
  btn.innerHTML = "";
  const content = document.createElement("span");
  content.className = "contextBtnContent";

  if (iconSpec) {
    const iconWrap = document.createElement("span");
    iconWrap.className = "contextBtnIcon";
    if (iconSpec.spriteId && SPRITE_SOURCES[iconSpec.spriteId]) {
      const img = document.createElement("img");
      img.src = SPRITE_SOURCES[iconSpec.spriteId];
      img.alt = "";
      iconWrap.appendChild(img);
    } else if (iconSpec.glyph) {
      const glyph = document.createElement("span");
      glyph.className = "contextBtnGlyph";
      glyph.textContent = iconSpec.glyph;
      if (iconSpec.color) glyph.style.color = iconSpec.color;
      iconWrap.appendChild(glyph);
    }
    if (iconWrap.childNodes.length) content.appendChild(iconWrap);
  }

  const text = document.createElement("span");
  text.className = "contextBtnText";
  text.textContent = label;
  content.appendChild(text);

  btn.appendChild(content);
}

function updateContextActionButton(state, occupancy = null) {
  if (!contextActionBtn) return;
  const action = resolveContextAction(state, occupancy);
  if (!action) {
    contextActionBtn.disabled = true;
    setContextButtonContent(contextActionBtn, "No Action", null);
    contextActionBtn.dataset.actionType = "none";
    updatePotionContextButton(state);
    updateAttackContextButtons(state, occupancy, null);
    return;
  }
  contextActionBtn.disabled = false;
  setContextButtonContent(contextActionBtn, action.label, iconSpecForContextAction(state, action));
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
  setContextButtonContent(contextPotionBtn, "Use Potion", iconSpecForItemType("potion"));
}

function buildAuxContextActions(state, occupancy = null, primaryAction = null) {
  const p = state.player;
  const occ = occupancy ?? buildOccupancy(state);
  const actions = [];

  const here = state.world.getTile(p.x, p.y, p.z);
  if (here === STAIRS_DOWN && primaryAction?.type !== "stairs-down") {
    actions.push({
      id: "aux|stairs-down",
      label: stairContextLabel(state, "down"),
      run: () => tryUseStairs(state, "down"),
    });
  }
  if (here === STAIRS_UP && primaryAction?.type !== "stairs-up") {
    actions.push({
      id: "aux|stairs-up",
      label: stairContextLabel(state, "up"),
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
      monsterType: entry.monster.type,
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
        pickupType: target.type,
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
    setContextButtonContent(btn, action.label, iconSpecForContextAction(state, action));
    btn.addEventListener("click", () => {
      takeTurn(state, action.run());
    });
    contextAttackListEl.appendChild(btn);
  }
}

function isStackable(type) {
  return type === "potion" ||
    type.startsWith("key_") ||
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
  const headArmor = equip.head ? ARMOR_PIECES[equip.head] : null;
  const chestArmor = equip.chest ? ARMOR_PIECES[equip.chest] : null;
  const legsArmor = equip.legs ? ARMOR_PIECES[equip.legs] : null;

  const effAtk = state.player.effects
    .filter(e => e.type === "bless" || e.type === "curse")
    .reduce((s, e) => s + e.atkDelta, 0);

  p.atkBonus = (weapon?.atkBonus ?? 0) + effAtk;
  p.defBonus = (headArmor?.defBonus ?? 0) + (chestArmor?.defBonus ?? 0) + (legsArmor?.defBonus ?? 0);

  p.atkLo = 200 + Math.floor((p.level - 1) / 2) * 100;
  p.atkHi = 500 + Math.floor((p.level - 1) / 2) * 100;
}

function renderEquipment(state) {
  const p = state.player;
  const equip = p.equip ?? {};
  if (equipTextEl) {
    const w = equip.weapon ? (ITEM_TYPES[equip.weapon]?.name ?? equip.weapon) : "(none)";
    const head = equip.head ? (ITEM_TYPES[equip.head]?.name ?? equip.head) : "(none)";
    const chest = equip.chest ? (ITEM_TYPES[equip.chest]?.name ?? equip.chest) : "(none)";
    const legs = equip.legs ? (ITEM_TYPES[equip.legs]?.name ?? equip.legs) : "(none)";
    equipTextEl.textContent =
      `Weapon: ${w}\nHead:   ${head}\nChest:  ${chest}\nLegs:   ${legs}\nATK bonus: ${p.atkBonus >= 0 ? "+" : ""}${p.atkBonus}  DEF: +${p.defBonus}`;
  }

  const setBadge = (el, itemType) => {
    if (!el) return;
    el.innerHTML = "";
    if (!itemType) return;

    const appendGlyph = () => {
      const glyphInfo = itemGlyph(itemType);
      const glyph = document.createElement("span");
      glyph.className = "equipBadgeGlyph";
      glyph.textContent = glyphInfo?.g ?? "?";
      glyph.style.color = glyphInfo?.c ?? "#d6e4ff";
      el.appendChild(glyph);
    };

    const spriteId = itemSpriteId({ type: itemType });
    const src = spriteId ? SPRITE_SOURCES[spriteId] : null;
    if (!src) {
      appendGlyph();
      return;
    }

    const img = document.createElement("img");
    img.src = src;
    img.alt = ITEM_TYPES[itemType]?.name ?? itemType;
    img.onerror = () => {
      el.innerHTML = "";
      appendGlyph();
    };
    el.appendChild(img);
  };

  const setBadgeLabel = (el, itemType, fallback) => {
    if (!el) return;
    const txt = itemType ? (ITEM_TYPES[itemType]?.name ?? itemType) : fallback;
    el.textContent = txt;
    el.title = txt;
  };

  setBadge(equipBadgeWeaponEl, equip.weapon ?? null);
  setBadge(equipBadgeHeadEl, equip.head ?? null);
  setBadge(equipBadgeTorsoEl, equip.chest ?? null);
  setBadge(equipBadgeLegsEl, equip.legs ?? null);
  setBadgeLabel(equipBadgeLabelWeaponEl, equip.weapon ?? null, "Weapon");
  setBadgeLabel(equipBadgeLabelHeadEl, equip.head ?? null, "Head");
  setBadgeLabel(equipBadgeLabelTorsoEl, equip.chest ?? null, "Torso");
  setBadgeLabel(equipBadgeLabelLegsEl, equip.legs ?? null, "Legs");
}

function unequipSlotToInventory(state, slot) {
  if (!state?.player || state.player.dead) return false;
  const equip = state.player.equip ?? {};
  const type = equip[slot] ?? null;
  if (!type) return false;

  equip[slot] = null;
  invAdd(state, type, 1);
  pushLog(state, `Removed ${ITEM_TYPES[type]?.name ?? type}.`);
  recalcDerivedStats(state);
  renderInventory(state);
  renderEquipment(state);
  renderEffects(state);
  saveNow(state);
  return true;
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
    value: itemMarketValue(item.type),
    name: ITEM_TYPES[item.type]?.name ?? item.type,
  }));
  entries.sort((a, b) =>
    (a.priority - b.priority) ||
    (b.value - a.value) ||
    a.name.localeCompare(b.name) ||
    (a.invIndex - b.invIndex)
  );
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
    if (t === FLOOR || isOpenDoorTile(t)) {
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
  world.ensureChunksAround(0, 0, 0, viewRadiusForChunks());
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
    equip: { weapon: null, head: null, chest: null, legs: null },
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
    debug: normalizeDebugFlags(),
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
      rewardChest: !!it.rewardChest,
      lootDepth: Number.isFinite(it.lootDepth) ? it.lootDepth : undefined,
      lockKeyType: it.lockKeyType,
    });
  }

  if (z === SURFACE_LEVEL && cx === 0 && cy === 0) {
    // Keep the surface dungeon entrance fixed at center.
    state.world.setTile(0, 0, z, STAIRS_DOWN);
    const id = "shopkeeper|surface|0,0";
    if (!state.removedIds.has(id)) {
      const x = 10, y = -8;
      const left = x - Math.floor(SHOP_FOOTPRINT_W / 2);
      const top = y;
      for (let yy = top; yy < top + SHOP_FOOTPRINT_H; yy++) {
        for (let xx = left; xx < left + SHOP_FOOTPRINT_W; xx++) state.world.setTile(xx, yy, z, FLOOR);
      }
      const existing = state.entities.get(id);
      state.entities.set(id, {
        id,
        origin: existing?.origin ?? "base",
        kind: existing?.kind ?? "item",
        type: "shopkeeper",
        amount: existing?.amount ?? 1,
        x, y, z,
      });
    }
  }
}

function hydrateNearby(state) {
  const p = state.player;
  state.world.ensureChunksAround(p.x, p.y, p.z, viewRadiusForChunks());

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
    if (e.z !== z) continue;
    if (e.type === "shopkeeper") {
      const left = e.x - Math.floor(SHOP_FOOTPRINT_W / 2);
      const top = e.y;
      if (x < left || x >= left + SHOP_FOOTPRINT_W || y < top || y >= top + SHOP_FOOTPRINT_H) continue;
      items.push(e);
      continue;
    }
    if (e.x !== x || e.y !== y) continue;
    items.push(e);
  }
  return items;
}

function findItemAtByType(state, x, y, z, type) {
  for (const e of state.entities.values()) {
    if (e.kind !== "item") continue;
    if (e.type !== type) continue;
    if (e.z !== z) continue;
    if (type === "shopkeeper") {
      const left = e.x - Math.floor(SHOP_FOOTPRINT_W / 2);
      const top = e.y;
      if (x >= left && x < left + SHOP_FOOTPRINT_W && y >= top && y < top + SHOP_FOOTPRINT_H) return e;
      continue;
    }
    if (e.x === x && e.y === y) return e;
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
  updateViewportMetrics();
  const { world, player, seen, visible } = state;
  visible.clear();

  world.ensureChunksAround(player.x, player.y, player.z, viewRadiusForChunks());

  for (let dy = -viewRadiusY; dy <= viewRadiusY; dy++) {
    for (let dx = -viewRadiusX; dx <= viewRadiusX; dx++) {
      const wx = player.x + dx;
      const wy = player.y + dy;

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
  if (isOpenDoorTile(t)) return v ? theme.doorO_V : theme.doorO_NV;
  if (t === LOCK_RED) return v ? theme.lockR_V : theme.lockR_NV;
  if (t === LOCK_BLUE) return v ? theme.lockB_V : theme.lockB_NV;
  if (t === LOCK_GREEN) return v ? theme.lockG_V : theme.lockG_NV;
  if (t === LOCK_PURPLE) return v ? theme.lockP_V : theme.lockP_NV;
  if (t === LOCK_MAGENTA) return v ? theme.lockM_V : theme.lockM_NV;
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
  const theme = applyVisibilityBoostToTheme(themeForDepth(p.z));
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

  // Draw stair arrows on top of minimap tiles so ladders are always identifiable.
  mctx.textAlign = "center";
  mctx.textBaseline = "middle";
  mctx.font = `bold ${Math.max(8, MINI_SCALE * 3)}px ui-monospace, monospace`;
  for (let my = 0; my < size; my++) {
    for (let mx = 0; mx < size; mx++) {
      const wx = p.x + (mx - MINI_RADIUS);
      const wy = p.y + (my - MINI_RADIUS);
      if (!state.seen.has(keyXYZ(wx, wy, p.z))) continue;
      const t = state.world.getTile(wx, wy, p.z);
      if (t !== STAIRS_UP && t !== STAIRS_DOWN) continue;

      const cx = mx * MINI_SCALE + MINI_SCALE / 2;
      const cy = my * MINI_SCALE + MINI_SCALE / 2;
      mctx.fillStyle = t === STAIRS_UP ? "#f0d8ff" : "#d8ffd8";
      mctx.fillText(t === STAIRS_UP ? "\u25B2" : "\u25BC", cx, cy);
    }
  }

  const surfaceTarget = p.z === 0
    ? (state.surfaceLink ?? resolveSurfaceLink(state))
    : (p.z === SURFACE_LEVEL ? { x: 0, y: 0, z: SURFACE_LEVEL } : null);
  if (surfaceTarget && surfaceTarget.z === p.z) {
    const mx = surfaceTarget.x - p.x + MINI_RADIUS;
    const my = surfaceTarget.y - p.y + MINI_RADIUS;
    if (mx >= 0 && mx < size && my >= 0 && my < size && state.seen.has(keyXYZ(surfaceTarget.x, surfaceTarget.y, p.z))) {
      const cx = mx * MINI_SCALE + MINI_SCALE / 2;
      const cy = my * MINI_SCALE + MINI_SCALE / 2;
      const rOuter = Math.max(4, MINI_SCALE * 1.8);
      const rInner = Math.max(1.6, rOuter * 0.48);
      const points = 5;
      const step = Math.PI / points;

      mctx.beginPath();
      for (let i = 0; i < points * 2; i++) {
        const r = (i % 2 === 0) ? rOuter : rInner;
        const a = -Math.PI / 2 + i * step;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) mctx.moveTo(x, y);
        else mctx.lineTo(x, y);
      }
      mctx.closePath();
      mctx.fillStyle = "#ffd166";
      mctx.fill();
      mctx.lineWidth = 1;
      mctx.strokeStyle = "rgba(80,55,0,0.85)";
      mctx.stroke();
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
  return t === LOCK_RED || t === LOCK_GREEN || t === LOCK_BLUE || t === LOCK_PURPLE || t === LOCK_MAGENTA || t === "*";
}
function lockToKeyType(t) {
  if (t === "*" || t === LOCK_RED) return KEY_RED;
  if (t === LOCK_GREEN) return KEY_GREEN;
  if (t === LOCK_BLUE) return KEY_BLUE;
  if (t === LOCK_PURPLE) return KEY_PURPLE;
  if (t === LOCK_MAGENTA) return KEY_MAGENTA;
  return KEY_RED;
}
function lockToOpenDoorTile(t) {
  if (t === LOCK_RED) return DOOR_OPEN_RED;
  if (t === LOCK_GREEN) return DOOR_OPEN_GREEN;
  if (t === LOCK_BLUE) return DOOR_OPEN_BLUE;
  if (t === LOCK_PURPLE) return DOOR_OPEN_PURPLE;
  if (t === LOCK_MAGENTA) return DOOR_OPEN_MAGENTA;
  return DOOR_OPEN;
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

  state.world.setTile(x, y, z, lockToOpenDoorTile(t));
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
    if (!isOpenDoorTile(t)) continue;

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

function dropEquipmentFromChest(state, chest = null) {
  const z = state.player.z;
  const isRewardChest = !!chest?.rewardChest;
  if (isRewardChest) {
    const rewardDepth = Math.max(z + 1, Math.floor(chest?.lootDepth ?? (z + 2)));
    const itemRolls = 1 + (Math.random() < 0.38 ? 1 : 0);
    for (let i = 0; i < itemRolls; i++) {
      const drop = Math.random() < 0.62
        ? weaponForDepth(rewardDepth + randInt(Math.random, 0, 3), Math.random)
        : armorForDepth(rewardDepth + randInt(Math.random, 0, 3), Math.random);
      invAdd(state, drop, 1);
      pushLog(state, `Reward: ${ITEM_TYPES[drop].name}.`);
    }

    if (Math.random() < 0.28) {
      invAdd(state, "potion", 1);
      pushLog(state, "Reward: Potion.");
    }
    return;
  }

  const roll = Math.random();
  if (roll < 0.33) {
    const w = weaponForDepth(z, Math.random);
    invAdd(state, w, 1);
    pushLog(state, `Found a ${ITEM_TYPES[w].name}!`);
  } else if (roll < 0.60) {
    const a = armorForDepth(z, Math.random);
    invAdd(state, a, 1);
    pushLog(state, `Found ${ITEM_TYPES[a].name}!`);
  } else if (roll < 0.80) {
    invAdd(state, "potion", 1);
    pushLog(state, "Found a Potion!");
  } else {
    const key = keyTypeForDepth(z, Math.random);
    invAdd(state, key, 1);
    pushLog(state, `Found a ${ITEM_TYPES[key].name}!`);
  }
}

function maybeDropKeyFromMonster(state, monster) {
  const z = Math.max(0, monster?.z ?? state.player.z ?? 0);
  let chance = 0.08 + Math.min(0.10, z * 0.002);
  if (monster.type === "goblin") chance += 0.14;
  else if (monster.type === "rogue") chance += 0.10;
  else if (monster.type === "archer") chance += 0.09;
  else if (monster.type === "jelly_red") chance += 0.08;
  else if (monster.type === "skeleton") chance += 0.06;
  else if (monster.type === "giant_spider") chance += 0.05;

  if (Math.random() >= clamp(chance, 0.04, 0.35)) return false;

  const keyType = keyTypeForDepth(z, Math.random);
  spawnDynamicItem(state, keyType, 1, monster.x, monster.y, monster.z);
  pushLog(state, `It dropped a ${ITEM_TYPES[keyType].name}!`);
  return true;
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

    let droppedSpecial = false;
    if (maybeDropKeyFromMonster(state, monster)) droppedSpecial = true;

    if (monster.type === "skeleton" && Math.random() < 0.24) {
      const drop = Math.random() < 0.5 ? weaponForDepth(state.player.z, Math.random) : armorForDepth(state.player.z);
      spawnDynamicItem(state, drop, 1, monster.x, monster.y, monster.z);
      pushLog(state, `It dropped ${ITEM_TYPES[drop].name}!`);
      droppedSpecial = true;
    }

    if (!droppedSpecial && Math.random() < 0.30) {
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
  if (isOpenDoorTile(hereTile)) state.visitedDoors?.add(keyXYZ(nx, ny, nz));

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
  } else if (it.type.startsWith("key_")) {
    invAdd(state, it.type, it.amount ?? 1);
    pushLog(state, `Picked up a ${ITEM_TYPES[it.type].name}.`);
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
    dropEquipmentFromChest(state, it);
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
    // Ignore the freshly carved landing footprint so we connect outwards.
    if (Math.abs(wx - x) <= 2 && Math.abs(wy - y) <= 2) continue;
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
    state.world.ensureChunksAround(0, 0, newZ, viewRadiusForChunks());
  } else {
    state.world.ensureChunksAround(p.x, p.y, newZ, viewRadiusForChunks());
  }

  if (direction === "down") {
    if (p.z === SURFACE_LEVEL && newZ === 0) {
      const link = ensureSurfaceLinkTile(state);
      state.world.ensureChunksAround(link.x, link.y, newZ, viewRadiusForChunks());
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

  if (stateDebug(state).godmode) {
    pushLog(state, `The ${nm} ${verb} you, but no damage gets through.`);
    return;
  }

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
    const actR = Math.max(viewRadiusX, viewRadiusY) + 5;
    if (dx * dx + dy * dy <= actR * actR) toAct.push(e);
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
const SURFACE_ENTRANCE_SPRITE_SIZE = Math.round(TILE * 2.25);
const SHOP_SPRITE_SIZE = Math.round(TILE * 3.25);
const PLAYER_SPRITE_SIZE = Math.round(TILE * 2.1);
const HERO_GLOW_RADIUS = Math.round(TILE * 0.95);
const MONSTER_GLOW_RADIUS = Math.round(TILE * 0.78);
const SHOP_FOOTPRINT_W = 3;
const SHOP_FOOTPRINT_H = 2;
const SPRITE_SOURCES = {
  hero: "./client/assets/hero_full.png",
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
  shopkeeper: "./client/assets/shop_full.png",
  gold: "./client/assets/coins_full.png",
  potion: "./client/assets/potion_hp_full.png",
  door_closed: "./client/assets/door_closed_full.png",
  door_open: "./client/assets/door_open_full.png",
  door_red_closed: "./client/assets/door_red_closed_full.png",
  door_red_open: "./client/assets/door_red_open_full.png",
  door_green_closed: "./client/assets/door_green_closed_full.png",
  door_green_open: "./client/assets/door_green_open_full.png",
  door_blue_closed: "./client/assets/door_blue_closed_full.png",
  door_blue_open: "./client/assets/door_blue_open_full.png",
  surface_entrance: "./client/assets/surface_entrance_full.png",
  weapon_bronze_dagger: "./client/assets/bronze_dagger_full.png",
  weapon_bronze_sword: "./client/assets/bronze_sword_full.png",
  weapon_bronze_axe: "./client/assets/bronze_axe_full.png",
  armor_bronze_chest: "./client/assets/bronze_chestplate_full.png",
  armor_bronze_legs: "./client/assets/bronze_platelegs_full.png",
  armor_leather_chest: "./client/assets/leather_chest_full.png",
  armor_leather_legs: "./client/assets/leather_legs_full.png",
  weapon_iron_dagger: "./client/assets/iron_dagger_full.png",
  weapon_iron_sword: "./client/assets/iron_sword_full.png",
  weapon_iron_axe: "./client/assets/iron_axe_full.png",
  armor_iron_chest: "./client/assets/iron_chestplate_full.png",
  armor_iron_legs: "./client/assets/iron_platelegs_full.png",
};
const spriteImages = {};
const spriteProcessed = {};
const spriteReady = {};
function buildSpriteTransparency(id, img) {
  // Use source sprites directly to avoid aggressive matte-stripping artifacts.
  return img;
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
  if (type === "slime") return "jelly_red";
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
  if (ent.type.startsWith("key_")) return null;
  if (ent.type === "chest" && !ent.locked) return "chest";
  if (ent.type === "chest" && ent.locked) {
    if (ent.keyType === "key_red") return "chest_red";
    if (ent.keyType === "key_blue") return "chest_blue";
    if (ent.keyType === "key_green") return "chest_green";
  }
  if (ent.type === "weapon_bronze_dagger") return "weapon_bronze_dagger";
  if (ent.type === "weapon_bronze_sword") return "weapon_bronze_sword";
  if (ent.type === "weapon_bronze_axe") return "weapon_bronze_axe";
  if (ent.type === "armor_bronze_chest") return "armor_bronze_chest";
  if (ent.type === "armor_bronze_legs") return "armor_bronze_legs";
  if (ent.type === "weapon_iron_dagger") return "weapon_iron_dagger";
  if (ent.type === "weapon_iron_sword") return "weapon_iron_sword";
  if (ent.type === "weapon_iron_axe") return "weapon_iron_axe";
  if (ent.type === "armor_leather_chest") return "armor_leather_chest";
  if (ent.type === "armor_leather_legs") return "armor_leather_legs";
  if (ent.type === "armor_iron_chest") return "armor_iron_chest";
  if (ent.type === "armor_iron_legs") return "armor_iron_legs";
  if (ent.type === "shopkeeper") return "shopkeeper";
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
function drawCenteredSpriteAt(ctx2d, centerX, centerY, img, w, h) {
  const iw = img?.width || 1;
  const ih = img?.height || 1;
  const scale = Math.min(w, h) / Math.max(iw, ih);
  const dw = Math.max(1, Math.round(iw * scale));
  const dh = Math.max(1, Math.round(ih * scale));
  const px = Math.round(centerX - dw / 2);
  const py = Math.round(centerY - dh / 2);
  ctx2d.drawImage(img, px, py, dw, dh);
}
function drawSoftGlow(ctx2d, cx, cy, radius, rgbaInner = "rgba(255,255,255,0.22)", rgbaOuter = "rgba(255,255,255,0)") {
  const r = Math.max(2, radius);
  const g = ctx2d.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, rgbaInner);
  g.addColorStop(1, rgbaOuter);
  ctx2d.fillStyle = g;
  ctx2d.beginPath();
  ctx2d.arc(cx, cy, r, 0, Math.PI * 2);
  ctx2d.fill();
}
function tileGlyph(t) {
  if (t === STAIRS_DOWN) return { g: "\u25BC", c: "#d6f5d6" };
  if (t === STAIRS_UP) return { g: "\u25B2", c: "#e8d6ff" };
  if (t === LOCK_RED) return { g: "R", c: "#ff9a9a" };
  if (t === LOCK_GREEN) return { g: "G", c: "#a6ff9a" };
  if (t === LOCK_BLUE) return { g: "B", c: "#9ad0ff" };
  if (t === LOCK_PURPLE) return { g: "P", c: "#d6a8ff" };
  if (t === LOCK_MAGENTA) return { g: "M", c: "#ff79d6" };
  if (t === DOOR_CLOSED) return { g: "+", c: "#e6d3b3" };
  if (t === DOOR_OPEN) return { g: "/", c: "#b8d6ff" };
  if (t === DOOR_OPEN_RED) return { g: "/", c: "#ff9a9a" };
  if (t === DOOR_OPEN_GREEN) return { g: "/", c: "#a6ff9a" };
  if (t === DOOR_OPEN_BLUE) return { g: "/", c: "#9ad0ff" };
  if (t === DOOR_OPEN_PURPLE) return { g: "/", c: "#d6a8ff" };
  if (t === DOOR_OPEN_MAGENTA) return { g: "/", c: "#ff79d6" };
  return null;
}
function tileSpriteId(state, wx, wy, wz, t) {
  if (t === LOCK_RED) return "door_red_closed";
  if (t === LOCK_GREEN) return "door_green_closed";
  if (t === LOCK_BLUE) return "door_blue_closed";
  if (t === DOOR_CLOSED) return "door_closed";
  if (t === DOOR_OPEN_RED) return "door_red_open";
  if (t === DOOR_OPEN_GREEN) return "door_green_open";
  if (t === DOOR_OPEN_BLUE) return "door_blue_open";
  if (t === DOOR_OPEN) return "door_open";
  if (t === STAIRS_DOWN && wz === SURFACE_LEVEL && wx === 0 && wy === 0) return "surface_entrance";
  if (t === STAIRS_UP && wz === 0) {
    const link = state.surfaceLink ?? resolveSurfaceLink(state);
    if (link && wx === link.x && wy === link.y) return "surface_entrance";
  }
  return null;
}
function materialIdFromItemType(type) {
  if (!type || typeof type !== "string") return null;
  if (!type.startsWith("weapon_") && !type.startsWith("armor_")) return null;
  const parts = type.split("_");
  if (parts.length < 3) return null;
  return parts.slice(1, -1).join("_");
}
function itemGlyph(type) {
  // Updated colors: potions magenta, armor brown, weapons silver, chests yellow, gold gold
  if (type === "potion") return { g: "!", c: "#ff66cc" };
  if (type === "gold") return { g: "$", c: "#ffbf00" };
  if (type === KEY_RED) return { g: "k", c: "#ff6b6b" };
  if (type === KEY_GREEN) return { g: "k", c: "#7dff6b" };
  if (type === KEY_BLUE) return { g: "k", c: "#6bb8ff" };
  if (type === KEY_PURPLE) return { g: "k", c: "#b18cff" };
  if (type === KEY_MAGENTA) return { g: "k", c: "#ff66cc" };
  if (type === "shopkeeper") return { g: "@", c: "#ffd166" };
  if (type === "chest") return { g: "\u25A3", c: "#ffd700" };
  if (type === "shrine") return { g: "\u2726", c: "#b8f2e6" };
  if (type?.startsWith("weapon_")) {
    const matId = materialIdFromItemType(type);
    return { g: "\u2020", c: MATERIAL_COLOR_BY_ID[matId] ?? "#cfcfcf" };
  }
  if (type?.startsWith("armor_")) {
    const matId = materialIdFromItemType(type);
    return { g: "\u26E8", c: MATERIAL_COLOR_BY_ID[matId] ?? "#8b5a2b" };
  }
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
  const isLadderOnScreen = Math.abs(dx) <= viewRadiusX && Math.abs(dy) <= viewRadiusY;
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
  const theme = applyVisibilityBoostToTheme(themeForDepth(player.z));
  const deferredTileSprites = [];
  const deferredItemSprites = [];
  const deferredMonsterSprites = [];

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);

  for (let sy = 0; sy < viewTilesY; sy++) {
    for (let sx = 0; sx < viewTilesX; sx++) {
      const wx = player.x + (sx - viewRadiusX);
      const wy = player.y + (sy - viewRadiusY);

      const isVisible = visible.has(keyXY(wx, wy));
      const isSeen = seen.has(keyXYZ(wx, wy, player.z));
      if (!isSeen) continue;

      const t = world.getTile(wx, wy, player.z);

      let fill = "#0b0e14";
      if (t === WALL) fill = isVisible ? theme.wallV : theme.wallNV;
      if (t === FLOOR) fill = isVisible ? theme.floorV : theme.floorNV;
      if (t === DOOR_CLOSED) fill = isVisible ? theme.doorC_V : theme.doorC_NV;
      if (isOpenDoorTile(t)) fill = isVisible ? theme.doorO_V : theme.doorO_NV;
      if (t === LOCK_RED) fill = isVisible ? theme.lockR_V : theme.lockR_NV;
      if (t === LOCK_GREEN) fill = isVisible ? theme.lockG_V : theme.lockG_NV;
      if (t === LOCK_BLUE) fill = isVisible ? theme.lockB_V : theme.lockB_NV;
      if (t === LOCK_PURPLE) fill = isVisible ? theme.lockP_V : theme.lockP_NV;
      if (t === LOCK_MAGENTA) fill = isVisible ? theme.lockM_V : theme.lockM_NV;
      if (t === STAIRS_DOWN) fill = isVisible ? theme.downV : theme.downNV;
      if (t === STAIRS_UP) fill = isVisible ? theme.upV : theme.upNV;

      ctx.fillStyle = fill;
      ctx.fillRect(sx * TILE, sy * TILE, TILE, TILE);

      // Subtle bevel shading at wall/floor boundaries to reduce blocky edges at higher tile sizes.
      const wallish = (tt) => tt === WALL || tt === DOOR_CLOSED || tileIsLocked(tt);
      const openish = (tt) => tt === FLOOR || isOpenDoorTile(tt) || tt === STAIRS_DOWN || tt === STAIRS_UP;
      const n = world.getTile(wx, wy - 1, player.z);
      const s = world.getTile(wx, wy + 1, player.z);
      const w = world.getTile(wx - 1, wy, player.z);
      const e = world.getTile(wx + 1, wy, player.z);
      const nw = world.getTile(wx - 1, wy - 1, player.z);
      const ne = world.getTile(wx + 1, wy - 1, player.z);
      const sw = world.getTile(wx - 1, wy + 1, player.z);
      const se = world.getTile(wx + 1, wy + 1, player.z);
      const edgeAlpha = (isVisible ? 0.22 : 0.12) * (MOBILE_VISIBILITY_BOOST ? 0.45 : 1);
      const px = sx * TILE, py = sy * TILE;
      const chamfer = CORNER_CHAMFER_PX;

      if (openish(t)) {
        ctx.fillStyle = `rgba(0,0,0,${edgeAlpha})`;
        if (wallish(n)) ctx.fillRect(px, py, TILE, EDGE_SHADE_PX);
        if (wallish(s)) ctx.fillRect(px, py + TILE - EDGE_SHADE_PX, TILE, EDGE_SHADE_PX);
        if (wallish(w)) ctx.fillRect(px, py, EDGE_SHADE_PX, TILE);
        if (wallish(e)) ctx.fillRect(px + TILE - EDGE_SHADE_PX, py, EDGE_SHADE_PX, TILE);
        // Secondary softer shade layer for smoother transitions at high resolution.
        const softShade = (isVisible ? 0.12 : 0.06) * (MOBILE_VISIBILITY_BOOST ? 0.45 : 1);
        ctx.fillStyle = `rgba(0,0,0,${softShade})`;
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

      const tileSpriteKind = tileSpriteId(state, wx, wy, player.z, t);
      const tileSprite = getSpriteIfReady(tileSpriteKind);
      if (tileSprite) {
        const tileSpriteSize = tileSpriteKind === "surface_entrance"
          ? SURFACE_ENTRANCE_SPRITE_SIZE
          : ITEM_SPRITE_SIZE;
        deferredTileSprites.push({ sx, sy, img: tileSprite, size: tileSpriteSize });
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
            if (ent?.type === "shopkeeper") {
              const centerX = (sx + 0.5) * TILE;
              const centerY = (sy + SHOP_FOOTPRINT_H / 2) * TILE;
              deferredItemSprites.push({ sx, sy, img: itemSprite, size: SHOP_SPRITE_SIZE, centerX, centerY });
            } else {
              deferredItemSprites.push({ sx, sy, img: itemSprite, size: ITEM_SPRITE_SIZE });
            }
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

  // Draw tile sprites after terrain so wall shading/neighbor tiles cannot overpaint them.
  for (const spr of deferredTileSprites) {
    drawCenteredSprite(ctx, spr.sx, spr.sy, spr.img, spr.size, spr.size);
  }
  for (const spr of deferredItemSprites) {
    if (Number.isFinite(spr.centerX) && Number.isFinite(spr.centerY)) {
      drawCenteredSpriteAt(ctx, spr.centerX, spr.centerY, spr.img, spr.size ?? ITEM_SPRITE_SIZE, spr.size ?? ITEM_SPRITE_SIZE);
    } else {
      drawCenteredSprite(ctx, spr.sx, spr.sy, spr.img, spr.size ?? ITEM_SPRITE_SIZE, spr.size ?? ITEM_SPRITE_SIZE);
    }
  }
  // Draw oversized monster sprites after terrain so neighboring tiles don't overpaint overflow.
  for (const spr of deferredMonsterSprites) {
    const cx = spr.sx * TILE + TILE / 2;
    const cy = spr.sy * TILE + TILE / 2;
    drawSoftGlow(ctx, cx, cy, MONSTER_GLOW_RADIUS, "rgba(255,120,90,0.20)", "rgba(255,120,90,0)");
    drawCenteredSprite(ctx, spr.sx, spr.sy, spr.img, MONSTER_SPRITE_SIZE, MONSTER_SPRITE_SIZE);
  }

  const heroCx = viewRadiusX * TILE + TILE / 2;
  const heroCy = viewRadiusY * TILE + TILE / 2;
  drawSoftGlow(ctx, heroCx, heroCy, HERO_GLOW_RADIUS, "rgba(120,220,255,0.24)", "rgba(120,220,255,0)");
  const heroSprite = getSpriteIfReady("hero");
  if (heroSprite) {
    drawCenteredSprite(ctx, viewRadiusX, viewRadiusY, heroSprite, PLAYER_SPRITE_SIZE, PLAYER_SPRITE_SIZE);
  } else {
    ctx.fillStyle = "#ffffff";
    // Fallback player marker while sprite is loading.
    const prad = Math.max(3, TILE / 2 - 2);
    ctx.beginPath();
    ctx.arc(heroCx, heroCy, prad, 0, Math.PI * 2);
    ctx.fill();
  }

  const { cx, cy, lx, ly } = splitWorldToChunk(player.x, player.y);
  if (headerInfoEl) {
    headerInfoEl.innerHTML =
      `<div>seed: ${world.seedStr} | theme: ${theme.name}</div>` +
      `<div>pos: (${player.x}, ${player.y}) chunk: (${cx}, ${cy}) local: (${lx}, ${ly})</div>`;
  }
  metaEl.innerHTML =
    `<div class="meta-row"><div class="meta-col"><span class="label">XP</span><span class="val xp">${player.xp}/${xpToNext(player.level)}</span></div><div class="meta-col"><span class="label">Gold</span><span class="val gold">${player.gold}</span></div></div>` +
    `<div class="meta-row"><div class="meta-col"><span class="label">ATK</span><span class="val atk">${Math.max(1, player.atkLo + player.atkBonus)}-${Math.max(1, player.atkHi + player.atkBonus)}</span></div><div class="meta-col"><span class="label">DEF</span><span class="val def">+${player.defBonus}</span></div></div>`;
  if (vitalsDisplayEl) {
    vitalsDisplayEl.innerHTML =
      `<span class="lbl">HP</span><span class="hp">${player.hp}/${player.maxHp}</span>` +
      `<span class="sep">|</span>` +
      `<span class="lbl">LVL</span><span class="lvl">${player.level}</span>`;
  }
  if (depthDisplayEl) depthDisplayEl.textContent = `Depth: ${player.z}`;
  updateSurfaceCompass(state);

  // Visual indicator for low HP: toggle hp-low class when HP <= 30% of max
  try {
    const hpNode = (vitalsDisplayEl?.querySelector('.hp')) || metaEl.querySelector('.val.hp');
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
function isTextEntryElement(el) {
  if (!(el instanceof Element)) return false;
  if (el.closest("[contenteditable='true']")) return true;
  const field = el.closest("input, textarea");
  if (!field) return false;
  const tag = field.tagName.toLowerCase();
  if (tag === "textarea") return true;
  const type = String(field.getAttribute("type") ?? "text").toLowerCase();
  return !["checkbox", "radio", "button", "submit", "reset", "file", "range", "color"].includes(type);
}

function shouldIgnoreGameHotkeys(e) {
  const target = e.target;
  if (!(target instanceof Element)) return false;
  if (debugMenuWrapEl?.contains(target)) return true;
  if (isTextEntryElement(target)) return true;
  return false;
}

function onKey(state, e) {
  const k = e.key.toLowerCase();
  if (shouldIgnoreGameHotkeys(e)) return;
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
  if (keyType === KEY_RED) return LOCK_RED;
  if (keyType === KEY_GREEN) return LOCK_GREEN;
  if (keyType === KEY_BLUE) return LOCK_BLUE;
  if (keyType === KEY_PURPLE) return LOCK_PURPLE;
  if (keyType === KEY_MAGENTA) return LOCK_MAGENTA;
  return LOCK_RED;
}

function isDoorwayCandidate(state, x, y, z) {
  const t = state.world.getTile(x, y, z);
  if (t !== DOOR_CLOSED) return false;

  if (state.visitedDoors?.has(keyXYZ(x, y, z))) return false;

  const floorish = (tt) => tt === FLOOR || isOpenDoorTile(tt) || tt === STAIRS_DOWN || tt === STAIRS_UP;
  const n = state.world.getTile(x, y - 1, z), s = state.world.getTile(x, y + 1, z);
  const w = state.world.getTile(x - 1, y, z), e = state.world.getTile(x + 1, y, z);

  const ns = floorish(n) && floorish(s) && w === WALL && e === WALL;
  const we = floorish(w) && floorish(e) && n === WALL && s === WALL;

  return ns || we;
}

function topologyWalkableTile(t) {
  return t === FLOOR || isOpenDoorTile(t) || t === DOOR_CLOSED || t === STAIRS_DOWN || t === STAIRS_UP;
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
    debug: normalizeDebugFlags(state.debug),
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
  const out = { weapon: null, head: null, chest: null, legs: null };
  const e = equip ?? {};

  const weapon = normalizeItemType(e.weapon ?? null);
  if (weapon && WEAPONS[weapon]) out.weapon = weapon;

  const candidates = [e.head, e.chest, e.legs, e.armor]
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
      debug: normalizeDebugFlags(payload.debug),
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
        .map((s) => {
          const type = normalizeItemType(s?.type);
          const amountRaw = Math.max(1, Math.floor(s?.amount ?? 1));
          const amount = type === "potion" ? Math.min(5, amountRaw) : 1;
          return { type, price: Math.max(1, Math.floor(s?.price ?? 0)), amount };
        })
        .filter((s) => ITEM_TYPES[s.type]);
      state.shop.lastRefreshMs = Number.isFinite(state.shop.lastRefreshMs) ? state.shop.lastRefreshMs : Date.now();
      state.shop.nextRefreshMs = Number.isFinite(state.shop.nextRefreshMs) ? state.shop.nextRefreshMs : Date.now();
    } else {
      state.shop = null;
    }
    state.debug = normalizeDebugFlags(state.debug);
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
  updateDebugMenuUi(game);
  setDebugMenuOpen(false);
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
  updateDebugMenuUi(game);
  setDebugMenuOpen(false);
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
  updateDebugMenuUi(game);
  setDebugMenuOpen(false);
  updateContextActionButton(game);
  updateDeathOverlay(game);
  saveNow(game);
});
btnDebugMenuEl?.addEventListener("click", (e) => {
  e.stopPropagation();
  if (game) updateDebugMenuUi(game);
  const open = !(debugMenuEl?.classList.contains("show"));
  setDebugMenuOpen(open);
});
debugMenuEl?.addEventListener("click", (e) => {
  e.stopPropagation();
});
document.addEventListener("click", (e) => {
  if (!debugMenuWrapEl) return;
  if (debugMenuWrapEl.contains(e.target)) return;
  setDebugMenuOpen(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") setDebugMenuOpen(false);
});
toggleGodmodeEl?.addEventListener("change", () => {
  if (!game) return;
  setDebugFlag(game, "godmode", !!toggleGodmodeEl.checked);
  updateDebugMenuUi(game);
});
toggleFreeShoppingEl?.addEventListener("change", () => {
  if (!game) return;
  setDebugFlag(game, "freeShopping", !!toggleFreeShoppingEl.checked);
  updateDebugMenuUi(game);
  if (shopUi.open) renderShopOverlay(game);
});
const runDebugDepthTeleport = () => {
  if (!game || !debugDepthInputEl) return;
  const raw = debugDepthInputEl.value.trim();
  if (!raw.length) {
    pushLog(game, "Enter a depth value.");
    return;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    pushLog(game, "Invalid depth value.");
    return;
  }
  teleportPlayerToDepth(game, parsed);
};
debugDepthGoEl?.addEventListener("click", (e) => {
  e.preventDefault();
  runDebugDepthTeleport();
});
debugDepthInputEl?.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  e.stopPropagation();
  runDebugDepthTeleport();
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
  updateDebugMenuUi(game);
  setDebugMenuOpen(false);
  saveNow(game);
});

const bindEquipBadgeUnequip = (el, slot) => {
  el?.addEventListener("click", () => {
    if (!game) return;
    unequipSlotToInventory(game, slot);
  });
};
bindEquipBadgeUnequip(equipBadgeWeaponEl, "weapon");
bindEquipBadgeUnequip(equipBadgeHeadEl, "head");
bindEquipBadgeUnequip(equipBadgeTorsoEl, "chest");
bindEquipBadgeUnequip(equipBadgeLegsEl, "legs");
equipSectionToggleEl?.addEventListener("click", () => {
  overlaySections.equipmentCollapsed = !overlaySections.equipmentCollapsed;
  updateOverlaySectionUi();
});
inventorySectionToggleEl?.addEventListener("click", () => {
  overlaySections.inventoryCollapsed = !overlaySections.inventoryCollapsed;
  updateOverlaySectionUi();
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
  updateOverlaySectionUi();
  updateDebugMenuUi(game);
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
