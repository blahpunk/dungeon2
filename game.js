// Infinite Explore-Generated Dungeon (no build tools)
// - Chunked deterministic generation with matching doors between chunks
// - Varied room shapes: rectangles, L-shapes, ovals
// - Corridors with varied width + occasional "drunk" routing
// - Connectivity pass guarantees no isolated rooms/corridors

const CHUNK = 32; // tiles per chunk side
const TILE = 16; // pixels per tile
const VIEW_RADIUS = 14; // tiles visible around player (square bounding box, circular LOS)
const WALL = "#";
const FLOOR = ".";
const DOOR = "+";

const DEFAULT_SAVE_KEY = "infinite_dungeon_save_v1";

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

// ---------- Math helpers ----------
function floorDiv(a, b) {
  // floor division that works for negatives
  return Math.floor(a / b);
}
function splitWorldToChunk(wx, wy) {
  const cx = floorDiv(wx, CHUNK);
  const cy = floorDiv(wy, CHUNK);
  const lx = wx - cx * CHUNK;
  const ly = wy - cy * CHUNK;
  return { cx, cy, lx, ly };
}
function keyXY(x, y) {
  return `${x},${y}`;
}
function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < CHUNK && y < CHUNK;
}

// ---------- Edge hashing so doors match between neighboring chunks ----------
function edgeCanonical(cx, cy, dir) {
  // Return canonical endpoints (ax,ay)-(bx,by) for the chunk-edge, so both sides share a key.
  let ax = cx,
    ay = cy,
    bx = cx,
    by = cy;

  if (dir === "E") {
    bx = cx + 1;
  } else if (dir === "W") {
    bx = cx - 1;
  } else if (dir === "S") {
    by = cy + 1;
  } else if (dir === "N") {
    by = cy - 1;
  } else {
    throw new Error("bad dir");
  }

  // canonical ordering
  if (ax > bx || (ax === bx && ay > by)) {
    [ax, bx] = [bx, ax];
    [ay, by] = [by, ay];
  }
  return { ax, ay, bx, by };
}
function edgeInfo(seedStr, cx, cy, dir) {
  const { ax, ay, bx, by } = edgeCanonical(cx, cy, dir);
  const rng = makeRng(`${seedStr}|edge|${ax},${ay}|${bx},${by}`);

  // Decide if this border has an opening (doorway to adjacent chunk).
  const open = rng() < 0.78;

  // Decide door position along the edge (shared).
  const pos = 2 + Math.floor(rng() * (CHUNK - 4)); // 2..CHUNK-3
  // Determine whether position is along X or Y:
  // If ax != bx => vertical adjacency => edge is vertical => pos is y
  const verticalAdj = ax !== bx;
  return { open, pos, verticalAdj };
}

// ---------- Chunk generation ----------
function newGrid(fill = WALL) {
  const g = new Array(CHUNK);
  for (let y = 0; y < CHUNK; y++) {
    g[y] = new Array(CHUNK).fill(fill);
  }
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
      const inside = (dx * dx) / rx2 + (dy * dy) / ry2 <= 1;
      if (inside) grid[y][x] = tile;
    }
  }
}

function carveLine(grid, x1, y1, x2, y2, width, tile = FLOOR) {
  // L-shaped path, either H then V or V then H chosen outside
  // This function assumes axis-aligned segments; caller calls twice if needed.
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

  // Sometimes do a "drunk-ish" biased walk for more organic corridors.
  if (rng() < 0.28) {
    let x = x1,
      y = y1;
    let safety = 500;
    while ((x !== x2 || y !== y2) && safety-- > 0) {
      // carve current
      for (let dy = -Math.floor(width / 2); dy <= Math.floor(width / 2); dy++) {
        for (let dx = -Math.floor(width / 2); dx <= Math.floor(width / 2); dx++) {
          const xx = x + dx,
            yy = y + dy;
          if (inBounds(xx, yy)) grid[yy][xx] = FLOOR;
        }
      }

      const dxTo = x2 - x;
      const dyTo = y2 - y;
      const stepChoices = [];

      // weighted toward target, but not deterministic straight-line
      if (dxTo !== 0) stepChoices.push({ x: x + Math.sign(dxTo), y, w: 3 });
      if (dyTo !== 0) stepChoices.push({ x, y: y + Math.sign(dyTo), w: 3 });

      // occasional sideways wobble
      if (rng() < 0.35) {
        stepChoices.push({ x: x + (rng() < 0.5 ? -1 : 1), y, w: 1 });
        stepChoices.push({ x, y: y + (rng() < 0.5 ? -1 : 1), w: 1 });
      }

      // pick weighted
      const total = stepChoices.reduce((s, c) => s + c.w, 0);
      let r = rng() * total;
      let chosen = stepChoices[0];
      for (const c of stepChoices) {
        r -= c.w;
        if (r <= 0) {
          chosen = c;
          break;
        }
      }
      x = Math.max(1, Math.min(CHUNK - 2, chosen.x));
      y = Math.max(1, Math.min(CHUNK - 2, chosen.y));
    }
    return;
  }

  // Otherwise L-corridor with a bend; sometimes add an offset bend for variety
  const bendOffset = rng() < 0.35 ? randInt(rng, -3, 3) : 0;

  if (rng() < 0.5) {
    const midX = Math.max(1, Math.min(CHUNK - 2, x2 + bendOffset));
    carveLine(grid, x1, y1, midX, y1, width);
    carveLine(grid, midX, y1, midX, y2, width);
    carveLine(grid, midX, y2, x2, y2, width);
  } else {
    const midY = Math.max(1, Math.min(CHUNK - 2, y2 + bendOffset));
    carveLine(grid, x1, y1, x1, midY, width);
    carveLine(grid, x1, midY, x2, midY, width);
    carveLine(grid, x2, midY, x2, y2, width);
  }
}

function placeInternalDoors(grid, rng) {
  // Convert some "wall between two floors" spots into doors.
  for (let y = 1; y < CHUNK - 1; y++) {
    for (let x = 1; x < CHUNK - 1; x++) {
      if (grid[y][x] !== WALL) continue;

      const n = grid[y - 1][x];
      const s = grid[y + 1][x];
      const w = grid[y][x - 1];
      const e = grid[y][x + 1];

      const floorish = (t) => t === FLOOR || t === DOOR;

      // Door candidate if it connects two opposite floors and the other two are walls.
      const ns = floorish(n) && floorish(s) && w === WALL && e === WALL;
      const we = floorish(w) && floorish(e) && n === WALL && s === WALL;

      if ((ns || we) && rng() < 0.55) {
        grid[y][x] = DOOR;
      }
    }
  }
}

function floodConnected(grid, sx, sy) {
  const passable = (t) => t === FLOOR || t === DOOR;
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
  // Find any passable tile to start.
  let start = null;
  for (let y = 1; y < CHUNK - 1 && !start; y++) {
    for (let x = 1; x < CHUNK - 1; x++) {
      if (grid[y][x] === FLOOR || grid[y][x] === DOOR) {
        start = { x, y };
        break;
      }
    }
  }
  if (!start) return;

  const passable = (t) => t === FLOOR || t === DOOR;

  // Iteratively connect disconnected islands by carving corridors to nearest connected tile.
  while (true) {
    const connected = floodConnected(grid, start.x, start.y);

    let islandTile = null;
    for (let y = 1; y < CHUNK - 1 && !islandTile; y++) {
      for (let x = 1; x < CHUNK - 1; x++) {
        if (!passable(grid[y][x])) continue;
        if (!connected.has(keyXY(x, y))) {
          islandTile = { x, y };
          break;
        }
      }
    }
    if (!islandTile) break;

    // Find nearest connected tile by brute force (chunk is small).
    let best = null;
    let bestD = Infinity;
    for (const k of connected) {
      const [cx, cy] = k.split(",").map(Number);
      const dx = cx - islandTile.x;
      const dy = cy - islandTile.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = { x: cx, y: cy };
      }
    }
    if (!best) break;

    // Carve corridor between islandTile and best.
    carveCorridor(grid, rng, islandTile.x, islandTile.y, best.x, best.y);
  }
}

function generateChunk(seedStr, cx, cy) {
  const rng = makeRng(`${seedStr}|chunk|${cx},${cy}`);
  const grid = newGrid(WALL);

  // Decide border doors (must match neighbors)
  const edges = {
    N: edgeInfo(seedStr, cx, cy, "N"),
    S: edgeInfo(seedStr, cx, cy, "S"),
    W: edgeInfo(seedStr, cx, cy, "W"),
    E: edgeInfo(seedStr, cx, cy, "E"),
  };

  // Room generation
  const rooms = [];
  const roomCount = randInt(rng, 2, 4);

  for (let i = 0; i < roomCount; i++) {
    const t = choice(rng, ["rect", "rect", "L", "oval"]); // bias toward rects
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
      // attach second rect to form an L
      const attach = choice(rng, ["right-down", "left-down", "right-up", "left-up"]);
      let x2 = x,
        y2 = y;

      if (attach.includes("right")) x2 = x + Math.max(1, w1 - Math.floor(w2 / 2));
      else x2 = Math.max(2, x - Math.floor(w2 / 2));

      if (attach.includes("down")) y2 = y + Math.max(1, h1 - Math.floor(h2 / 2));
      else y2 = Math.max(2, y - Math.floor(h2 / 2));

      x2 = Math.max(2, Math.min(CHUNK - 2 - w2, x2));
      y2 = Math.max(2, Math.min(CHUNK - 2 - h2, y2));

      carveRect(grid, x2, y2, w2, h2, FLOOR);

      const cxRoom = Math.floor((x + x2 + Math.floor(w1 / 2) + Math.floor(w2 / 2)) / 2);
      const cyRoom = Math.floor((y + y2 + Math.floor(h1 / 2) + Math.floor(h2 / 2)) / 2);
      rooms.push({ cx: cxRoom, cy: cyRoom });
    } else {
      // oval
      const rx = randInt(rng, 3, 6);
      const ry = randInt(rng, 3, 6);
      const ox = randInt(rng, 2 + rx, CHUNK - 3 - rx);
      const oy = randInt(rng, 2 + ry, CHUNK - 3 - ry);
      carveOval(grid, ox, oy, rx, ry, FLOOR);
      rooms.push({ cx: ox, cy: oy });
    }
  }

  // Connect rooms with corridors (simple chain + one extra cross-link sometimes)
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1];
    const b = rooms[i];
    carveCorridor(grid, rng, a.cx, a.cy, b.cx, b.cy);
  }
  if (rooms.length >= 3 && rng() < 0.6) {
    const a = rooms[0];
    const b = rooms[rooms.length - 1];
    carveCorridor(grid, rng, a.cx, a.cy, b.cx, b.cy);
  }

  // Carve border connections (doors that line up with neighboring chunks)
  const anchors = rooms.length ? rooms : [{ cx: Math.floor(CHUNK / 2), cy: Math.floor(CHUNK / 2) }];

  function nearestAnchor(x, y) {
    let best = anchors[0];
    let bestD = Infinity;
    for (const a of anchors) {
      const dx = a.cx - x;
      const dy = a.cy - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    return best;
  }

  function openDoorAt(edgeDir) {
    const info = edges[edgeDir];
    if (!info.open) return;

    if (edgeDir === "N") {
      const x = info.pos;
      grid[0][x] = DOOR;
      grid[1][x] = FLOOR;
      const a = nearestAnchor(x, 1);
      carveCorridor(grid, rng, x, 1, a.cx, a.cy);
    } else if (edgeDir === "S") {
      const x = info.pos;
      grid[CHUNK - 1][x] = DOOR;
      grid[CHUNK - 2][x] = FLOOR;
      const a = nearestAnchor(x, CHUNK - 2);
      carveCorridor(grid, rng, x, CHUNK - 2, a.cx, a.cy);
    } else if (edgeDir === "W") {
      const y = info.pos;
      grid[y][0] = DOOR;
      grid[y][1] = FLOOR;
      const a = nearestAnchor(1, y);
      carveCorridor(grid, rng, 1, y, a.cx, a.cy);
    } else if (edgeDir === "E") {
      const y = info.pos;
      grid[y][CHUNK - 1] = DOOR;
      grid[y][CHUNK - 2] = FLOOR;
      const a = nearestAnchor(CHUNK - 2, y);
      carveCorridor(grid, rng, CHUNK - 2, y, a.cx, a.cy);
    }
  }

  // Ensure at least one exit per chunk for playability.
  // (But still deterministic because it depends only on edgeInfo, not runtime state.)
  const openCount = ["N", "S", "W", "E"].reduce((n, d) => n + (edges[d].open ? 1 : 0), 0);
  if (openCount === 0) {
    // deterministically "force" the most stable edge: E
    edges.E.open = true;
  }

  openDoorAt("N");
  openDoorAt("S");
  openDoorAt("W");
  openDoorAt("E");

  // Safety: ensure everything passable is connected (no isolated blobs)
  ensureChunkConnectivity(grid, rng);

  // Add internal doors for flavor after connectivity
  placeInternalDoors(grid, rng);

  return { cx, cy, grid, edges };
}

// ---------- World ----------
class World {
  constructor(seedStr) {
    this.seedStr = seedStr;
    this.chunks = new Map(); // "cx,cy" -> chunk
  }
  chunkKey(cx, cy) {
    return `${cx},${cy}`;
  }
  getChunk(cx, cy) {
    const k = this.chunkKey(cx, cy);
    let c = this.chunks.get(k);
    if (!c) {
      c = generateChunk(this.seedStr, cx, cy);
      this.chunks.set(k, c);
    }
    return c;
  }
  getTile(wx, wy) {
    const { cx, cy, lx, ly } = splitWorldToChunk(wx, wy);
    const ch = this.getChunk(cx, cy);
    return ch.grid[ly][lx];
  }
  setTile(wx, wy, t) {
    const { cx, cy, lx, ly } = splitWorldToChunk(wx, wy);
    const ch = this.getChunk(cx, cy);
    ch.grid[ly][lx] = t;
  }
  isPassable(wx, wy) {
    const t = this.getTile(wx, wy);
    return t === FLOOR || t === DOOR;
  }
}

// ---------- Visibility (simple LOS with Bresenham) ----------
function bresenham(x0, y0, x1, y1) {
  const points = [];
  let dx = Math.abs(x1 - x0);
  let dy = Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1;
  let sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    points.push({ x: x0, y: y0 });
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
  return points;
}

function hasLineOfSight(world, x0, y0, x1, y1) {
  const pts = bresenham(x0, y0, x1, y1);
  // skip first point (player tile), allow seeing the end wall tile
  for (let i = 1; i < pts.length - 1; i++) {
    const t = world.getTile(pts[i].x, pts[i].y);
    if (t === WALL) return false;
  }
  return true;
}

// ---------- Game ----------
const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
const metaEl = document.getElementById("meta");

const viewSize = VIEW_RADIUS * 2 + 1;
canvas.width = viewSize * TILE;
canvas.height = viewSize * TILE;

let fogEnabled = true;

function randomSeedString() {
  // short, human-readable seed
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  const r = makeRng(`seedmaker|${Date.now()}|${Math.random()}`);
  for (let i = 0; i < 8; i++) s += alphabet[Math.floor(r() * alphabet.length)];
  return s;
}

function makeNewGame(seedStr = randomSeedString()) {
  const world = new World(seedStr);

  // spawn in chunk (0,0) inside a passable tile near center
  const ch = world.getChunk(0, 0);
  let px = 0,
    py = 0;

  // find the closest passable tile to the center of chunk 0,0
  const target = { x: Math.floor(CHUNK / 2), y: Math.floor(CHUNK / 2) };
  let best = null;
  let bestD = Infinity;
  for (let y = 1; y < CHUNK - 1; y++) {
    for (let x = 1; x < CHUNK - 1; x++) {
      const t = ch.grid[y][x];
      if (t !== FLOOR && t !== DOOR) continue;
      const dx = x - target.x;
      const dy = y - target.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = { x, y };
      }
    }
  }
  if (best) {
    px = best.x;
    py = best.y;
  }

  // world coords
  const player = { x: px, y: py };

  const seen = new Set(); // world keys of tiles seen at least once
  const visible = new Set(); // recomputed each frame

  return { world, player, seen, visible };
}

let game = loadSaveOrNew();

function computeVisibility() {
  const { world, player, seen, visible } = game;
  visible.clear();

  // generate chunks in a square around player (so draw/lookups are safe)
  const minX = player.x - VIEW_RADIUS - 1;
  const maxX = player.x + VIEW_RADIUS + 1;
  const minY = player.y - VIEW_RADIUS - 1;
  const maxY = player.y + VIEW_RADIUS + 1;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      world.getTile(x, y); // forces generation
    }
  }

  for (let dy = -VIEW_RADIUS; dy <= VIEW_RADIUS; dy++) {
    for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
      const wx = player.x + dx;
      const wy = player.y + dy;

      const dist2 = dx * dx + dy * dy;
      if (dist2 > VIEW_RADIUS * VIEW_RADIUS) continue;

      if (!fogEnabled) {
        const k = keyXY(wx, wy);
        visible.add(k);
        seen.add(k);
        continue;
      }

      if (hasLineOfSight(world, player.x, player.y, wx, wy)) {
        const k = keyXY(wx, wy);
        visible.add(k);
        seen.add(k);
      }
    }
  }
}

function draw() {
  const { world, player, seen, visible } = game;
  computeVisibility();

  // background
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // draw tiles in view
  for (let sy = 0; sy < viewSize; sy++) {
    for (let sx = 0; sx < viewSize; sx++) {
      const wx = player.x + (sx - VIEW_RADIUS);
      const wy = player.y + (sy - VIEW_RADIUS);
      const k = keyXY(wx, wy);

      const isVisible = visible.has(k);
      const isSeen = seen.has(k);

      if (!isSeen) continue;

      const t = world.getTile(wx, wy);

      // colors (simple)
      let fill = "#0b0e14"; // unseen
      if (t === WALL) fill = isVisible ? "#2a3142" : "#161b26";
      if (t === FLOOR) fill = isVisible ? "#0f1a2e" : "#0b1220";
      if (t === DOOR) fill = isVisible ? "#3a2f1e" : "#211a10";

      ctx.fillStyle = fill;
      ctx.fillRect(sx * TILE, sy * TILE, TILE, TILE);

      // tiny glyph for doors
      if (t === DOOR && (isVisible || !fogEnabled)) {
        ctx.fillStyle = "#d9b97a";
        ctx.fillRect(sx * TILE + Math.floor(TILE / 2) - 1, sy * TILE + 3, 2, TILE - 6);
      }
    }
  }

  // draw player
  ctx.fillStyle = "#7ce3ff";
  const px = VIEW_RADIUS * TILE;
  const py = VIEW_RADIUS * TILE;
  ctx.fillRect(px + 3, py + 3, TILE - 6, TILE - 6);

  // meta
  const { cx, cy, lx, ly } = splitWorldToChunk(player.x, player.y);
  metaEl.textContent =
    `seed: ${world.seedStr}\n` +
    `pos: (${player.x}, ${player.y})  chunk: (${cx}, ${cy})  local: (${lx}, ${ly})\n` +
    `fog: ${fogEnabled ? "on" : "off"}   chunks: ${world.chunks.size}`;
}

function tryMove(dx, dy) {
  const { world, player } = game;
  const nx = player.x + dx;
  const ny = player.y + dy;
  // generate target tile if needed
  world.getTile(nx, ny);

  if (world.isPassable(nx, ny)) {
    player.x = nx;
    player.y = ny;
    saveNow();
  }
}

function onKey(e) {
  const k = e.key.toLowerCase();

  if (k === "arrowup" || k === "w") {
    e.preventDefault();
    tryMove(0, -1);
  } else if (k === "arrowdown" || k === "s") {
    e.preventDefault();
    tryMove(0, 1);
  } else if (k === "arrowleft" || k === "a") {
    e.preventDefault();
    tryMove(-1, 0);
  } else if (k === "arrowright" || k === "d") {
    e.preventDefault();
    tryMove(1, 0);
  } else if (k === "r") {
    e.preventDefault();
    game = makeNewGame();
    saveNow();
  } else if (k === "f") {
    e.preventDefault();
    fogEnabled = !fogEnabled;
    saveNow();
  }
}

document.addEventListener("keydown", onKey);

document.getElementById("btnNew").addEventListener("click", () => {
  game = makeNewGame();
  saveNow();
});
document.getElementById("btnFog").addEventListener("click", () => {
  fogEnabled = !fogEnabled;
  saveNow();
});
document.getElementById("btnExport").addEventListener("click", async () => {
  const save = exportSave();
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
  if (loaded) {
    game = loaded;
    saveNow();
  } else {
    alert("Invalid save string.");
  }
});

// ---------- Save / Load ----------
function exportSave() {
  const { world, player, seen } = game;
  const payload = {
    v: 1,
    seed: world.seedStr,
    px: player.x,
    py: player.y,
    fog: fogEnabled,
    // store seen tiles as a compact array (optional; you can drop this if you want purely deterministic)
    seen: Array.from(seen).slice(0, 20000), // cap for safety
  };
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}

function importSave(saveStr) {
  try {
    const json = decodeURIComponent(escape(atob(saveStr)));
    const payload = JSON.parse(json);
    if (!payload || payload.v !== 1) return null;

    const g = makeNewGame(payload.seed);
    g.player.x = payload.px | 0;
    g.player.y = payload.py | 0;
    fogEnabled = !!payload.fog;

    if (Array.isArray(payload.seen)) {
      for (const k of payload.seen) g.seen.add(String(k));
    }
    // force surrounding generation
    g.world.getTile(g.player.x, g.player.y);
    return g;
  } catch {
    return null;
  }
}

function saveNow() {
  try {
    localStorage.setItem(DEFAULT_SAVE_KEY, exportSave());
  } catch {
    // ignore
  }
}

function loadSaveOrNew() {
  try {
    const s = localStorage.getItem(DEFAULT_SAVE_KEY);
    if (s) {
      const loaded = importSave(s);
      if (loaded) return loaded;
    }
  } catch {
    // ignore
  }
  const g = makeNewGame();
  saveNow();
  return g;
}

// ---------- Main loop ----------
function loop() {
  draw();
  requestAnimationFrame(loop);
}
loop();