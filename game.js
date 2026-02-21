// Infinite Dungeon Roguelike (procedural as explored, chunked, multi-depth)
// Turn-based loop, monsters, items, stairs, combat, and persistence (deltas only).

// ---------- Config ----------
const CHUNK = 32;
const TILE = 16;
const VIEW_RADIUS = 14; // render + LOS radius

const WALL = "#";
const FLOOR = ".";
const DOOR = "+";
const STAIRS_DOWN = ">";
const STAIRS_UP = "<";

const SAVE_KEY = "infinite_dungeon_roguelike_save_v2";

// ---------- DOM ----------
const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
const metaEl = document.getElementById("meta");
const logEl = document.getElementById("log");
const invListEl = document.getElementById("invList");

const viewSize = VIEW_RADIUS * 2 + 1;
canvas.width = viewSize * TILE;
canvas.height = viewSize * TILE;

let fogEnabled = true;

// ---------- RNG (deterministic) ----------
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
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
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
function choice(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}
function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

// ---------- Coordinate helpers ----------
function floorDiv(a, b) {
  return Math.floor(a / b);
}
function splitWorldToChunk(wx, wy) {
  const cx = floorDiv(wx, CHUNK);
  const cy = floorDiv(wy, CHUNK);
  const lx = wx - cx * CHUNK;
  const ly = wy - cy * CHUNK;
  return { cx, cy, lx, ly };
}
function keyXYZ(x, y, z) {
  return `${z}|${x},${y}`;
}
function keyXY(x, y) {
  return `${x},${y}`;
}
function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < CHUNK && y < CHUNK;
}

// ---------- Edge hashing (doors match neighbors) ----------
function edgeCanonical(z, cx, cy, dir) {
  let ax = cx,
    ay = cy,
    bx = cx,
    by = cy;

  if (dir === "E") bx = cx + 1;
  else if (dir === "W") bx = cx - 1;
  else if (dir === "S") by = cy + 1;
  else if (dir === "N") by = cy - 1;
  else throw new Error("bad dir");

  if (ax > bx || (ax === bx && ay > by)) {
    [ax, bx] = [bx, ax];
    [ay, by] = [by, ay];
  }
  return { z, ax, ay, bx, by };
}
function edgeInfo(seedStr, z, cx, cy, dir) {
  const { ax, ay, bx, by } = edgeCanonical(z, cx, cy, dir);
  const rng = makeRng(`${seedStr}|edge|z${z}|${ax},${ay}|${bx},${by}`);

  const open = rng() < 0.78;
  const pos = 2 + Math.floor(rng() * (CHUNK - 4)); // 2..CHUNK-3
  return { open, pos };
}

// ---------- Grid carving ----------
function newGrid(fill = WALL) {
  const g = new Array(CHUNK);
  for (let y = 0; y < CHUNK; y++) g[y] = new Array(CHUNK).fill(fill);
  return g;
}
function carveRect(grid, x, y, w, h, tile = FLOOR) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      if (inBounds(xx, yy)) grid[yy][xx] = tile;
    }
  }
}
function carveOval(grid, cx, cy, rx, ry, tile = FLOOR) {
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  for (let y = cy - ry; y <= cy + ry; y++) {
    for (let x = cx - rx; x <= cx + rx; x++) {
      if (!inBounds(x, y)) continue;
      const dx = x - cx;
      const dy = y - cy;
      if ((dx * dx) / rx2 + (dy * dy) / ry2 <= 1) grid[y][x] = tile;
    }
  }
}
function carveLine(grid, x1, y1, x2, y2, width, tile = FLOOR) {
  if (x1 === x2) {
    const [ya, yb] = y1 < y2 ? [y1, y2] : [y2, y1];
    for (let y = ya; y <= yb; y++) {
      for (let dx = -Math.floor(width / 2); dx <= Math.floor(width / 2); dx++) {
        const x = x1 + dx;
        if (inBounds(x, y)) grid[y][x] = tile;
      }
    }
  } else if (y1 === y2) {
    const [xa, xb] = x1 < x2 ? [x1, x2] : [x2, x1];
    for (let x = xa; x <= xb; x++) {
      for (let dy = -Math.floor(width / 2); dy <= Math.floor(width / 2); dy++) {
        const y = y1 + dy;
        if (inBounds(x, y)) grid[y][x] = tile;
      }
    }
  }
}
function carveCorridor(grid, rng, x1, y1, x2, y2) {
  const width = rng() < 0.25 ? 2 : 1;

  // sometimes "drunk-ish" biased walk
  if (rng() < 0.28) {
    let x = x1,
      y = y1;
    let safety = 600;
    while ((x !== x2 || y !== y2) && safety-- > 0) {
      for (let dy = -Math.floor(width / 2); dy <= Math.floor(width / 2); dy++) {
        for (let dx = -Math.floor(width / 2); dx <= Math.floor(width / 2); dx++) {
          const xx = x + dx,
            yy = y + dy;
          if (inBounds(xx, yy)) grid[yy][xx] = FLOOR;
        }
      }
      const dxTo = x2 - x;
      const dyTo = y2 - y;
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
      for (const o of opts) {
        r -= o.w;
        if (r <= 0) {
          pick = o;
          break;
        }
      }
      x = clamp(pick.x, 1, CHUNK - 2);
      y = clamp(pick.y, 1, CHUNK - 2);
    }
    return;
  }

  // otherwise L-corridor
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
function placeInternalDoors(grid, rng) {
  const floorish = (t) => t === FLOOR || t === DOOR || t === STAIRS_DOWN || t === STAIRS_UP;
  for (let y = 1; y < CHUNK - 1; y++) {
    for (let x = 1; x < CHUNK - 1; x++) {
      if (grid[y][x] !== WALL) continue;
      const n = grid[y - 1][x],
        s = grid[y + 1][x],
        w = grid[y][x - 1],
        e = grid[y][x + 1];
      const ns = floorish(n) && floorish(s) && w === WALL && e === WALL;
      const we = floorish(w) && floorish(e) && n === WALL && s === WALL;
      if ((ns || we) && rng() < 0.55) grid[y][x] = DOOR;
    }
  }
}
function floodConnected(grid, sx, sy) {
  const passable = (t) => t === FLOOR || t === DOOR || t === STAIRS_DOWN || t === STAIRS_UP;
  const q = [{ x: sx, y: sy }];
  const seen = new Set([keyXY(sx, sy)]);
  while (q.length) {
    const { x, y } = q.shift();
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (const [dx, dy] of dirs) {
      const nx = x + dx,
        ny = y + dy;
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
  const passable = (t) => t === FLOOR || t === DOOR || t === STAIRS_DOWN || t === STAIRS_UP;

  let start = null;
  for (let y = 1; y < CHUNK - 1 && !start; y++) {
    for (let x = 1; x < CHUNK - 1; x++) {
      if (passable(grid[y][x])) {
        start = { x, y };
        break;
      }
    }
  }
  if (!start) return;

  while (true) {
    const connected = floodConnected(grid, start.x, start.y);

    let island = null;
    for (let y = 1; y < CHUNK - 1 && !island; y++) {
      for (let x = 1; x < CHUNK - 1; x++) {
        if (!passable(grid[y][x])) continue;
        if (!connected.has(keyXY(x, y))) {
          island = { x, y };
          break;
        }
      }
    }
    if (!island) break;

    let best = null,
      bestD = Infinity;
    for (const k of connected) {
      const [cx, cy] = k.split(",").map(Number);
      const dx = cx - island.x,
        dy = cy - island.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = { x: cx, y: cy };
      }
    }
    if (!best) break;
    carveCorridor(grid, rng, island.x, island.y, best.x, best.y);
  }
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
    const t = choice(rng, ["rect", "rect", "L", "oval"]);
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

      const attach = choice(rng, ["right-down", "left-down", "right-up", "left-up"]);
      let x2 = x,
        y2 = y;
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
  }
  if (rooms.length >= 3 && rng() < 0.6) {
    carveCorridor(grid, rng, rooms[0].cx, rooms[0].cy, rooms[rooms.length - 1].cx, rooms[rooms.length - 1].cy);
  }

  // Ensure at least one open edge (deterministic)
  const openCount = ["N", "S", "W", "E"].reduce((n, d) => n + (edges[d].open ? 1 : 0), 0);
  if (openCount === 0) edges.E.open = true;

  const anchors = rooms.length ? rooms : [{ cx: Math.floor(CHUNK / 2), cy: Math.floor(CHUNK / 2) }];
  const nearestAnchor = (x, y) => {
    let best = anchors[0],
      bestD = Infinity;
    for (const a of anchors) {
      const dx = a.cx - x,
        dy = a.cy - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    return best;
  };

  function openDoorAt(dir) {
    const info = edges[dir];
    if (!info.open) return;

    if (dir === "N") {
      const x = info.pos;
      grid[0][x] = DOOR;
      grid[1][x] = FLOOR;
      const a = nearestAnchor(x, 1);
      carveCorridor(grid, rng, x, 1, a.cx, a.cy);
    } else if (dir === "S") {
      const x = info.pos;
      grid[CHUNK - 1][x] = DOOR;
      grid[CHUNK - 2][x] = FLOOR;
      const a = nearestAnchor(x, CHUNK - 2);
      carveCorridor(grid, rng, x, CHUNK - 2, a.cx, a.cy);
    } else if (dir === "W") {
      const y = info.pos;
      grid[y][0] = DOOR;
      grid[y][1] = FLOOR;
      const a = nearestAnchor(1, y);
      carveCorridor(grid, rng, 1, y, a.cx, a.cy);
    } else if (dir === "E") {
      const y = info.pos;
      grid[y][CHUNK - 1] = DOOR;
      grid[y][CHUNK - 2] = FLOOR;
      const a = nearestAnchor(CHUNK - 2, y);
      carveCorridor(grid, rng, CHUNK - 2, y, a.cx, a.cy);
    }
  }

  openDoorAt("N");
  openDoorAt("S");
  openDoorAt("W");
  openDoorAt("E");

  ensureChunkConnectivity(grid, rng);
  placeInternalDoors(grid, rng);

  // Add some stairs-down deterministically (and force at start chunk z0,0,0)
  const hasStairs = (z === 0 && cx === 0 && cy === 0) || rng() < 0.14;
  if (hasStairs) {
    // pick a floor-ish tile near center
    let best = null,
      bestD = Infinity;
    const tx = Math.floor(CHUNK / 2),
      ty = Math.floor(CHUNK / 2);
    for (let y = 2; y < CHUNK - 2; y++) {
      for (let x = 2; x < CHUNK - 2; x++) {
        const t = grid[y][x];
        if (t !== FLOOR && t !== DOOR) continue;
        const dx = x - tx,
          dy = y - ty;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = { x, y };
        }
      }
    }
    if (best) grid[best.y][best.x] = STAIRS_DOWN;
  }

  return { z, cx, cy, grid };
}

// ---------- World (multi-level + tile overrides) ----------
class World {
  constructor(seedStr, tileOverrides = null) {
    this.seedStr = seedStr;
    this.chunks = new Map(); // key => chunk
    this.tileOverrides = tileOverrides ?? new Map(); // keyXYZ => tile char
  }

  chunkKey(z, cx, cy) {
    return `${z}|${cx},${cy}`;
  }

  getChunk(z, cx, cy) {
    const k = this.chunkKey(z, cx, cy);
    let c = this.chunks.get(k);
    if (!c) {
      c = generateChunk(this.seedStr, z, cx, cy);
      this.chunks.set(k, c);
    }
    return c;
  }

  getTile(x, y, z) {
    const ov = this.tileOverrides.get(keyXYZ(x, y, z));
    if (ov) return ov;

    const { cx, cy, lx, ly } = splitWorldToChunk(x, y);
    const ch = this.getChunk(z, cx, cy);
    return ch.grid[ly][lx];
  }

  setTile(x, y, z, tile) {
    this.tileOverrides.set(keyXYZ(x, y, z), tile);
  }

  isPassable(x, y, z) {
    const t = this.getTile(x, y, z);
    return t === FLOOR || t === DOOR || t === STAIRS_DOWN || t === STAIRS_UP;
  }

  // Ensure surrounding chunks exist so rendering/LOS doesn’t thrash
  ensureChunksAround(x, y, z, radiusTiles) {
    const minX = x - radiusTiles,
      maxX = x + radiusTiles;
    const minY = y - radiusTiles,
      maxY = y + radiusTiles;
    const cMin = splitWorldToChunk(minX, minY);
    const cMax = splitWorldToChunk(maxX, maxY);
    for (let cy = cMin.cy; cy <= cMax.cy; cy++) {
      for (let cx = cMin.cx; cx <= cMax.cx; cx++) {
        this.getChunk(z, cx, cy);
      }
    }
  }
}

// ---------- LOS / FOV ----------
function bresenham(x0, y0, x1, y1) {
  const pts = [];
  let dx = Math.abs(x1 - x0);
  let dy = Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1;
  let sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  while (true) {
    pts.push({ x: x0, y: y0 });
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
  return pts;
}
function hasLineOfSight(world, z, x0, y0, x1, y1) {
  const pts = bresenham(x0, y0, x1, y1);
  for (let i = 1; i < pts.length - 1; i++) {
    const t = world.getTile(pts[i].x, pts[i].y, z);
    if (t === WALL) return false;
  }
  return true;
}

// ---------- Entity spawning (deterministic base + deltas) ----------
const MONSTER_TYPES = {
  rat: { name: "Rat", maxHp: 6, atkLo: 1, atkHi: 3, glyph: "r", xp: 1 },
  goblin: { name: "Goblin", maxHp: 10, atkLo: 2, atkHi: 4, glyph: "g", xp: 2 },
};

const ITEM_TYPES = {
  potion: { name: "Potion", glyph: "!", kind: "consumable" },
  gold: { name: "Gold", glyph: "$", kind: "currency" },
};

function samplePassableCellsInChunk(grid, rng, count) {
  const passable = (t) => t === FLOOR || t === DOOR || t === STAIRS_DOWN || t === STAIRS_UP;
  const cells = [];
  for (let y = 2; y < CHUNK - 2; y++) {
    for (let x = 2; x < CHUNK - 2; x++) {
      if (passable(grid[y][x])) cells.push({ x, y });
    }
  }
  // Fisher-Yates shuffle partially
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return cells.slice(0, Math.min(count, cells.length));
}

function chunkBaseSpawns(worldSeed, z, cx, cy, grid) {
  const rng = makeRng(`${worldSeed}|spawns|z${z}|${cx},${cy}`);

  // density increases slightly with depth
  const depthBoost = clamp(z, 0, 50);
  const monsterCount = clamp(randInt(rng, 0, 2) + (rng() < depthBoost / 80 ? 1 : 0), 0, 4);
  const itemCount = clamp(randInt(rng, 0, 2), 0, 3);

  const cells = samplePassableCellsInChunk(grid, rng, monsterCount + itemCount + 4);

  const monsters = [];
  for (let i = 0; i < monsterCount; i++) {
    const c = cells[i];
    const type = rng() < 0.55 ? "rat" : "goblin";
    const id = `m|${z}|${cx},${cy}|${i}`;
    monsters.push({ id, type, lx: c.x, ly: c.y });
  }

  const items = [];
  for (let i = 0; i < itemCount; i++) {
    const c = cells[monsterCount + i];
    const roll = rng();
    const type = roll < 0.55 ? "potion" : "gold";
    const id = `i|${z}|${cx},${cy}|${i}`;
    const amount = type === "gold" ? randInt(rng, 3, 18) + clamp(z, 0, 30) : 1;
    items.push({ id, type, amount, lx: c.x, ly: c.y });
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

function makeNewGame(seedStr = randomSeedString()) {
  const world = new World(seedStr);
  const player = {
    x: 0,
    y: 0,
    z: 0,
    hp: 18,
    maxHp: 18,
    atkLo: 2,
    atkHi: 5,
    xp: 0,
    level: 1,
    gold: 0,
  };

  const state = {
    world,
    player,
    seen: new Set(), // keyXYZ tiles seen
    visible: new Set(), // keyXY visible (current level only)
    log: [],
    entities: new Map(), // id -> entity
    removedIds: new Set(), // id strings (killed/picked)
    entityOverrides: new Map(), // id -> {x,y,z,hp} for monsters that changed
    inv: [], // array of item objects
    invOpen: true,
  };

  // spawn player in chunk 0,0 near center on a passable tile
  world.ensureChunksAround(0, 0, 0, VIEW_RADIUS + 2);
  const ch = world.getChunk(0, 0, 0);
  const target = { x: Math.floor(CHUNK / 2), y: Math.floor(CHUNK / 2) };
  let best = null,
    bestD = Infinity;
  for (let y = 1; y < CHUNK - 1; y++) {
    for (let x = 1; x < CHUNK - 1; x++) {
      const t = ch.grid[y][x];
      if (t === WALL) continue;
      const dx = x - target.x,
        dy = y - target.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = { x, y };
      }
    }
  }
  if (best) {
    player.x = best.x;
    player.y = best.y;
  }

  pushLog(state, "You enter the dungeon...");
  hydrateChunkEntities(state, 0, 0, 0);
  return state;
}

function pushLog(state, msg) {
  state.log.push(msg);
  if (state.log.length > 120) state.log.shift();
  renderLog(state);
}

function renderLog(state) {
  const last = state.log.slice(-40);
  logEl.textContent = last.join("\n");
  logEl.scrollTop = logEl.scrollHeight;
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
    left.textContent =
      `${idx + 1}. ${ITEM_TYPES[it.type]?.name ?? it.type}` + (it.type === "gold" ? ` (+${it.amount})` : "");
    const btn = document.createElement("button");
    btn.textContent = "Use";
    btn.onclick = () => useInventoryIndex(state, idx);
    row.appendChild(left);
    row.appendChild(btn);
    invListEl.appendChild(row);
  });
}

function hydrateChunkEntities(state, z, cx, cy) {
  const ch = state.world.getChunk(z, cx, cy);
  const base = chunkBaseSpawns(state.world.seedStr, z, cx, cy, ch.grid);

  // monsters
  for (const m of base.monsters) {
    if (state.removedIds.has(m.id)) continue;
    if (state.entities.has(m.id)) continue;

    const wx = cx * CHUNK + m.lx;
    const wy = cy * CHUNK + m.ly;

    const ov = state.entityOverrides.get(m.id);
    const mx = ov ? ov.x : wx;
    const my = ov ? ov.y : wy;
    const mz = ov ? ov.z : z;

    const spec = MONSTER_TYPES[m.type] ?? MONSTER_TYPES.rat;
    const hp = ov?.hp ?? spec.maxHp;

    state.entities.set(m.id, {
      id: m.id,
      kind: "monster",
      type: m.type,
      x: mx,
      y: my,
      z: mz,
      hp,
      maxHp: spec.maxHp,
      glyph: spec.glyph,
      awake: false,
    });
  }

  // items
  for (const it of base.items) {
    if (state.removedIds.has(it.id)) continue;
    if (state.entities.has(it.id)) continue;

    const wx = cx * CHUNK + it.lx;
    const wy = cy * CHUNK + it.ly;

    state.entities.set(it.id, {
      id: it.id,
      kind: "item",
      type: it.type,
      amount: it.amount ?? 1,
      x: wx,
      y: wy,
      z,
      glyph: ITEM_TYPES[it.type]?.glyph ?? "?",
    });
  }
}

function hydrateNearby(state) {
  const p = state.player;
  state.world.ensureChunksAround(p.x, p.y, p.z, VIEW_RADIUS + 2);

  const { cx: pcx, cy: pcy } = splitWorldToChunk(p.x, p.y);
  for (let cy = pcy - 1; cy <= pcy + 1; cy++) {
    for (let cx = pcx - 1; cx <= pcx + 1; cx++) {
      hydrateChunkEntities(state, p.z, cx, cy);
    }
  }
}

// ---------- Collision index ----------
function buildOccupancy(state) {
  const monsters = new Map(); // keyXYZ -> id
  const items = new Map(); // keyXYZ -> id (one per tile for now)
  for (const e of state.entities.values()) {
    if (e.z !== state.player.z) continue;
    const k = keyXYZ(e.x, e.y, e.z);
    if (e.kind === "monster") monsters.set(k, e.id);
    else if (e.kind === "item") items.set(k, e.id);
  }
  return { monsters, items };
}

// ---------- Player actions ----------
function rollDamage(rng, lo, hi) {
  return randInt(rng, lo, hi);
}

function playerAttack(state, monster) {
  const rng = makeRng(`${state.world.seedStr}|combat|p|${Date.now()}|${Math.random()}`);
  const dmg = rollDamage(rng, state.player.atkLo, state.player.atkHi);
  monster.hp -= dmg;
  monster.awake = true;
  state.entityOverrides.set(monster.id, { x: monster.x, y: monster.y, z: monster.z, hp: monster.hp });
  pushLog(state, `You hit the ${MONSTER_TYPES[monster.type]?.name ?? monster.type} for ${dmg}.`);

  if (monster.hp <= 0) {
    pushLog(state, `The ${MONSTER_TYPES[monster.type]?.name ?? monster.type} dies.`);
    state.entities.delete(monster.id);
    state.removedIds.add(monster.id);
    state.entityOverrides.delete(monster.id);

    // small chance to drop gold
    if (Math.random() < 0.35) {
      const dropId = `drop|${monster.id}`;
      state.entities.set(dropId, {
        id: dropId,
        kind: "item",
        type: "gold",
        amount: 2 + Math.floor(Math.random() * 10),
        x: monster.x,
        y: monster.y,
        z: monster.z,
        glyph: "$",
      });
    }
  }
}

function playerMoveOrAttack(state, dx, dy) {
  const p = state.player;
  const nx = p.x + dx;
  const ny = p.y + dy;
  const nz = p.z;

  hydrateNearby(state);

  const { monsters } = buildOccupancy(state);
  const mk = keyXYZ(nx, ny, nz);
  const mid = monsters.get(mk);
  if (mid) {
    const m = state.entities.get(mid);
    if (m) playerAttack(state, m);
    return true; // took a turn
  }

  if (!state.world.isPassable(nx, ny, nz)) {
    pushLog(state, "You bump into a wall.");
    return false; // no turn spent (optional, but feels better)
  }

  p.x = nx;
  p.y = ny;
  return true;
}

function waitTurn(state) {
  pushLog(state, "You wait.");
  return true;
}

function pickup(state) {
  const p = state.player;
  const { items } = buildOccupancy(state);
  const id = items.get(keyXYZ(p.x, p.y, p.z));
  if (!id) {
    pushLog(state, "Nothing here to pick up.");
    return false;
  }
  const it = state.entities.get(id);
  if (!it) return false;

  if (it.type === "gold") {
    state.player.gold += it.amount ?? 1;
    pushLog(state, `Picked up ${it.amount} gold.`);
  } else {
    state.inv.push({ type: it.type, amount: it.amount ?? 1 });
    pushLog(state, `Picked up ${ITEM_TYPES[it.type]?.name ?? it.type}.`);
  }

  state.entities.delete(id);
  state.removedIds.add(id);
  renderInventory(state);
  return true;
}

function useInventoryIndex(state, idx) {
  const it = state.inv[idx];
  if (!it) return;

  if (it.type === "potion") {
    const heal = 6 + Math.floor(Math.random() * 7);
    const before = state.player.hp;
    state.player.hp = clamp(state.player.hp + heal, 0, state.player.maxHp);
    pushLog(state, `You drink a potion. (+${state.player.hp - before} HP)`);
    state.inv.splice(idx, 1);
    renderInventory(state);
    monstersTurn(state);
    saveNow(state);
    return;
  }

  pushLog(state, "You can't use that right now.");
}

function tryUseStairs(state, dir) {
  const p = state.player;
  const here = state.world.getTile(p.x, p.y, p.z);

  if (dir === "down") {
    if (here !== STAIRS_DOWN) {
      pushLog(state, "No stairs down here.");
      return false;
    }
    goToLevel(state, p.z + 1, "down");
    return true;
  } else {
    if (here !== STAIRS_UP) {
      pushLog(state, "No stairs up here.");
      return false;
    }
    if (p.z <= 0) {
      pushLog(state, "You can't go up any further.");
      return false;
    }
    goToLevel(state, p.z - 1, "up");
    return true;
  }
}

// Carve a “landing” (tile overrides) so stairs always lead to a valid connected area
function carveLandingAndConnect(state, x, y, z, centerTile) {
  // carve a small 5x5 floor patch
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      state.world.setTile(x + dx, y + dy, z, FLOOR);
    }
  }
  state.world.setTile(x, y, z, centerTile);

  // connect landing to nearest existing passable tile in this chunk
  const { cx, cy } = splitWorldToChunk(x, y);
  const ch = state.world.getChunk(z, cx, cy);

  let best = null,
    bestD = Infinity;
  for (let ly = 1; ly < CHUNK - 1; ly++) {
    for (let lx = 1; lx < CHUNK - 1; lx++) {
      const wx = cx * CHUNK + lx;
      const wy = cy * CHUNK + ly;
      const t = state.world.getTile(wx, wy, z); // respects overrides
      if (t === WALL) continue;
      const dx = wx - x,
        dy = wy - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = { x: wx, y: wy };
      }
    }
  }
  if (!best) return;

  // simple Manhattan corridor carve via overrides
  let cx2 = x,
    cy2 = y;
  while (cx2 !== best.x) {
    cx2 += Math.sign(best.x - cx2);
    state.world.setTile(cx2, cy2, z, FLOOR);
  }
  while (cy2 !== best.y) {
    cy2 += Math.sign(best.y - cy2);
    state.world.setTile(cx2, cy2, z, FLOOR);
  }
}

function goToLevel(state, newZ, direction) {
  const p = state.player;

  // ensure destination exists and carve a safe landing there
  state.world.ensureChunksAround(p.x, p.y, newZ, VIEW_RADIUS + 2);

  if (direction === "down") {
    carveLandingAndConnect(state, p.x, p.y, newZ, STAIRS_UP);
    pushLog(state, `You descend to depth ${newZ}.`);
  } else {
    carveLandingAndConnect(state, p.x, p.y, newZ, STAIRS_DOWN);
    pushLog(state, `You ascend to depth ${newZ}.`);
  }

  p.z = newZ;

  // ensure player stands on passable
  if (!state.world.isPassable(p.x, p.y, p.z)) {
    state.world.setTile(p.x, p.y, p.z, FLOOR);
  }

  hydrateNearby(state);
  renderInventory(state);
}

// ---------- Monster AI ----------
function bfsNextStep(state, start, goal, maxNodes = 450, maxDist = 18) {
  const z = state.player.z;
  const passable = (x, y) => state.world.isPassable(x, y, z);

  const dist2 = (a, b) => {
    const dx = a.x - b.x,
      dy = a.y - b.y;
    return dx * dx + dy * dy;
  };

  if (dist2(start, goal) > maxDist * maxDist) return null;

  const { monsters } = buildOccupancy(state);
  const blocked = new Set();
  for (const [k, id] of monsters) blocked.add(k);

  const q = [];
  const prev = new Map();

  const sKey = keyXY(start.x, start.y);
  q.push(start);
  prev.set(sKey, null);

  let nodes = 0;
  while (q.length && nodes++ < maxNodes) {
    const cur = q.shift();
    if (cur.x === goal.x && cur.y === goal.y) break;

    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];

    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx,
        ny = cur.y + dy;

      if (!passable(nx, ny)) continue;

      const occ = blocked.has(keyXYZ(nx, ny, z));
      // allow stepping onto player tile (goal)
      if (occ && !(nx === goal.x && ny === goal.y)) continue;

      const k = keyXY(nx, ny);
      if (prev.has(k)) continue;

      prev.set(k, cur);
      q.push({ x: nx, y: ny });
    }
  }

  const gKey = keyXY(goal.x, goal.y);
  if (!prev.has(gKey)) return null;

  // walk back from goal to start: find first step
  let cur = { x: goal.x, y: goal.y };
  let p = prev.get(keyXY(cur.x, cur.y));
  while (p && !(p.x === start.x && p.y === start.y)) {
    cur = p;
    p = prev.get(keyXY(cur.x, cur.y));
  }
  return cur; // next tile toward goal
}

function monsterAttack(state, monster) {
  const rng = makeRng(`${state.world.seedStr}|combat|m|${monster.id}|${Date.now()}|${Math.random()}`);
  const spec = MONSTER_TYPES[monster.type] ?? MONSTER_TYPES.rat;
  const dmg = rollDamage(rng, spec.atkLo, spec.atkHi);

  state.player.hp -= dmg;
  pushLog(state, `The ${spec.name} hits you for ${dmg}.`);

  if (state.player.hp <= 0) {
    state.player.hp = 0;
    pushLog(state, "You died. (Press R for a new run)");
  }
}

function monstersTurn(state) {
  if (state.player.hp <= 0) return;

  hydrateNearby(state);

  const p = state.player;
  const z = p.z;

  // compute FOV once and let monsters “see” if player is visible from them
  computeVisibility(state);

  const { monsters } = buildOccupancy(state);
  const toAct = [];

  for (const e of state.entities.values()) {
    if (e.kind !== "monster") continue;
    if (e.z !== z) continue;
    const dx = e.x - p.x,
      dy = e.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= (VIEW_RADIUS + 4) * (VIEW_RADIUS + 4)) toAct.push(e);
  }

  for (const m of toAct) {
    if (!state.entities.has(m.id)) continue; // might have died

    const spec = MONSTER_TYPES[m.type] ?? MONSTER_TYPES.rat;
    const mdx = p.x - m.x;
    const mdy = p.y - m.y;
    const adj = Math.abs(mdx) + Math.abs(mdy) === 1;

    // If adjacent: attack
    if (adj) {
      monsterAttack(state, m);
      if (state.player.hp <= 0) return;
      m.awake = true;
      state.entityOverrides.set(m.id, { x: m.x, y: m.y, z: m.z, hp: m.hp });
      continue;
    }

    // Determine if monster "sees" player (simple LOS)
    const seesPlayer = hasLineOfSight(state.world, z, m.x, m.y, p.x, p.y);

    // If sees: path toward
    if (seesPlayer) {
      m.awake = true;
      const next = bfsNextStep(state, { x: m.x, y: m.y }, { x: p.x, y: p.y });
      if (next) {
        const occ = monsters.get(keyXYZ(next.x, next.y, z));
        if (!occ) {
          m.x = next.x;
          m.y = next.y;
          state.entityOverrides.set(m.id, { x: m.x, y: m.y, z: m.z, hp: m.hp });
        }
      }
      continue;
    }

    // Else: wander (more likely if awake, otherwise mostly idle)
    const wanderChance = m.awake ? 0.65 : 0.25;
    if (Math.random() < wanderChance) {
      const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];
      const shuffled = dirs.sort(() => Math.random() - 0.5);
      for (const [dx, dy] of shuffled) {
        const nx = m.x + dx,
          ny = m.y + dy;
        if (!state.world.isPassable(nx, ny, z)) continue;
        const occ = monsters.get(keyXYZ(nx, ny, z));
        if (occ) continue;
        // avoid stepping onto player
        if (nx === p.x && ny === p.y) continue;
        m.x = nx;
        m.y = ny;
        state.entityOverrides.set(m.id, { x: m.x, y: m.y, z: m.z, hp: m.hp });
        break;
      }
    }
  }
}

// ---------- Visibility + rendering ----------
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

function draw(state) {
  computeVisibility(state);
  hydrateNearby(state);

  const { world, player, seen, visible } = state;
  const { monsters, items } = buildOccupancy(state);

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
      if (t === WALL) fill = isVisible ? "#2a3142" : "#161b26";
      if (t === FLOOR) fill = isVisible ? "#0f1a2e" : "#0b1220";
      if (t === DOOR) fill = isVisible ? "#3a2f1e" : "#211a10";
      if (t === STAIRS_DOWN) fill = isVisible ? "#263a2a" : "#162218";
      if (t === STAIRS_UP) fill = isVisible ? "#2a263a" : "#1b1623";

      ctx.fillStyle = fill;
      ctx.fillRect(sx * TILE, sy * TILE, TILE, TILE);

      // draw entity glyphs if visible
      if (isVisible || !fogEnabled) {
        const mk = monsters.get(keyXYZ(wx, wy, player.z));
        const ik = items.get(keyXYZ(wx, wy, player.z));
        if (ik) {
          ctx.fillStyle = "#f4d35e";
          ctx.fillRect(sx * TILE + 6, sy * TILE + 6, TILE - 12, TILE - 12);
        }
        if (mk) {
          ctx.fillStyle = "#ff6b6b";
          ctx.fillRect(sx * TILE + 4, sy * TILE + 4, TILE - 8, TILE - 8);
        }

        // door tick
        if (t === DOOR) {
          ctx.fillStyle = "#d9b97a";
          ctx.fillRect(sx * TILE + Math.floor(TILE / 2) - 1, sy * TILE + 3, 2, TILE - 6);
        }

        // stairs marks
        if (t === STAIRS_DOWN || t === STAIRS_UP) {
          ctx.fillStyle = "#b8f2e6";
          ctx.fillRect(sx * TILE + 7, sy * TILE + 7, TILE - 14, TILE - 14);
        }
      }
    }
  }

  // player
  ctx.fillStyle = "#7ce3ff";
  const px = VIEW_RADIUS * TILE;
  const py = VIEW_RADIUS * TILE;
  ctx.fillRect(px + 3, py + 3, TILE - 6, TILE - 6);

  // meta
  const { cx, cy, lx, ly } = splitWorldToChunk(player.x, player.y);
  metaEl.textContent =
    `seed: ${world.seedStr}  depth: ${player.z}\n` +
    `pos: (${player.x}, ${player.y}) chunk: (${cx}, ${cy}) local: (${lx}, ${ly})\n` +
    `HP: ${player.hp}/${player.maxHp}  Gold: ${player.gold}  Chunks: ${world.chunks.size}  Fog: ${fogEnabled ? "on" : "off"}`;
}

// ---------- Input / Turns ----------
function takeTurn(state, didSpendTurn) {
  if (!didSpendTurn) return;

  // monsters act after player
  monstersTurn(state);

  renderInventory(state);
  saveNow(state);
}

function onKey(state, e) {
  const key = e.key;

  // inventory number keys 1-9
  if (key >= "1" && key <= "9") {
    e.preventDefault();
    useInventoryIndex(state, parseInt(key, 10) - 1);
    return;
  }

  const k = key.toLowerCase();

  if (k === "arrowup" || k === "w") {
    e.preventDefault();
    takeTurn(state, playerMoveOrAttack(state, 0, -1));
  } else if (k === "arrowdown" || k === "s") {
    e.preventDefault();
    takeTurn(state, playerMoveOrAttack(state, 0, 1));
  } else if (k === "arrowleft" || k === "a") {
    e.preventDefault();
    takeTurn(state, playerMoveOrAttack(state, -1, 0));
  } else if (k === "arrowright" || k === "d") {
    e.preventDefault();
    takeTurn(state, playerMoveOrAttack(state, 1, 0));
  } else if (k === "." || k === " " || k === "spacebar") {
    e.preventDefault();
    takeTurn(state, waitTurn(state));
  } else if (k === "g") {
    e.preventDefault();
    takeTurn(state, pickup(state));
  } else if (k === "i") {
    e.preventDefault();
    state.invOpen = !state.invOpen; // visual only for future expansion
    renderInventory(state);
  } else if (key === ">") {
    e.preventDefault();
    takeTurn(state, tryUseStairs(state, "down"));
  } else if (key === "<") {
    e.preventDefault();
    takeTurn(state, tryUseStairs(state, "up"));
  } else if (k === "f") {
    e.preventDefault();
    fogEnabled = !fogEnabled;
    saveNow(state);
  } else if (k === "r") {
    e.preventDefault();
    game = makeNewGame();
    renderInventory(game);
    saveNow(game);
  }
}

// ---------- Save / Load (deltas) ----------
function exportSave(state) {
  const tileOv = Array.from(state.world.tileOverrides.entries()); // [keyXYZ, tile]
  const removed = Array.from(state.removedIds);
  const entOv = Array.from(state.entityOverrides.entries()); // [id, {x,y,z,hp}]
  const seen = Array.from(state.seen).slice(0, 40000);

  const payload = {
    v: 2,
    seed: state.world.seedStr,
    fog: fogEnabled,
    player: state.player,
    inv: state.inv,
    removed,
    entOv,
    tileOv,
    seen,
    log: state.log.slice(-80),
  };

  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}

function importSave(saveStr) {
  try {
    const json = decodeURIComponent(escape(atob(saveStr)));
    const payload = JSON.parse(json);
    if (!payload || payload.v !== 2) return null;

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
      invOpen: true,
    };

    fogEnabled = !!payload.fog;

    // hydrate around player
    hydrateNearby(state);
    renderLog(state);
    renderInventory(state);

    return state;
  } catch {
    return null;
  }
}

function saveNow(state) {
  try {
    localStorage.setItem(SAVE_KEY, exportSave(state));
  } catch {
    // ignore
  }
}

function loadSaveOrNew() {
  try {
    const s = localStorage.getItem(SAVE_KEY);
    if (s) {
      const loaded = importSave(s);
      if (loaded) return loaded;
    }
  } catch {
    // ignore
  }
  const g = makeNewGame();
  renderInventory(g);
  saveNow(g);
  return g;
}

// ---------- Buttons ----------
document.getElementById("btnNew").addEventListener("click", () => {
  game = makeNewGame();
  renderInventory(game);
  saveNow(game);
});
document.getElementById("btnFog").addEventListener("click", () => {
  fogEnabled = !fogEnabled;
  saveNow(game);
});
document.getElementById("btnReset").addEventListener("click", () => {
  localStorage.removeItem(SAVE_KEY);
  game = makeNewGame();
  renderInventory(game);
  saveNow(game);
});
document.getElementById("btnExport").addEventListener("click", async () => {
  const save = exportSave(game);
  try {
    await navigator.clipboard.writeText(save);
    alert("Save copied to clipboard.");
  } catch {
    prompt("Copy this save string:", save);
  }
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
let game = loadSaveOrNew();
renderInventory(game);
renderLog(game);

document.addEventListener("keydown", (e) => onKey(game, e));

function loop() {
  draw(game);
  requestAnimationFrame(loop);
}
loop();