(() => {
  // ====== Config ======
  const TILE = 32;
  const W = 20;
  const H = 15;

  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");

  const logEl = document.getElementById("log");
  const classPill = document.getElementById("classPill");
  const turnPill = document.getElementById("turnPill");
  const classSelect = document.getElementById("classSelect");
  const pickBtn = document.getElementById("pickBtn");
  const restartBtn = document.getElementById("restartBtn");

  // ====== Utils ======
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sgn = (n) => (n === 0 ? 0 : n > 0 ? 1 : -1);

  function inBounds(x, y) {
    return x >= 0 && x < W && y >= 0 && y < H;
  }

  function manhattan(ax, ay, bx, by) {
    return Math.abs(ax - bx) + Math.abs(ay - by);
  }

  function log(msg) {
    logEl.textContent += msg + "\n";
    logEl.scrollTop = logEl.scrollHeight;
  }

  function normalizeDir(dx, dy) {
    // normalized to -1/0/1
    return [sgn(dx), sgn(dy)];
  }

  function dirToName([dx, dy]) {
    if (dx === 1 && dy === 0) return "→";
    if (dx === -1 && dy === 0) return "←";
    if (dx === 0 && dy === 1) return "↓";
    if (dx === 0 && dy === -1) return "↑";
    if (dx === 1 && dy === 1) return "↘";
    if (dx === 1 && dy === -1) return "↗";
    if (dx === -1 && dy === 1) return "↙";
    if (dx === -1 && dy === -1) return "↖";
    return "•";
  }

  // ====== Classes ======
  // Movement rules:
  // - vectors: allowed direction set ("cardinal" or "eight") and steps (like [1] or [1,2])
  // - relativeCardinal: allowed directions are forward/back/left/right relative to facing, and steps (we use [2] for archer)
  const CLASSES = {
    knight: {
      name: "Knight",
      hp: 18,
      atk: 5,
      range: 1,
      move: { type: "vectors", vectors: "cardinal", steps: [1] },
      // Attack: melee cone (front + two side offsets)
      attackTiles: (px, py, dir) => {
        const [dx, dy] = dir;
        return [
          [px + dx, py + dy],
          [px + dx + dy, py + dy + dx],
          [px + dx - dy, py + dy - dx],
        ];
      },
      desc: "1-tile 4-way move. Melee cone.",
    },

    barbarian: {
      name: "Barbarian",
      hp: 22,
      atk: 4,
      range: 1,
      move: { type: "vectors", vectors: "cardinal", steps: [1] },
      // Attack: sweep orthogonal
      attackTiles: (px, py) => [
        [px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1],
      ],
      desc: "1-tile 4-way move. Adjacent sweep.",
    },

    archer: {
      name: "Archer",
      hp: 14,
      atk: 4,
      range: 5,
      move: { type: "relativeCardinal", steps: [2] }, // 2 tiles only (relative to facing)
      // Attack: line shot
      attackTiles: (px, py, dir, state) => {
        const [dx, dy] = dir;
        const tiles = [];
        for (let i = 1; i <= state.player.range; i++) tiles.push([px + dx * i, py + dy * i]);
        return tiles;
      },
      desc: "2-tile strafe/forward/back relative to facing. Ranged line shot.",
    },

    mage: {
      name: "Mage",
      hp: 12,
      atk: 3,
      range: 0,
      move: { type: "vectors", vectors: "eight", steps: [1] }, // 1 tile any direction
      // Attack: AoE pulse radius 2 (manhattan)
      attackTiles: (px, py) => {
        const tiles = [];
        for (let y = py - 2; y <= py + 2; y++) {
          for (let x = px - 2; x <= px + 2; x++) {
            if (inBounds(x, y) && manhattan(px, py, x, y) <= 2) tiles.push([x, y]);
          }
        }
        return tiles;
      },
      desc: "1-tile 8-way move. AoE pulse.",
    },
  };

  function getAllowedMoveDirs(cls, facingDir) {
    const move = cls.move;
    const cardinal = [[1,0], [-1,0], [0,1], [0,-1]];
    const eight = [...cardinal, [1,1], [1,-1], [-1,1], [-1,-1]];

    if (move.type === "vectors") {
      return move.vectors === "eight" ? eight : cardinal;
    }

    if (move.type === "relativeCardinal") {
      const [fx, fy] = (facingDir[0] === 0 && facingDir[1] === 0) ? [1,0] : facingDir;
      const forward = [fx, fy];
      const backward = [-fx, -fy];
      const left = [-fy, fx];
      const right = [fy, -fx];
      return [forward, backward, left, right];
    }

    return cardinal;
  }

  // ====== State ======
  let state;
  let hover = { tx: -1, ty: -1, kind: "none" }; // kind: none|move|attack
  let previewTiles = [];

  function newGame() {
    state = {
      turn: 1,
      grid: makeGrid(),
      player: {
        x: 2, y: 2,
        dir: [1, 0], // facing
        clsKey: "knight",
        hp: CLASSES.knight.hp,
        maxHp: CLASSES.knight.hp,
        atk: CLASSES.knight.atk,
        range: CLASSES.knight.range,
      },
      enemies: [],
      flashTiles: [],
      picked: false,
      gameOver: false,
    };

    state.enemies = spawnEnemies(6);

    logEl.textContent = "";
    log("Pick a class. Left click empty tile to move. Left click enemy to attack.");
    syncUI();
    draw();
  }

  function makeGrid() {
    const g = Array.from({ length: H }, (_, y) =>
      Array.from({ length: W }, (_, x) => {
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1) return "#";
        return ".";
      })
    );

    for (let i = 0; i < 35; i++) {
      const x = 1 + Math.floor(Math.random() * (W - 2));
      const y = 1 + Math.floor(Math.random() * (H - 2));
      if ((x === 2 && y === 2) || (x === 3 && y === 2) || (x === 2 && y === 3)) continue;
      g[y][x] = "#";
    }
    return g;
  }

  function spawnEnemies(n) {
    const es = [];
    let tries = 0;
    while (es.length < n && tries++ < 2000) {
      const x = 1 + Math.floor(Math.random() * (W - 2));
      const y = 1 + Math.floor(Math.random() * (H - 2));
      if (state.grid[y][x] === "#") continue;
      if (x === state.player.x && y === state.player.y) continue;
      if (es.some(e => e.x === x && e.y === y)) continue;
      es.push({ x, y, hp: 8, atk: 2 });
    }
    return es;
  }

  function syncUI() {
    const cls = CLASSES[state.player.clsKey];
    classPill.textContent =
      `Class: ${cls.name} ${dirToName(state.player.dir)} — HP ${state.player.hp}/${state.player.maxHp} — ATK ${state.player.atk}`;
    turnPill.textContent = `Turn: ${state.turn}`;
  }

  function enemyAt(x, y) {
    return state.enemies.find(e => e.x === x && e.y === y) || null;
  }

  function isWall(x, y) {
    return !inBounds(x, y) || state.grid[y][x] === "#";
  }

  function isBlockedForMove(x, y) {
    if (!inBounds(x, y)) return true;
    if (state.grid[y][x] === "#") return true;
    if (enemyAt(x, y)) return true;
    return false;
  }

  // ====== Class pick ======
  function setClass(clsKey) {
    const cls = CLASSES[clsKey];
    state.player.clsKey = clsKey;
    state.player.hp = cls.hp;
    state.player.maxHp = cls.hp;
    state.player.atk = cls.atk;
    state.player.range = cls.range;
    state.picked = true;
    log(`Class locked: ${cls.name}. ${cls.desc}`);
    syncUI();
    draw();
  }

  // ====== Movement (mouse) ======
  function computeLegalMoves() {
    const cls = CLASSES[state.player.clsKey];
    const dirs = getAllowedMoveDirs(cls, state.player.dir);
    const steps = cls.move?.steps ?? [1];

    // This implementation uses the FIRST step length.
    // Archer is [2], mage is [1], etc.
    const stepCount = steps[0];

    const moves = []; // {x,y,path:[...], dir:[dx,dy]}
    for (const [dx, dy] of dirs) {
      let x = state.player.x;
      let y = state.player.y;
      const path = [];
      let blocked = false;

      for (let i = 0; i < stepCount; i++) {
        x += dx;
        y += dy;
        if (isBlockedForMove(x, y)) { blocked = true; break; }
        path.push([x, y]);
      }

      if (!blocked && path.length === stepCount) {
        moves.push({ x, y, path, dir: [dx, dy] });
      }
    }
    return moves;
  }

  function tryMoveTo(tx, ty) {
    if (state.gameOver) return;
    if (!state.picked) return log("Pick a class first.");

    const legal = computeLegalMoves();
    const m = legal.find(mv => mv.x === tx && mv.y === ty);
    if (!m) {
      log("That move isn't allowed for your class.");
      return;
    }

    // Apply movement
    state.player.x = tx;
    state.player.y = ty;
    state.player.dir = m.dir;

    log(`You move to (${tx}, ${ty}).`);
    endPlayerTurn();
  }

  // ====== Attacking (mouse) ======
  function getAttackTilesForFacing(dir) {
    const cls = CLASSES[state.player.clsKey];
    const tiles = cls.attackTiles(state.player.x, state.player.y, dir, state)
      .filter(([x, y]) => inBounds(x, y));
    return tiles;
  }

  function attackInDirection(dir) {
    if (state.gameOver) return;
    if (!state.picked) return log("Pick a class first.");

    const cls = CLASSES[state.player.clsKey];
    if (dir[0] === 0 && dir[1] === 0) dir = state.player.dir;

    state.player.dir = dir;

    const tiles = getAttackTilesForFacing(dir);
    state.flashTiles = tiles.slice(0, 80);

    let hits = 0;
    for (const [x, y] of tiles) {
      const e = enemyAt(x, y);
      if (!e) continue;
      e.hp -= state.player.atk;
      hits++;
    }

    state.enemies = state.enemies.filter(e => e.hp > 0);

    if (hits === 0) log(`You attack (${cls.name}) and hit nothing.`);
    else log(`You attack (${cls.name}) and hit ${hits} enemy${hits === 1 ? "" : "ies"}.`);

    if (state.enemies.length === 0) {
      log("YOU WIN (for now). Add floors next.");
      state.gameOver = true;
    }

    endPlayerTurn();
  }

  function tryAttackAt(tx, ty) {
    const e = enemyAt(tx, ty);
    if (!e) return;

    const dx = tx - state.player.x;
    const dy = ty - state.player.y;
    const dir = normalizeDir(dx, dy);

    // If archer, prefer cardinal aiming (no diagonal shots unless you're exactly diagonal)
    // (you can remove this if you want diagonal arrow shots)
    if (state.player.clsKey === "archer") {
      // force to cardinal based on larger component
      if (Math.abs(dx) >= Math.abs(dy)) attackInDirection([sgn(dx), 0]);
      else attackInDirection([0, sgn(dy)]);
      return;
    }

    // For others, allow diagonal aiming
    attackInDirection(dir);
  }

  // ====== Enemy Turn ======
  function enemyTurn() {
    const px = state.player.x;
    const py = state.player.y;

    for (const e of state.enemies) {
      if (state.gameOver) break;

      if (manhattan(e.x, e.y, px, py) === 1) {
        state.player.hp -= e.atk;
        log(`Enemy hits you for ${e.atk}. (HP ${state.player.hp}/${state.player.maxHp})`);
        if (state.player.hp <= 0) {
          state.player.hp = 0;
          state.gameOver = true;
          log("YOU DIED. Restart to try again.");
        }
        continue;
      }

      const dx = clamp(px - e.x, -1, 1);
      const dy = clamp(py - e.y, -1, 1);

      const options =
        Math.abs(px - e.x) > Math.abs(py - e.y)
          ? [[dx, 0], [0, dy], [0, -dy], [-dx, 0]]
          : [[0, dy], [dx, 0], [-dx, 0], [0, -dy]];

      for (const [mx, my] of options) {
        const nx = e.x + mx;
        const ny = e.y + my;
        if (nx === px && ny === py) continue;
        if (!isBlockedForMove(nx, ny)) { e.x = nx; e.y = ny; break; }
      }
    }
  }

  function endPlayerTurn() {
    if (state.gameOver) { syncUI(); draw(); return; }

    enemyTurn();

    state.turn++;
    syncUI();
    draw();

    // clear attack flash quickly
    setTimeout(() => {
      state.flashTiles = [];
      draw();
    }, 90);
  }

  // ====== Hover preview ======
  function updateHoverPreview(tx, ty) {
    hover.tx = tx;
    hover.ty = ty;
    previewTiles = [];

    if (!state.picked || state.gameOver) return;

    const e = enemyAt(tx, ty);
    if (e) {
      hover.kind = "attack";
      const dx = tx - state.player.x;
      const dy = ty - state.player.y;
      let dir = normalizeDir(dx, dy);

      if (state.player.clsKey === "archer") {
        dir = Math.abs(dx) >= Math.abs(dy) ? [sgn(dx), 0] : [0, sgn(dy)];
      }

      previewTiles = getAttackTilesForFacing(dir);
      return;
    }

    hover.kind = "move";
    const legal = computeLegalMoves();
    const m = legal.find(mv => mv.x === tx && mv.y === ty);
    if (m) previewTiles = m.path.slice();
  }

  // ====== Rendering ======
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // grid
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const wall = state.grid[y][x] === "#";
        ctx.fillStyle = wall ? "#171717" : "#0f0f0f";
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
        ctx.strokeStyle = "#121212";
        ctx.strokeRect(x * TILE + 0.5, y * TILE + 0.5, TILE, TILE);
      }
    }

    // show legal move destinations lightly (helps archer feel)
    if (state.picked && !state.gameOver) {
      const legal = computeLegalMoves();
      for (const m of legal) {
        ctx.fillStyle = "rgba(255,255,255,0.04)";
        ctx.fillRect(m.x * TILE, m.y * TILE, TILE, TILE);
      }
    }

    // hover preview tiles
    for (const [x, y] of previewTiles) {
      ctx.fillStyle = hover.kind === "attack"
        ? "rgba(255,77,77,0.14)"
        : "rgba(0,255,153,0.12)";
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    }

    // attack flash tiles
    for (const [x, y] of state.flashTiles) {
      ctx.fillStyle = "rgba(0,255,153,0.14)";
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    }

    // enemies
    for (const e of state.enemies) {
      ctx.fillStyle = "#ff4d4d";
      ctx.fillRect(e.x * TILE + 6, e.y * TILE + 6, TILE - 12, TILE - 12);

      // hp bar
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.fillRect(e.x * TILE + 6, e.y * TILE + 2, TILE - 12, 3);
      ctx.fillStyle = "rgba(255,77,77,0.9)";
      const w = Math.max(0, (TILE - 12) * (e.hp / 8));
      ctx.fillRect(e.x * TILE + 6, e.y * TILE + 2, w, 3);
    }

    // player
    ctx.fillStyle = "#00ff99";
    ctx.fillRect(state.player.x * TILE + 6, state.player.y * TILE + 6, TILE - 12, TILE - 12);

    // facing indicator
    ctx.fillStyle = "rgba(0,255,153,0.7)";
    const [dx, dy] = state.player.dir;
    ctx.fillRect(
      state.player.x * TILE + 14 + dx * 8,
      state.player.y * TILE + 14 + dy * 8,
      4, 4
    );

    // HUD
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, canvas.width, 28);
    ctx.fillStyle = "#eaeaea";
    const cls = CLASSES[state.player.clsKey]?.name ?? "?";
    ctx.fillText(
      `Class: ${cls} ${dirToName(state.player.dir)} | HP ${state.player.hp}/${state.player.maxHp} | Enemies ${state.enemies.length} | Turn ${state.turn}`,
      10, 18
    );

    if (!state.picked) {
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#eaeaea";
      ctx.fillText("Pick a class on the right to start.", 180, 240);
    }

    if (state.gameOver) {
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#eaeaea";
      ctx.fillText("Run ended. Restart to try again.", 190, 240);
    }
  }

  // ====== Mouse Input ======
  function canvasToTile(evt) {
    const rect = canvas.getBoundingClientRect();
    const mx = evt.clientX - rect.left;
    const my = evt.clientY - rect.top;
    const tx = Math.floor(mx / TILE);
    const ty = Math.floor(my / TILE);
    return [tx, ty];
  }

  canvas.addEventListener("mousemove", (evt) => {
    const [tx, ty] = canvasToTile(evt);
    if (!inBounds(tx, ty)) return;
    updateHoverPreview(tx, ty);
    draw();
  });

  canvas.addEventListener("mouseleave", () => {
    hover = { tx: -1, ty: -1, kind: "none" };
    previewTiles = [];
    draw();
  });

  canvas.addEventListener("click", (evt) => {
    if (state.gameOver) return;
    const [tx, ty] = canvasToTile(evt);
    if (!inBounds(tx, ty)) return;

    if (!state.picked) {
      log("Pick a class first.");
      return;
    }

    // click enemy = attack, click empty = move (if legal)
    const e = enemyAt(tx, ty);
    if (e) {
      tryAttackAt(tx, ty);
    } else {
      tryMoveTo(tx, ty);
    }
  });

  // ====== UI buttons ======
  pickBtn.addEventListener("click", () => setClass(classSelect.value));
  restartBtn.addEventListener("click", () => newGame());

  // Boot
  newGame();
})();
