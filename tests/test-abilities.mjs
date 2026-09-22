import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// リポジトリのどこに置いても、誰の環境でも動くよう、自分の位置から辿る
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
import { readFileSync } from "node:fs";

const BASE = join(REPO, "src/core") + "/";
const DATA = join(REPO, "src/data") + "/";

const { createGame, makeMove, dropPiece, legalMovesFrom, legalDropSquares } = await import(pathToFileURL(BASE + "game.js").href);
const { createInitialBoard, createInitialBoardWithRoster, HEIGHT, WIDTH, PROMO_DEPTH, SENTE, GOTE } = await import(pathToFileURL(BASE + "board.js").href);
const { configureMercenaries, getMercenaryDefById, isInCheck } = await import(pathToFileURL(BASE + "abilities.js").href);
const { getAllLegalMoves, isCheckmate } = await import(pathToFileURL(BASE + "rules.js").href);

// 初期配置の段は盤の高さから導く（盤サイズを変えてもテストが追従するように）
const PAWN = HEIGHT - PROMO_DEPTH; // 先手の歩の初期段

const mercenaries = JSON.parse(readFileSync(DATA + "mercenaries.json", "utf8"));
// 実装はあるが現在どの傭兵も使っていない効果を検証するための、テスト専用の定義
mercenaries.__test_vanish_pawn = {
  id: "__test_vanish_pawn",
  name: "テスト消滅歩",
  baseType: "P",
  cost: 1,
  description: "テスト専用。",
  effects: [{ type: "vanishOnCapture" }],
};
configureMercenaries(mercenaries);

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
function pc(type, owner, mercenaryId = null) {
  return { type, owner, promoted: false, mercenaryId, abilityLost: mercenaryId === null, abilityUsed: false };
}
function newGameWithBoard(board) {
  const g = createGame();
  g.board = board;
  g.turn = SENTE;
  return g;
}

// --- 龍騎銀：成ると龍(+R)になり、以後は龍として振る舞う ---
{
  const board = emptyBoard();
  board[7][8] = pc("K", SENTE);
  board[0][4] = pc("K", GOTE);
  board[3][4] = pc("S", SENTE, "dragon_silver");
  const g = newGameWithBoard(board);
  const res = makeMove(g, { x: 4, y: 3 }, { x: 4, y: 2 }, true);
  assert(res.ok && res.promoted, "龍騎銀が成る");
  const piece = g.board[2][4];
  assert(piece.type === "S" && piece.promotedAs === "R", "龍騎銀は type=S のまま promotedAs=R になる");
  assert(piece.abilityLost === true, "成った瞬間に能力は消滅する");
  // 龍(+R)の動きになっているか：斜め1マスに動けるはず（角の動きは銀にはない）
  g.turn = SENTE;
  const dests = legalMovesFrom(g, 4, 2);
  assert(dests.some((d) => d.x === 3 && d.y === 1), "龍として斜めにも動ける");
}

// --- 龍騎銀：取られたら元の銀として持ち駒になる ---
{
  const board = emptyBoard();
  board[7][8] = pc("K", SENTE);
  board[0][4] = pc("K", GOTE);
  board[3][4] = pc("S", SENTE, "dragon_silver");
  board[3][4].promoted = true;
  board[3][4].promotedAs = "R";
  board[3][4].abilityLost = true;
  board[2][4] = pc("P", GOTE); // 真上から直進で取らせる
  const g = newGameWithBoard(board);
  g.turn = GOTE;
  const res = makeMove(g, { x: 4, y: 2 }, { x: 4, y: 3 });
  assert(res.ok, "後手歩が龍(元銀)を取る");
  assert(g.hands[GOTE]["S"] === 1, "取られた龍騎銀は通常の銀として持ち駒になる");
}

// --- 盾歩：1回だけ耐えて取られない ---
{
  const board = emptyBoard();
  board[7][8] = pc("K", SENTE);
  board[0][4] = pc("K", GOTE);
  board[4][4] = pc("P", SENTE, "shield_pawn");
  board[3][4] = pc("P", GOTE);
  const g = newGameWithBoard(board);
  g.turn = GOTE;
  const res = makeMove(g, { x: 4, y: 3 }, { x: 4, y: 4 });
  assert(res.ok && res.blocked, "盾歩は耐えて攻撃側の手が空振りになる");
  assert(g.board[4][4] && g.board[4][4].type === "P" && g.board[4][4].owner === SENTE, "盾歩はその場に残る");
  assert(g.board[3][4] && g.board[3][4].owner === GOTE, "攻撃側の駒は移動していない");
  assert(g.board[4][4].abilityLost === true, "盾歩は発動後、通常の歩になる");
  assert(g.turn === SENTE, "手番は消費されて先手に渡る");
}

// --- 盾歩：成ると持ち駒に盾歩が1枚補充される ---
{
  const board = emptyBoard();
  board[7][8] = pc("K", SENTE);
  board[0][4] = pc("K", GOTE);
  board[3][4] = pc("P", SENTE, "shield_pawn");
  const g = newGameWithBoard(board);
  const res = makeMove(g, { x: 4, y: 3 }, { x: 4, y: 2 }, true);
  assert(res.ok && res.promoted, "盾歩が成る");
  assert(g.mercPool[SENTE].includes("shield_pawn"), "成りボーナスで盾歩が持ち駒プールに補充される");
  // 補充された盾歩を実際に打つと、ability を持ったまま盤上に現れる
  g.turn = SENTE;
  g.hands[SENTE]["P"] = 1;
  const dropRes = dropPiece(g, "P", { x: 0, y: 4 });
  assert(dropRes.ok, "補充された歩を打てる");
}

// --- vanishOnCapture：取られても持ち駒にならず消える ---
// この効果を使う傭兵（隠形歩）は廃止したが、エンジン側の実装は残っている。
// テストを消すと動作が壊れても気付けないので、テスト専用の定義で守っておく
{
  const board = emptyBoard();
  board[7][8] = pc("K", SENTE);
  board[0][4] = pc("K", GOTE);
  board[4][4] = pc("P", SENTE, "__test_vanish_pawn");
  board[3][4] = pc("P", GOTE);
  const g = newGameWithBoard(board);
  g.turn = GOTE;
  const res = makeMove(g, { x: 4, y: 3 }, { x: 4, y: 4 });
  assert(res.ok, "vanishOnCapture の駒を取る手は成功する");
  assert(!g.hands[GOTE]["P"], "vanishOnCapture の駒は相手の持ち駒にならない");
}

// --- 遊撃香：前に走れて、後ろと斜め4方向に1マス動ける ---
{
  const board = emptyBoard();
  board[8][8] = pc("K", SENTE);
  board[0][0] = pc("K", GOTE);
  board[4][4] = pc("L", SENTE, "reverse_lance");
  const g = newGameWithBoard(board);
  const dests = legalMovesFrom(g, 4, 4).map((d) => `${d.x},${d.y}`);
  assert(dests.includes("4,3") && dests.includes("4,0"), "遊撃香は前に走れる（香の動きは残る）");
  assert(dests.includes("4,5"), "遊撃香は後ろへ1マス引ける");
  assert(dests.includes("3,3") && dests.includes("5,3"), "遊撃香は斜め前へ1マス動ける");
  assert(dests.includes("3,5") && dests.includes("5,5"), "遊撃香は斜め後ろへ1マス動ける");
  assert(!dests.includes("3,4") && !dests.includes("5,4"), "遊撃香は真横には動けない");
  assert(!dests.includes("4,6"), "後ろは1マスまで（走れない）");
}

// --- 斜歩：斜め前にも動ける ---
{
  const board = emptyBoard();
  board[7][8] = pc("K", SENTE);
  board[0][4] = pc("K", GOTE);
  board[5][4] = pc("P", SENTE, "diagonal_pawn");
  const g = newGameWithBoard(board);
  const dests = legalMovesFrom(g, 4, 5);
  assert(dests.some((d) => d.x === 3 && d.y === 4), "斜歩は左斜め前に動ける");
  assert(dests.some((d) => d.x === 5 && d.y === 4), "斜歩は右斜め前に動ける");
  assert(dests.some((d) => d.x === 4 && d.y === 4), "斜歩は通常通り前にも動ける");
}

// --- 初手駆けの歩：最初の1手だけ2マス進める。2手目以降は消滅 ---
{
  const board = createInitialBoard();
  board[PAWN][4] = pc("P", SENTE, "opening_dash_pawn");
  const g = newGameWithBoard(board);
  const dests = legalMovesFrom(g, 4, PAWN);
  assert(dests.some((d) => d.x === 4 && d.y === PAWN - 1), "初手駆けの歩は1マス前進もできる");
  assert(dests.some((d) => d.x === 4 && d.y === PAWN - 2), "初手なら2マス前進できる");
  assert(!dests.some((d) => d.y < PAWN - 2), "3マス以上は進めない");
  // 別の駒を先に動かして1手目を消費させる
  const g2 = newGameWithBoard(createInitialBoard());
  g2.board[PAWN][4] = pc("P", SENTE, "opening_dash_pawn");
  const other = makeMove(g2, { x: 0, y: PAWN }, { x: 0, y: PAWN - 1 }); // 別の歩を動かす（1手目消費）
  assert(other.ok, "別の歩を動かせる（1手目を消費する前提が成立している）");
  const piece = g2.board[PAWN][4];
  assert(piece.abilityLost === true, "1手目が他の駒で消費されると能力は消滅する");
}

// --- 三方桂：桂馬の2方向＋正面2マス先。3方向とも「2段先」へ跳ぶ ---
{
  const board = emptyBoard();
  board[7][8] = pc("K", SENTE);
  board[0][4] = pc("K", GOTE);
  board[5][4] = pc("N", SENTE, "three_way_knight");
  const g = newGameWithBoard(board);
  const dests = legalMovesFrom(g, 4, 5).map((d) => `${d.x},${d.y}`).sort();
  assert(JSON.stringify(dests) === JSON.stringify(["3,3", "4,3", "5,3"]), "三方桂の跳び先が正しい: " + dests);
}

// --- 三方桂：3方向とも駒を跳び越せる（隣接が塞がっていても跳べる）---
{
  const board = emptyBoard();
  board[7][8] = pc("K", SENTE);
  board[0][0] = pc("K", GOTE);
  board[5][4] = pc("N", SENTE, "three_way_knight");
  // 目の前と斜め前を自駒で塞ぐ。桂馬なので跳び越せなければならない
  board[4][3] = pc("P", SENTE);
  board[4][4] = pc("P", SENTE);
  board[4][5] = pc("P", SENTE);
  const g = newGameWithBoard(board);
  const dests = legalMovesFrom(g, 4, 5).map((d) => `${d.x},${d.y}`).sort();
  assert(JSON.stringify(dests) === JSON.stringify(["3,3", "4,3", "5,3"]), "隣接が塞がっていても跳び越せる: " + dests);
}

// --- 帰還桂：跳んだ直前の位置に1回だけ戻れる ---
{
  const board = emptyBoard();
  board[7][8] = pc("K", SENTE);
  board[0][4] = pc("K", GOTE);
  board[5][4] = pc("N", SENTE, "return_knight");
  const g = newGameWithBoard(board);
  const res = makeMove(g, { x: 4, y: 5 }, { x: 3, y: 3 });
  assert(res.ok, "帰還桂が跳ぶ");
  // 後手が適当に何か動かす代わりに玉を動かす
  makeMove(g, { x: 4, y: 0 }, { x: 3, y: 0 });
  const dests = legalMovesFrom(g, 3, 3);
  assert(dests.some((d) => d.x === 4 && d.y === 5), "元の位置(4,5)へ戻る手が選べる");
  const res2 = makeMove(g, { x: 3, y: 3 }, { x: 4, y: 5 });
  assert(res2.ok, "帰還桂が元の位置へ戻る");
  assert(g.board[5][4].abilityUsed === true, "帰還桂の能力は使用済みになる");
}

// --- 竜牙角：最初から馬の動き、成りの概念を持たない ---
{
  const board = emptyBoard();
  board[7][8] = pc("K", SENTE);
  board[0][4] = pc("K", GOTE);
  board[4][4] = pc("B", SENTE, "fang_bishop");
  const g = newGameWithBoard(board);
  const dests = legalMovesFrom(g, 4, 4);
  assert(dests.some((d) => d.x === 4 && d.y === 3), "竜牙角は縦にも動ける（馬の動き）");
  // 敵陣に入っても成りが選べない
  board[1][4] = pc("B", SENTE, "fang_bishop");
  const g2 = newGameWithBoard(board);
  const res = makeMove(g2, { x: 4, y: 1 }, { x: 4, y: 0 }, true);
  assert(res.ok === false || res.promoted === false, "竜牙角は成れない");
}

// --- 蛮勇の王：前に2マス滑れるが、真後ろには下がれない ---
{
  const board = emptyBoard();
  board[5][4] = pc("K", SENTE, "brave_king");
  board[0][4] = pc("K", GOTE);
  const g = newGameWithBoard(board);
  const dests = legalMovesFrom(g, 4, 5).map((d) => `${d.x},${d.y}`).sort();
  assert(dests.includes("4,4"), "蛮勇の王は前1マスに進める");
  assert(dests.includes("4,3"), "蛮勇の王は前2マスに進める");
  assert(!dests.includes("4,2"), "蛮勇の王は前3マス以上には進めない");
  assert(!dests.includes("4,6"), "蛮勇の王は真後ろに下がれない");
  assert(dests.includes("3,6"), "蛮勇の王は斜め後ろには下がれる");
}

// --- 影武者：詰みを1回だけ無効化する ---
{
  // 香(0,7)は最初から効いているが、番兵の桂(0,4)がファイル0をふさいでいる。
  // その桂が跳んで退くことで、香の遠隔王手が生まれる（＝隣接しないので玉では取れない）
  const board = emptyBoard();
  board[0][0] = pc("K", GOTE);
  board[7][0] = pc("L", SENTE);
  board[4][0] = pc("N", SENTE);
  board[2][2] = pc("N", SENTE);
  board[3][2] = pc("N", SENTE);
  board[7][8] = pc("K", SENTE);
  board[2][8] = pc("G", GOTE, "decoy_gold"); // 王手筋から離れた場所に置き、合い駒で解決できないようにする
  const g = newGameWithBoard(board);
  const res = makeMove(g, { x: 0, y: 4 }, { x: 1, y: 2 }); // 番兵の桂が退き、香の王手が通る
  assert(res.ok, "桂が退いて香の王手が発生する");
  assert(g.status === "ongoing", "影武者が身代わりになるため詰みにならない: " + g.status);
  assert(g.board[2][8] === null, "影武者は盤上から消える");
}

// --- 盾歩と王手の関係（回帰テスト）---
// 「盾歩を取って王手を外す」手は、実際には弾かれて何も動かないので王手が外れない。
// これを合法としてしまうと、王手がかかったまま手番が渡り、次の手で玉を取られる。
{
  // 後手玉(4,0)。先手の盾歩(4,1)が王手。左右の逃げ道は香で封鎖するが、
  // 香は自分の筋しか利かないので盾歩(4,1)自体は「守られていない」＝取れるように見える
  function mate() {
    const board = emptyBoard();
    board[0][4] = pc("K", GOTE);
    board[1][4] = pc("P", SENTE, "shield_pawn");
    board[8][3] = pc("L", SENTE);
    board[8][5] = pc("L", SENTE);
    board[8][8] = pc("K", SENTE);
    const g = newGameWithBoard(board);
    g.turn = GOTE;
    return g;
  }

  const g = mate();
  assert(isInCheck(g.board, GOTE), "後手玉は王手を受けている");
  assert(getAllLegalMoves(g.board, g.hands, GOTE).length === 0, "盾歩を取る手は王手を外せないので合法手が無い");
  assert(isCheckmate(g.board, g.hands, GOTE), "盾歩が弾く局面は詰みと判定される");

  const g2 = mate();
  const res = makeMove(g2, { x: 4, y: 0 }, { x: 4, y: 1 });
  assert(!res.ok, "王手中に盾歩を取る手は指せない: " + JSON.stringify(res));
}

// --- 盾歩：王手されていなければ、盾歩を取りに行く手自体は合法（締めすぎない）---
{
  const board = emptyBoard();
  board[0][0] = pc("K", GOTE);
  board[8][8] = pc("K", SENTE);
  board[4][4] = pc("P", SENTE, "shield_pawn");
  board[3][4] = pc("G", GOTE); // 王手はかかっていない位置から盾歩を取りに行く
  const g = newGameWithBoard(board);
  g.turn = GOTE;
  assert(!isInCheck(g.board, GOTE), "後手玉は王手されていない");
  const res = makeMove(g, { x: 4, y: 3 }, { x: 4, y: 4 });
  assert(res.ok && res.blocked, "王手でなければ盾歩を取りに行く手は指せる（弾かれるだけ）");
}

// --- 保険：玉が取られたら対局を終わらせる ---
{
  // 合法手生成が正しければ起きない状況だが、万一起きても対局が続かないことを確認する
  const board = emptyBoard();
  board[0][4] = pc("K", GOTE);
  board[1][4] = pc("R", SENTE); // 後手玉に利いている状態で先手の手番にする
  board[8][8] = pc("K", SENTE);
  const g = newGameWithBoard(board);
  g.turn = SENTE;
  const res = makeMove(g, { x: 4, y: 1 }, { x: 4, y: 0 });
  assert(res.ok, "玉を取る手が実行される");
  assert(g.status === "checkmate" && g.winner === SENTE, "玉が消えたら決着する: " + g.status);
}

console.log("done");
