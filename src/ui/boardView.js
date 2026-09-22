// DOM 盤面の描画（renderMode: "text" のみ対応。sprite は後段で追加）
import { WIDTH, HEIGHT, PROMO_DEPTH, SENTE } from "../core/board.js";
import { FILE_KANJI, RANK_KANJI } from "./labels.js";
import { buildSpriteBox } from "./sprite.js";

// 本物の将棋盤の星（目印）と同じく、敵陣の境界が交わる4点に打つ。
// マスの左上の角がその交点なので、交点を右下に持つマスに印を付ける。
const STAR_COLS = [PROMO_DEPTH, WIDTH - PROMO_DEPTH];
const STAR_ROWS = [PROMO_DEPTH, HEIGHT - PROMO_DEPTH];

export function createBoardView(container, pieceDefs, { mercenaryDefs = {}, sprites = {}, coords = null } = {}) {
  const cells = [];
  let lastAnimatedToken = null;
  let mode = "text";

  container.innerHTML = "";
  // 目盛りも同じ列数・行数で並べる必要があるので、盤と目盛りの共通の親に置いて継承させる
  const scope = container.closest(".board-frame") || container;
  scope.style.setProperty("--cols", WIDTH);
  scope.style.setProperty("--rows", HEIGHT);

  for (let y = 0; y < HEIGHT; y++) {
    const row = [];
    for (let x = 0; x < WIDTH; x++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      if (STAR_COLS.includes(x) && STAR_ROWS.includes(y)) cell.classList.add("star");
      cell.dataset.x = String(x);
      cell.dataset.y = String(y);
      container.appendChild(cell);
      row.push(cell);
    }
    cells.push(row);
  }

  buildCoords(coords);

  // 盤の外側の筋（９〜１）と段（一〜八）の目盛り。棋譜の「５六」と盤を突き合わせるため
  function buildCoords(targets) {
    if (!targets) return;
    const fill = (el, labels) => {
      if (!el) return;
      el.innerHTML = "";
      for (const text of labels) {
        const span = document.createElement("span");
        span.textContent = text;
        el.appendChild(span);
      }
    };
    fill(targets.files, FILE_KANJI.slice(0, WIDTH));
    fill(targets.ranks, RANK_KANJI.slice(0, HEIGHT));
  }

  // 傭兵は絵も漢字も元の駒と同じなので、名前を出さないと盤上でどれが何か分からない。
  // 能力を失った駒（abilityLost）はもう普通の駒なので出さない。
  function mercenaryNameBadge(piece) {
    if (!piece.mercenaryId || piece.abilityLost) return null;
    const def = mercenaryDefs[piece.mercenaryId];
    if (!def?.name) return null;
    // 盤上の帯は狭いので、長い名前は shortName（「初手駆けの歩」→「初歩」）を使う。
    // 正式名は編成画面とマウスオーバーで読める。
    const name = def.shortName || def.name;
    const el = document.createElement("div");
    el.className = "piece-name";
    el.textContent = name;
    el.title = def.name;
    // 略称を用意していない長い名前が来ても収まるよう、字数で文字を小さくする
    el.style.setProperty("--name-len", String(name.length));
    return el;
  }

  // コストの高さを五角形の縁の色で示す（1〜3＝銀 / 4〜6＝金 / 7〜9＝赤）
  function costTierClass(mercenaryId) {
    const cost = mercenaryDefs[mercenaryId]?.cost;
    if (cost == null) return "tier-mid";
    if (cost <= 3) return "tier-low";
    if (cost <= 6) return "tier-mid";
    return "tier-high";
  }

  function buildPiece(piece) {
    const el = document.createElement("div");
    el.className = "piece" + (piece.owner === SENTE ? " sente" : " gote") + (piece.promoted ? " promoted" : "");
    if (piece.mercenaryId && !piece.abilityLost) {
      el.classList.add("mercenary", costTierClass(piece.mercenaryId));
    }
    if (piece.mercenaryId && piece.abilityLost) el.classList.add("ex-mercenary");

    const displayType = piece.promotedAs || piece.type;
    const def = pieceDefs[displayType];
    const label = piece.promoted ? def.promotedName || def.name : def.name;

    if (mode === "sprite" && spriteFor(piece)) {
      el.classList.add("sprite-mode");
      el.title = label;
    } else {
      el.innerHTML = `<span class="label">${label}</span>`;
      // 漢字モードでは絵の層が無いので、名前はこちらに入れる
      const badge = mercenaryNameBadge(piece);
      if (badge) el.appendChild(badge);
    }
    return el;
  }

  function spriteFor(piece) {
    const set = sprites[piece.owner] || sprites;
    return set ? set[piece.promotedAs || piece.type] : null;
  }

  // イラストは五角形の外側に重ねる。回転を受けないので後手側でも顔が正立する
  function buildSpriteOverlay(piece) {
    const entry = spriteFor(piece);
    if (!entry) return null;
    const displayType = piece.promotedAs || piece.type;
    const def = pieceDefs[displayType];
    const label = piece.promoted ? def.promotedName || def.name : def.name;

    const overlay = document.createElement("div");
    overlay.className = "piece-overlay" + (piece.promoted ? " promoted" : "");
    overlay.classList.add(piece.owner === SENTE ? "sente" : "gote");

    const ghost = document.createElement("div");
    ghost.className = "piece-ghost";
    ghost.textContent = label;

    // 切り抜き版がある絵は3層に重ねる：元画像 → 漢字 → 切り抜いたキャラ。
    // キャラが漢字の手前に立つので、イラストを隠さずに駒種が読める。
    // 2層は同じクラスを使うため、拡大率も位置も必ず一致する（ズレると二重像になる）。
    if (entry.cutout) {
      overlay.append(
        buildSpriteBox(entry, displayType, label, "backdrop"),
        ghost,
        buildSpriteBox({ kind: "image", url: entry.cutout }, displayType, label, "cutout")
      );
    } else {
      overlay.append(ghost, buildSpriteBox(entry, displayType, label));
    }

    // 名前は絵より手前。絵と同じくこの層は回転しないので、後手側でも文字は正立する
    const badge = mercenaryNameBadge(piece);
    if (badge) overlay.appendChild(badge);
    return overlay;
  }

  function wrap(pieceEl, overlayEl) {
    const holder = document.createElement("div");
    holder.className = "piece-anim";
    holder.appendChild(pieceEl);
    if (overlayEl) holder.appendChild(overlayEl);
    return holder;
  }

  // 取られた駒は既に盤上から消えているので、残像だけを重ねて被弾を見せる
  function buildGhost(type, owner) {
    const ghost = wrap(buildPiece({ type, owner, promoted: false, mercenaryId: null, abilityLost: true }));
    ghost.classList.add("ghost");
    ghost.style.animation = "piece-hit 0.3s ease-out forwards";
    return ghost;
  }

  function render(board, { selected = null, highlights = [], lastMove = null, checkedKingSquare = null, animate = false, animationToken = null, renderMode = "text" } = {}) {
    mode = renderMode;
    const isNewMove = animationToken !== null && animationToken !== lastAnimatedToken;
    if (animationToken !== null) lastAnimatedToken = animationToken;
    const anim = animate && isNewMove && lastMove ? lastMove : null;
    const abilityAt = anim && anim.abilityEvent ? anim.abilityEvent : null;

    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const cell = cells[y][x];
        const piece = board[y][x];
        cell.innerHTML = "";
        cell.classList.toggle("selected", !!selected && selected.x === x && selected.y === y);
        cell.classList.toggle(
          "highlight",
          highlights.some((h) => h.x === x && h.y === y)
        );
        cell.classList.toggle(
          "last-move",
          !!lastMove && ((lastMove.from && lastMove.from.x === x && lastMove.from.y === y) || (lastMove.to.x === x && lastMove.to.y === y))
        );
        cell.classList.toggle("in-check", !!checkedKingSquare && checkedKingSquare.x === x && checkedKingSquare.y === y);

        if (piece) {
          const holder = wrap(buildPiece(piece), mode === "sprite" ? buildSpriteOverlay(piece) : null);
          applyPieceAnimation(holder, anim, abilityAt, x, y);
          cell.appendChild(holder);
        }

        if (anim && anim.captured && anim.to.x === x && anim.to.y === y) {
          cell.appendChild(buildGhost(anim.captured, anim.capturedOwner));
        }

        // 駒が盤から消える能力（影武者など）は、空いたマスで発動を知らせる
        if (abilityAt && !piece && abilityAt.x === x && abilityAt.y === y) {
          const flash = document.createElement("div");
          flash.className = "ability-flash";
          cell.appendChild(flash);
        }
      }
    }
  }

  function applyPieceAnimation(holder, anim, abilityAt, x, y) {
    if (!anim) return;
    const parts = [];

    const isTarget = anim.to.x === x && anim.to.y === y;
    const attackerStayedPut = anim.blocked && anim.from && anim.from.x === x && anim.from.y === y;

    if (attackerStayedPut) {
      // 盾歩に弾かれた側：踏み込んで戻る
      holder.style.setProperty("--dx", String(anim.to.x - anim.from.x));
      holder.style.setProperty("--dy", String(anim.to.y - anim.from.y));
      parts.push("piece-lunge 0.25s ease-out");
    } else if (isTarget && anim.from && !anim.blocked) {
      holder.style.setProperty("--dx", String(anim.from.x - anim.to.x));
      holder.style.setProperty("--dy", String(anim.from.y - anim.to.y));
      parts.push("piece-slide 0.2s ease-out");
      if (anim.promote) parts.push("piece-promote 0.4s ease-out 0.2s");
    } else if (isTarget && anim.drop) {
      parts.push("piece-drop 0.2s ease-out");
    }

    if (abilityAt && abilityAt.x === x && abilityAt.y === y) {
      parts.push(`piece-pulse 0.4s ease-in-out ${parts.length ? "0.2s" : "0s"}`);
    }

    if (parts.length) {
      holder.style.animation = parts.join(", ");
      holder.classList.add("animating");
    }
  }

  function onCellClick(handler) {
    container.addEventListener("click", (e) => {
      const cell = e.target.closest(".cell");
      if (!cell) return;
      handler({ x: Number(cell.dataset.x), y: Number(cell.dataset.y) });
    });
  }

  return { render, onCellClick };
}
