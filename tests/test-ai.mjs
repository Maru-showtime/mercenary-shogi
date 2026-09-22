import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// リポジトリのどこに置いても、誰の環境でも動くよう、自分の位置から辿る
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
import { readFileSync } from "node:fs";

const BASE = join(REPO, "src") + "/";
const { createGame, makeMove, dropPiece } = await import(pathToFileURL(BASE + "core/game.js").href);
const { HEIGHT, WIDTH, SENTE, GOTE } = await import(pathToFileURL(BASE + "core/board.js").href);
const { configureMercenaries } = await import(pathToFileURL(BASE + "core/abilities.js").href);
const { pickRandomMove, findBestMove } = await import(pathToFileURL(BASE + "ai/search.js").href);
const { pickRandomRoster } = await import(pathToFileURL(BASE + "ai/roster.js").href);

const mercenaries = JSON.parse(readFileSync(BASE + "data/mercenaries.json", "utf8"));
const aiRosters = JSON.parse(readFileSync(BASE + "data/aiRosters.json", "utf8"));
configureMercenaries(mercenaries);

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("ok:", msg);
  }
}

function applyMove(state, move) {
  if (move.drop) return dropPiece(state, move.drop, move.to);
  return makeMove(state, move.from, move.to, true);
}

// --- 段階1：ランダムAI同士の自動対戦（ルール実装のセルフプレイ検証） ---
{
  const GAMES = 15;
  const MAX_MOVES = 400;
  let completed = 0;
  let crashed = false;
  for (let g = 0; g < GAMES; g++) {
    const roster = {
      [SENTE]: pickRandomRoster(aiRosters),
      [GOTE]: pickRandomRoster(aiRosters),
    };
    const state = createGame(roster);
    let moveCount = 0;
    try {
      while (state.status === "ongoing" && moveCount < MAX_MOVES) {
        const move = pickRandomMove(state);
        if (!move) break;
        const res = applyMove(state, move);
        if (!res.ok) {
          throw new Error(`illegal move chosen by random picker at move ${moveCount}: ${JSON.stringify(move)} reason=${res.reason}`);
        }
        moveCount++;
      }
      if (moveCount < MAX_MOVES) completed++;
    } catch (err) {
      crashed = true;
      console.error(`game ${g} crashed:`, err);
      break;
    }
  }
  assert(!crashed, "ランダムAI同士の自動対戦で例外・反則手が発生しない");
  console.log(`info: ${completed}/${GAMES} 局が${MAX_MOVES}手以内に終局（純粋ランダムなので低くても異常ではない）`);
}

// --- findBestMove: 合法手を返し、時間内に完了する ---
{
  const state = createGame({ [SENTE]: ["dragon_silver"], [GOTE]: ["brave_king"] });
  const start = Date.now();
  const move = findBestMove(state, { timeBudgetMs: 1200, maxDepth: 4 });
  const elapsed = Date.now() - start;
  assert(!!move, "findBestMove が着手を返す");
  assert(elapsed < 3000, `時間予算内に完了する (${elapsed}ms)`);
  const res = applyMove(state, move);
  assert(res.ok, "findBestMove が返した手は合法である");
}

// --- findBestMove: 1手で詰みがある局面では、その詰みを見つける ---
{
  function emptyBoard() { return Array.from({ length: HEIGHT }, () => Array.from({ length: WIDTH }, () => null)); }
  function pc(type, owner) { return { type, owner, promoted: false, mercenaryId: null, abilityLost: true, abilityUsed: false }; }
  const board = emptyBoard();
  board[0][0] = pc("K", GOTE);
  board[1][1] = pc("P", GOTE); // (1,1)は自分の歩でふさがっている
  board[7][8] = pc("K", SENTE);
  board[6][2] = pc("R", SENTE); // まだ0筋には乗っていない飛
  board[2][2] = pc("N", SENTE); // (1,0)をカバーする桂
  const state = createGame();
  state.board = board;
  state.turn = SENTE;
  const move = findBestMove(state, { timeBudgetMs: 1500, maxDepth: 3 });
  const res = applyMove(state, move);
  assert(res.ok, "AIの指し手は合法");
  assert(state.status === "checkmate" && state.winner === SENTE, `AIが1手詰みを発見する（status=${state.status}）`);
}

console.log("done");
