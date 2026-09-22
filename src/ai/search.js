// 探索：ミニマックス＋アルファベータ枝刈り、反復深化、静止探索
import { cloneBoard, cloneHands, SENTE, GOTE } from "../core/board.js";
import { makeMove, dropPiece } from "../core/game.js";
import { getAllLegalMoves } from "../core/rules.js";
import { isInCheck } from "../core/abilities.js";
import { evaluateForTurn, pieceValueOf } from "./evaluate.js";

const MATE_SCORE = 1_000_000;
// 静止探索の深さ上限。取り合いが続く限り読むが、無制限だと時間を使い切る
const QUIESCE_MAX = 6;

function cloneMercPool(mercPool) {
  return { [SENTE]: [...mercPool[SENTE]], [GOTE]: [...mercPool[GOTE]] };
}

function cloneSearchState(state) {
  return {
    board: cloneBoard(state.board),
    hands: cloneHands(state.hands),
    mercPool: cloneMercPool(state.mercPool),
    turn: state.turn,
    moveLog: state.moveLog.slice(),
    positionHistory: state.positionHistory.slice(),
    checkHistory: state.checkHistory.slice(),
    status: "ongoing",
    winner: null,
  };
}

function applyMove(state, move) {
  if (move.drop) return dropPiece(state, move.drop, move.to);
  return makeMove(state, move.from, move.to, true); // 成れる時は常に成る（簡易ヒューリスティック）
}

function capturedPiece(board, move) {
  return move.drop ? null : board[move.to.y][move.to.x];
}

// 価値の高い駒を安い駒で取る手ほど先に調べる（枝刈りが早く効く）。
// 前回の反復で最善だった手があれば、それを最優先にする。
function orderMoves(board, moves, preferred) {
  const scored = moves.map((move) => {
    let score = 0;
    const victim = capturedPiece(board, move);
    if (victim) {
      const attacker = board[move.from.y][move.from.x];
      score = 10000 + pieceValueOf(victim) - pieceValueOf(attacker) / 10;
    }
    if (preferred && sameMove(move, preferred)) score += 1_000_000;
    return { move, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.move);
}

function sameMove(a, b) {
  if (!a || !b) return false;
  if (a.drop !== b.drop) return false;
  if (a.to.x !== b.to.x || a.to.y !== b.to.y) return false;
  if (!a.from || !b.from) return a.from === b.from;
  return a.from.x === b.from.x && a.from.y === b.from.y;
}

// 段階1：合法手からの完全ランダム選択（ルール実装のセルフプレイ検証用）
export function pickRandomMove(state) {
  const isFirstMove = state.moveLog.length === 0;
  const moves = getAllLegalMoves(state.board, state.hands, state.turn, isFirstMove);
  if (moves.length === 0) return null;
  return moves[Math.floor(Math.random() * moves.length)];
}

// 静止探索：駒の取り合いが落ち着くまで読む。
// これが無いと「読みの最後で駒を取った」局面を高く評価してしまい、
// 取り返されるのが見えずにタダで駒を渡す手を選ぶ。
function quiesce(state, alpha, beta, deadline, depth) {
  const standPat = evaluateForTurn(state);
  if (depth >= QUIESCE_MAX || Date.now() > deadline) return standPat;
  if (standPat >= beta) return beta;
  if (standPat > alpha) alpha = standPat;

  const moves = getAllLegalMoves(state.board, state.hands, state.turn);
  const captures = moves.filter((m) => capturedPiece(state.board, m));
  if (captures.length === 0) return alpha;

  for (const move of orderMoves(state.board, captures, null)) {
    const child = cloneSearchState(state);
    applyMove(child, move);
    const score = -quiesce(child, -beta, -alpha, deadline, depth + 1);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
    if (Date.now() > deadline) break;
  }
  return alpha;
}

function negamax(state, depth, alpha, beta, deadline) {
  if (state.status === "checkmate" || state.status === "perpetual_check_loss") {
    return -(MATE_SCORE + depth);
  }
  if (state.status === "sennichite_draw") return 0;
  if (Date.now() > deadline) return evaluateForTurn(state);
  if (depth === 0) return quiesce(state, alpha, beta, deadline, 0);

  const isFirstMove = state.moveLog.length === 0;
  const moves = getAllLegalMoves(state.board, state.hands, state.turn, isFirstMove);
  if (moves.length === 0) {
    return isInCheck(state.board, state.turn) ? -(MATE_SCORE + depth) : 0;
  }

  let best = -Infinity;
  for (const move of orderMoves(state.board, moves, null)) {
    const child = cloneSearchState(state);
    applyMove(child, move);
    const score = -negamax(child, depth - 1, -beta, -alpha, deadline);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta || Date.now() > deadline) break;
  }
  return best;
}

// 反復深化：時間切れになったら直前の深さの最善手を返す
export function findBestMove(state, { timeBudgetMs = 1500, maxDepth = 6 } = {}) {
  const isFirstMove = state.moveLog.length === 0;
  const rootMoves = getAllLegalMoves(state.board, state.hands, state.turn, isFirstMove);
  if (rootMoves.length === 0) return null;
  if (rootMoves.length === 1) return rootMoves[0];

  const deadline = Date.now() + timeBudgetMs;
  let bestMove = rootMoves[0];

  for (let depth = 1; depth <= maxDepth; depth++) {
    let alpha = -Infinity;
    let depthBestMove = null;
    let depthBestScore = -Infinity;
    let completed = true;

    for (const move of orderMoves(state.board, rootMoves, bestMove)) {
      const child = cloneSearchState(state);
      applyMove(child, move);
      const score = -negamax(child, depth - 1, -Infinity, -alpha, deadline);
      if (score > depthBestScore) {
        depthBestScore = score;
        depthBestMove = move;
      }
      if (depthBestScore > alpha) alpha = depthBestScore;
      if (Date.now() > deadline) {
        completed = false;
        break;
      }
    }

    // 時間切れで打ち切った深さは、一部の手しか見ていないので採用しない。
    // 採用すると、完成している前の深さの結果より悪い手に化けることがある。
    if (completed && depthBestMove) bestMove = depthBestMove;
    if (!completed) break;
  }

  return bestMove;
}
