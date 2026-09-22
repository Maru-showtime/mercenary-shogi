// 評価関数 = 駒の価値 + 位置評価 + 玉の安全度 + 傭兵能力の残存価値
import { HEIGHT, WIDTH, PROMO_DEPTH, SENTE, GOTE, inBounds } from "../core/board.js";
import { findKing, isInCheck, getMercenaryDef, isAbilityActive } from "../core/abilities.js";

const PIECE_VALUE = { P: 100, L: 300, N: 400, S: 500, G: 600, B: 800, R: 1000, K: 0 };
const PROMOTED_VALUE = { P: 600, L: 600, N: 600, S: 600, B: 1000, R: 1200 };

// 探索側が手の並べ替え（価値の高い駒を取る手から先に調べる）に使う
export function pieceValueOf(piece) {
  return pieceValue(piece);
}

function pieceValue(piece) {
  if (!piece.promoted) return PIECE_VALUE[piece.type];
  const displayType = piece.promotedAs || piece.type;
  if (piece.promotedAs) return PIECE_VALUE[displayType];
  return PROMOTED_VALUE[piece.type] ?? PIECE_VALUE[piece.type];
}

// 敵陣に近いほど加点（歩・香・桂・銀の攻め駒を前進させる誘因）。
// 基準は歩の初期段。盤の段数を変えても追従するよう HEIGHT から導く
const SENTE_PAWN_ROW = HEIGHT - PROMO_DEPTH;
const GOTE_PAWN_ROW = PROMO_DEPTH - 1;

function advancementBonus(piece, y) {
  if (piece.type === "G" || piece.type === "K" || piece.type === "R" || piece.type === "B") return 0;
  const distanceFromStart = piece.owner === SENTE ? SENTE_PAWN_ROW - y : y - GOTE_PAWN_ROW;
  return Math.max(0, distanceFromStart) * 8;
}

// 傭兵の能力がまだ生きている間だけ、コストに応じた残存価値を加える
function mercenaryResidualValue(piece) {
  if (!isAbilityActive(piece)) return 0;
  if (piece.abilityUsed) return 0; // 一度きりの能力を使い切っている場合は残存価値なし
  const def = getMercenaryDef(piece);
  if (!def) return 0;
  return Math.round(def.cost * 40);
}

// 玉の安全度：王手なら大きく減点、周囲8マスの自駒の数だけ少し加点（簡易な囲いの評価）
function kingSafety(board, owner) {
  let score = 0;
  if (isInCheck(board, owner)) score -= 250;
  const king = findKing(board, owner);
  if (!king) return score;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = king.x + dx;
      const y = king.y + dy;
      if (!inBounds(x, y)) continue;
      const p = board[y][x];
      if (p && p.owner === owner) score += 15;
    }
  }
  return score;
}

export function evaluate(board, hands) {
  let score = 0;
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const piece = board[y][x];
      if (!piece) continue;
      const sign = piece.owner === SENTE ? 1 : -1;
      score += sign * pieceValue(piece);
      score += sign * advancementBonus(piece, y);
      score += sign * mercenaryResidualValue(piece);
    }
  }
  for (const owner of [SENTE, GOTE]) {
    const sign = owner === SENTE ? 1 : -1;
    for (const type of Object.keys(hands[owner] || {})) {
      score += sign * (PIECE_VALUE[type] || 0) * (hands[owner][type] || 0) * 0.9;
    }
    score += sign * kingSafety(board, owner);
  }
  return score;
}

export function evaluateForTurn(state) {
  const score = evaluate(state.board, state.hands);
  return state.turn === SENTE ? score : -score;
}
