import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// リポジトリのどこに置いても、誰の環境でも動くよう、自分の位置から辿る
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = join(REPO, "src/core") + "/";
const { createGame, makeMove, dropPiece, legalMovesFrom, legalDropSquares } = await import(pathToFileURL(BASE + "game.js").href);
const { createInitialBoard, HEIGHT, WIDTH, PROMO_DEPTH, SENTE, GOTE } = await import(pathToFileURL(BASE + "board.js").href);
const { isCheckmate } = await import(pathToFileURL(BASE + "rules.js").href);

// 初期配置の段は盤の高さから導く（盤サイズを変えてもテストが追従するように）
const BACK = HEIGHT - 1; // 先手の最奥段
const PAWN = HEIGHT - PROMO_DEPTH; // 先手の歩の初期段

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("ok:", msg);
  }
}

function emptyBoard() {
  return Array.from({ length: HEIGHT }, () => Array.from({ length: WIDTH }, () => null));
}
function pc(type, owner) {
  return { type, owner, promoted: false, mercenaryId: null, abilityLost: true, abilityUsed: false };
}

// --- 1. 初期配置と手番 ---
{
  const g = createGame();
  assert(g.turn === SENTE, "初手は先手");
  assert(g.board[BACK][4].type === "K" && g.board[BACK][4].owner === SENTE, "先手玉の位置");
  assert(g.board[0][4].type === "K" && g.board[0][4].owner === GOTE, "後手玉の位置");
}

// --- 2. 通常移動（先手の歩の段） ---
{
  const g = createGame();
  const r = makeMove(g, { x: 4, y: PAWN }, { x: 4, y: PAWN - 1 });
  assert(r.ok, "先手歩 前進");
  assert(g.turn === GOTE, "手番が後手に移る");
}

// --- 3. 二歩の禁止（該当筋の歩を除いてから検証） ---
{
  const g = createGame();
  g.board[PAWN][4] = null; // 4筋の先手歩を除去
  g.hands[SENTE]["P"] = 1;
  const dests = legalDropSquares(g, "P");
  assert(!dests.some((d) => d.x === 3), "二歩: 歩が残っている筋には打てない");
  assert(dests.some((d) => d.x === 4), "歩を除去した筋には打てる");
}

// --- 4. 行き所のない駒（最奥段への歩打ち禁止） ---
{
  const g = createGame();
  g.board[PAWN][4] = null;
  g.hands[SENTE]["P"] = 1;
  const dests = legalDropSquares(g, "P");
  assert(!dests.some((d) => d.y === 0), "歩は最奥段(y=0)に打てない");
}

// --- 5. 強制成り（香が最奥段に達する） ---
{
  const board = emptyBoard();
  board[7][8] = pc("K", SENTE);
  board[0][4] = pc("K", GOTE);
  board[1][0] = pc("L", SENTE);
  const g = createGame();
  g.board = board;
  g.turn = SENTE;
  const moves = legalMovesFrom(g, 0, 1);
  assert(moves.some((m) => m.y === 0), "香が最奥段へ進める手が存在する");
  const res = makeMove(g, { x: 0, y: 1 }, { x: 0, y: 0 });
  assert(res.ok, "香を最奥段へ進める");
  assert(g.board[0][0].promoted === true, "行き所がない場合は強制成り");
}

// --- 6. 通常の成り（任意で選べる） ---
{
  function setup() {
    const board = emptyBoard();
    board[7][8] = pc("K", SENTE);
    board[0][4] = pc("K", GOTE);
    board[3][4] = pc("S", SENTE);
    const g = createGame();
    g.board = board;
    g.turn = SENTE;
    return g;
  }
  const g1 = setup();
  const res1 = makeMove(g1, { x: 4, y: 3 }, { x: 4, y: 2 }, false);
  assert(res1.ok && res1.promoted === false, "成らない選択ができる");

  const g2 = setup();
  const res2 = makeMove(g2, { x: 4, y: 3 }, { x: 4, y: 2 }, true);
  assert(res2.ok && res2.promoted === true, "成る選択ができる");
}

// --- 7. 詰み判定 ---
{
  // 後手玉(0,0)を角に、香の遠隔王手＋桂2枚で逃げ場を封じる典型形
  const board = emptyBoard();
  board[0][0] = pc("K", GOTE);
  board[7][0] = pc("L", SENTE); // ファイル0を効かせる（同ファイルに他の駒なし）
  board[2][2] = pc("N", SENTE); // (1,0) をカバー
  board[3][2] = pc("N", SENTE); // (1,1) をカバー
  board[7][8] = pc("K", SENTE);
  const g = createGame();
  g.board = board;
  assert(isCheckmate(g.board, g.hands, GOTE), "詰みが検出される");
}
{
  // 同じ形だが桂1枚を外すと (1,1) に逃げられるので詰みではない
  const board = emptyBoard();
  board[0][0] = pc("K", GOTE);
  board[7][0] = pc("L", SENTE);
  board[2][2] = pc("N", SENTE);
  board[7][8] = pc("K", SENTE);
  const g = createGame();
  g.board = board;
  assert(!isCheckmate(g.board, g.hands, GOTE), "逃げ場があれば詰みではない");
}

// --- 8. 千日手（同一局面4回で引き分け） ---
{
  // 王手が絡まないよう、離れた両玉だけを往復させる
  const board = emptyBoard();
  board[0][0] = pc("K", GOTE);
  board[7][8] = pc("K", SENTE);
  const g = createGame();
  g.board = board;
  g.turn = SENTE;
  g.positionHistory = [];
  g.checkHistory = [];
  for (let i = 0; i < 4 && g.status === "ongoing"; i++) {
    makeMove(g, { x: 8, y: 7 }, { x: 8, y: 6 });
    makeMove(g, { x: 0, y: 0 }, { x: 0, y: 1 });
    makeMove(g, { x: 8, y: 6 }, { x: 8, y: 7 });
    makeMove(g, { x: 0, y: 1 }, { x: 0, y: 0 });
  }
  assert(g.status === "sennichite_draw", "同一局面が4回で千日手引き分け: " + g.status);
}

// --- 9. 打ち歩詰めの禁止 ---
{
  const board = emptyBoard();
  board[0][0] = pc("K", GOTE);
  board[2][2] = pc("N", SENTE); // (1,0) をカバー
  board[3][2] = pc("N", SENTE); // (1,1) をカバー
  board[7][0] = pc("L", SENTE); // (0,1) に打った歩自体を後ろから支える
  board[7][8] = pc("K", SENTE);
  const g = createGame();
  g.board = board;
  g.turn = SENTE;
  g.hands[SENTE]["P"] = 1;
  const dests = legalDropSquares(g, "P");
  assert(!dests.some((d) => d.x === 0 && d.y === 1), "(0,1)への歩打ちで詰むため打ち歩詰めは禁止される");
}
{
  // 逃げ場がある場合は同じ位置への歩打ちも合法（詰みにならないため）
  const board = emptyBoard();
  board[0][0] = pc("K", GOTE);
  board[2][2] = pc("N", SENTE); // (1,0) のみカバー、(1,1)は空いている
  board[7][8] = pc("K", SENTE);
  const g = createGame();
  g.board = board;
  g.turn = SENTE;
  g.hands[SENTE]["P"] = 1;
  const dests = legalDropSquares(g, "P");
  assert(dests.some((d) => d.x === 0 && d.y === 1), "詰みにならない歩打ちは合法");
}

console.log("done");
