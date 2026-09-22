import { createGame, legalMovesFrom, legalDropSquares, makeMove, dropPiece } from "./core/game.js";
import { findKing, isInCheck, isForcedPromotion, isPromotionEligible, configureMercenaries } from "./core/abilities.js";
import { SENTE, GOTE, BASE_TYPE_FILES } from "./core/board.js";
import { createBoardView } from "./ui/boardView.js";
import { createHandView } from "./ui/handView.js";
import { createLogView } from "./ui/logView.js";
import { createDraftView, COST_CAP } from "./ui/draftView.js";
import { pickRandomRoster } from "./ai/roster.js";

// コスト調整でデータだけ差し替えることが多いので、キャッシュは必ずサーバーに確認させる
const loadData = (path) => fetch(path, { cache: "no-cache" }).then((r) => r.json());

const pieceDefs = await loadData("./src/data/pieces.json");
const mercenaryDefs = await loadData("./src/data/mercenaries.json");
const aiRosters = await loadData("./src/data/aiRosters.json");

// 駒のイラストの置き方は2通り（詳細は assets/sprites/README.md）
//   A) assets/sprites/P.png（または .svg）        … 1枚を両陣営で使う
//   B) assets/sprites/sente/P.png と gote/P.png  … 陣営ごとに別の絵。あればAより優先
// SVG はインラインで差し込むので、色を CSS 変数（--sp-armor 等）で差し替えられる。
const SPRITE_TYPES = ["P", "L", "N", "S", "G", "K", "R", "B"];
const SPRITE_DIR = "./assets/sprites";

// 差し替え用のPNGを常に優先する。順序を固定しないと、どちらが採用されるかが
// 読み込み順で変わってしまい、PNGを置いても古いSVGが表示されることがある
async function exists(path) {
  const res = await fetch(path, { cache: "no-cache" }).catch(() => null);
  return !!res && res.ok;
}

async function fetchSprite(dir, type) {
  for (const ext of ["webp", "png", "svg"]) {
    const path = `${dir}/${type}.${ext}`;
    const res = await fetch(path, { cache: "no-cache" }).catch(() => null);
    if (!res || !res.ok) continue;
    if (ext === "svg") return { kind: "svg", markup: await res.text() };

    // 背景ありの絵に「切り抜き版」が併置されていれば、漢字を挟んで3層に重ねる
    const cutoutPath = `${dir}/${type}_cutout.${ext}`;
    const cutout = (await exists(cutoutPath)) ? cutoutPath : null;
    return { kind: "image", url: path, cutout };
  }
  return null;
}

async function loadSprites() {
  const load = async (dir) => {
    const set = {};
    for (const type of SPRITE_TYPES) {
      const entry = await fetchSprite(dir, type);
      if (entry) set[type] = entry;
    }
    return set;
  };
  // 陣営別フォルダは、1枚でも置かれている時だけ読みに行く（無駄な404を出さないため）
  const hasPerSide = !!(await fetchSprite(`${SPRITE_DIR}/sente`, "K"));
  const shared = await load(SPRITE_DIR);
  if (!hasPerSide) return { [SENTE]: shared, [GOTE]: shared };
  const [sente, gote] = [await load(`${SPRITE_DIR}/sente`), await load(`${SPRITE_DIR}/gote`)];
  return {
    [SENTE]: { ...shared, ...sente },
    [GOTE]: { ...shared, ...gote },
  };
}

const sprites = await loadSprites();
configureMercenaries(mercenaryDefs);

let aiOwner = GOTE; // CPU戦でAIが受け持つ側。編成画面で切り替えられる
const aiWorker = new Worker(new URL("./ai/worker.js", import.meta.url), { type: "module" });

let state = null;
let selected = null; // { kind: "board"|"hand", x, y, type }
let roster = { [SENTE]: [], [GOTE]: [] };
let mode = "cpu"; // "cpu" | "local"
let aiThinking = false;

const draftScreenEl = document.getElementById("draft-screen");
const draftColumnsEl = document.getElementById("draft-columns");
const startGameBtn = document.getElementById("start-game");
const modeCpuEl = document.getElementById("mode-cpu");
const modeLocalEl = document.getElementById("mode-local");
const rerollAiBtn = document.getElementById("reroll-ai");
const aiSideSelectEl = document.getElementById("ai-side-select");
const aiGoteEl = document.getElementById("ai-gote");
const aiSenteEl = document.getElementById("ai-sente");
const gameScreenEl = document.getElementById("game-screen");
const boardEl = document.getElementById("board");
const handSenteEl = document.getElementById("hand-sente");
const handGoteEl = document.getElementById("hand-gote");
const logEl = document.getElementById("log");
const statusEl = document.getElementById("status");
const newGameBtn = document.getElementById("new-game");
const backToDraftBtn = document.getElementById("back-to-draft");
const animateToggleEl = document.getElementById("animate-toggle");

const ANIMATE_KEY = "shogi_animate";
let animationsEnabled = localStorage.getItem(ANIMATE_KEY) !== "off";
animateToggleEl.checked = animationsEnabled;
animateToggleEl.addEventListener("change", () => {
  animationsEnabled = animateToggleEl.checked;
  localStorage.setItem(ANIMATE_KEY, animationsEnabled ? "on" : "off");
});

const RENDER_KEY = "shogi_render_mode";
let renderMode = localStorage.getItem(RENDER_KEY) === "text" ? "text" : "sprite";
const spriteToggleEl = document.getElementById("sprite-toggle");
spriteToggleEl.checked = renderMode === "sprite";
spriteToggleEl.addEventListener("change", () => {
  renderMode = spriteToggleEl.checked ? "sprite" : "text";
  localStorage.setItem(RENDER_KEY, renderMode);
  render();
});

const draftView = createDraftView(draftColumnsEl, mercenaryDefs, pieceDefs, { sprites });
const boardView = createBoardView(boardEl, pieceDefs, {
  mercenaryDefs,
  sprites,
  coords: { files: document.getElementById("board-files"), ranks: document.getElementById("board-ranks") },
});
const handSenteView = createHandView(handSenteEl, SENTE, pieceDefs, { mercenaryDefs });
const handGoteView = createHandView(handGoteEl, GOTE, pieceDefs, { mercenaryDefs });
const logView = createLogView(logEl, pieceDefs);

// baseType の駒種のうち、この編成でまだ使われていない列（x）を左から選ぶ
function defaultXFor(items, baseType) {
  const used = items.filter((it) => mercenaryDefs[it.id].baseType === baseType).map((it) => it.x);
  const files = BASE_TYPE_FILES[baseType] || [null];
  const free = files.find((x) => !used.includes(x));
  return free !== undefined ? free : files[0];
}

function rerollAiRoster() {
  const items = [];
  for (const id of pickRandomRoster(aiRosters)) {
    // 傭兵を廃止したのに aiRosters.json を直し忘れると、ここで落ちて対局が始まらない。
    // データの不整合でゲームごと止まるのは割に合わないので、知らない ID は読み飛ばす
    const def = mercenaryDefs[id];
    if (!def) {
      console.warn(`aiRosters.json が存在しない傭兵 "${id}" を参照しています`);
      continue;
    }
    items.push({ id, x: defaultXFor(items, def.baseType) });
  }
  roster[aiOwner] = items;
}

function renderDraft() {
  const aiControlled = mode === "cpu" ? aiOwner : null;
  draftView.render(roster, { editable: { [SENTE]: SENTE !== aiControlled, [GOTE]: GOTE !== aiControlled } });
  const overCap = draftView.totalCost(roster[SENTE]) > COST_CAP || draftView.totalCost(roster[GOTE]) > COST_CAP;
  startGameBtn.disabled = overCap;
  aiSideSelectEl.hidden = mode !== "cpu";
}

draftView.onCountChange((owner, id, count) => {
  const list = roster[owner];
  const baseType = mercenaryDefs[id].baseType;
  let copies = list.filter((it) => it.id === id).length;
  while (copies < count) {
    list.push({ id, x: defaultXFor(list, baseType) });
    copies += 1;
  }
  while (copies > count) {
    list.splice(
      list.findLastIndex((it) => it.id === id),
      1
    );
    copies -= 1;
  }
  renderDraft();
});

draftView.onSlotChange((owner, id, index, x) => {
  const target = roster[owner].filter((it) => it.id === id)[index];
  if (!target) return;
  target.x = x;
  renderDraft();
});

// CPUの担当を入れ替える。人が組んだ編成は相手側へ移して残す
function setAiOwner(owner) {
  if (owner === aiOwner) return;
  [roster[SENTE], roster[GOTE]] = [roster[GOTE], roster[SENTE]];
  aiOwner = owner;
  renderDraft();
}

aiGoteEl.addEventListener("change", () => {
  if (aiGoteEl.checked) setAiOwner(GOTE);
});
aiSenteEl.addEventListener("change", () => {
  if (aiSenteEl.checked) setAiOwner(SENTE);
});

modeCpuEl.addEventListener("change", () => {
  if (!modeCpuEl.checked) return;
  mode = "cpu";
  rerollAiRoster();
  renderDraft();
});
modeLocalEl.addEventListener("change", () => {
  if (!modeLocalEl.checked) return;
  mode = "local";
  renderDraft();
});
rerollAiBtn.addEventListener("click", () => {
  rerollAiRoster();
  renderDraft();
});

startGameBtn.addEventListener("click", () => {
  state = createGame(roster);
  selected = null;
  draftScreenEl.hidden = true;
  gameScreenEl.hidden = false;
  logEl.hidden = false;
  render();
  maybeTriggerAI();
});

backToDraftBtn.addEventListener("click", () => {
  gameScreenEl.hidden = true;
  logEl.hidden = true;
  draftScreenEl.hidden = false;
  renderDraft();
});

newGameBtn.addEventListener("click", () => {
  if (!state) return;
  state = createGame(roster);
  selected = null;
  aiThinking = false;
  render();
  maybeTriggerAI();
});

function currentHighlights() {
  if (!state || !selected) return [];
  if (selected.kind === "board") return legalMovesFrom(state, selected.x, selected.y);
  return legalDropSquares(state, selected.type);
}

function statusText() {
  const turnName = state.turn === SENTE ? "先手" : "後手";
  if (state.status === "checkmate") {
    return `詰みです。${state.winner === SENTE ? "先手" : "後手"}の勝ち。`;
  }
  if (state.status === "sennichite_draw") {
    return "千日手により引き分けです。";
  }
  if (state.status === "perpetual_check_loss") {
    return `連続王手の千日手。${state.winner === SENTE ? "先手" : "後手"}の勝ち。`;
  }
  const check = isInCheck(state.board, state.turn) ? "（王手）" : "";
  if (aiThinking) return `${turnName}番${check}（AI思考中…）`;
  return `${turnName}番${check}`;
}

function render() {
  if (!state) return;
  const lastMove = state.moveLog[state.moveLog.length - 1] || null;
  let checkedKingSquare = null;
  if (state.status === "ongoing" && isInCheck(state.board, state.turn)) {
    checkedKingSquare = findKing(state.board, state.turn);
  }
  boardView.render(state.board, {
    selected: selected && selected.kind === "board" ? { x: selected.x, y: selected.y } : null,
    highlights: currentHighlights(),
    lastMove,
    checkedKingSquare,
    animate: animationsEnabled,
    animationToken: state.moveLog.length,
    renderMode,
  });
  const handTurn = state.status === "ongoing" && !isAiTurn() ? state.turn : null;
  handSenteView.render(state.hands, { selectedType: selected && selected.kind === "hand" && selected.owner === SENTE ? selected.type : null, activeTurn: handTurn, mercPool: state.mercPool });
  handGoteView.render(state.hands, { selectedType: selected && selected.kind === "hand" && selected.owner === GOTE ? selected.type : null, activeTurn: handTurn, mercPool: state.mercPool });
  logView.render(state.moveLog);
  statusEl.textContent = statusText();
  statusEl.classList.toggle("thinking", aiThinking);
}

function isAiTurn() {
  return mode === "cpu" && state && state.turn === aiOwner;
}

function maybeTriggerAI() {
  if (!state || state.status !== "ongoing" || !isAiTurn()) return;
  aiThinking = true;
  render();
  aiWorker.postMessage({ state, mercenaryDefs, options: { timeBudgetMs: 1500, maxDepth: 5 } });
}

aiWorker.onmessage = (e) => {
  const move = e.data.move;
  aiThinking = false;
  if (!state || state.status !== "ongoing" || !move) {
    render();
    return;
  }
  if (move.drop) {
    dropPiece(state, move.drop, move.to);
  } else {
    makeMove(state, move.from, move.to, true);
  }
  render();
  maybeTriggerAI();
};

function promptPromotion() {
  return window.confirm("成りますか？");
}

function clearSelection() {
  selected = null;
}

boardView.onCellClick(({ x, y }) => {
  if (!state || state.status !== "ongoing" || isAiTurn()) return;
  const piece = state.board[y][x];

  if (selected && selected.kind === "board") {
    const dests = legalMovesFrom(state, selected.x, selected.y);
    if (dests.some((d) => d.x === x && d.y === y)) {
      const moving = state.board[selected.y][selected.x];
      const promote = needsPromotionPrompt(moving, selected, { x, y }) ? promptPromotion() : undefined;
      makeMove(state, { x: selected.x, y: selected.y }, { x, y }, promote);
      clearSelection();
      render();
      maybeTriggerAI();
      return;
    }
  }

  if (selected && selected.kind === "hand") {
    const dests = legalDropSquares(state, selected.type);
    if (dests.some((d) => d.x === x && d.y === y)) {
      dropPiece(state, selected.type, { x, y });
      clearSelection();
      render();
      maybeTriggerAI();
      return;
    }
  }

  if (selected && selected.kind === "board" && selected.x === x && selected.y === y) {
    clearSelection();
  } else if (piece && piece.owner === state.turn) {
    selected = { kind: "board", x, y };
  } else {
    clearSelection();
  }
  render();
});

// 成り確認が必要か（強制成りや、そもそも成れない駒では確認を出さない）
function needsPromotionPrompt(piece, from, to) {
  if (piece.promoted) return false;
  if (isForcedPromotion(piece, to.x, to.y)) return false;
  return isPromotionEligible(piece, piece.owner, from.y, to.y);
}

function handlePieceHandClick(owner) {
  return (type) => {
    if (!state || state.status !== "ongoing" || state.turn !== owner || isAiTurn()) return;
    if (selected && selected.kind === "hand" && selected.owner === owner && selected.type === type) {
      clearSelection();
    } else {
      selected = { kind: "hand", owner, type };
    }
    render();
  };
}
handSenteView.onPieceClick(handlePieceHandClick(SENTE));
handGoteView.onPieceClick(handlePieceHandClick(GOTE));

rerollAiRoster();
renderDraft();
