// 二歩・打ち歩詰め・行き所のない駒・千日手・詰みの判定
import { HEIGHT, WIDTH, cloneBoard, otherOwner } from "./board.js";
import { dropDestinations } from "./moves.js";
import { pieceDestinations, isInCheck, promotionOverrideType, resolveCapture } from "./abilities.js";

// 盤+持ち駒+手番から局面キーを作る（千日手判定用）
export function positionKey(board, hands, turn) {
  const b = board
    .map((row) =>
      row.map((c) => (c ? `${c.owner}${c.promoted ? "+" : ""}${c.type}` : "."))
        .join(",")
    )
    .join("|");
  const h = [0, 1]
    .map((owner) =>
      Object.keys(hands[owner])
        .sort()
        .map((t) => `${t}${hands[owner][t]}`)
        .join("")
    )
    .join("/");
  return `${b}#${h}#${turn}`;
}

function simulateBoardMove(board, from, to, promote) {
  const next = cloneBoard(board);
  const captured = next[to.y][to.x];

  // 盾歩のように取られるのを耐える駒が相手だと、攻撃側の駒はその場から動かない。
  // ここで「取れた」ことにして盤を進めると、王手を受けている側が
  // 「盾歩を取って王手を外す」手を合法と誤判定してしまう。
  // 実際には弾かれて何も動かず、王手がかかったまま手番だけ相手に渡り、
  // 次の手で玉を取られてしまう（対局が終わらないまま玉が消える）。
  if (captured && resolveCapture(captured).survives) {
    return { board: next, captured: null, blocked: true };
  }

  const piece = { ...next[from.y][from.x] };
  if (promote) {
    piece.promotedAs = promotionOverrideType(piece);
    piece.promoted = true;
    piece.abilityLost = true;
  }
  next[to.y][to.x] = piece;
  next[from.y][from.x] = null;
  return { board: next, captured };
}

function simulateDrop(board, to, owner, type) {
  const next = cloneBoard(board);
  next[to.y][to.x] = { type, owner, promoted: false, mercenaryId: null, abilityLost: true, abilityUsed: false };
  return next;
}

export function isMoveLegal(board, from, to, promote, owner) {
  const { board: next } = simulateBoardMove(board, from, to, promote);
  return !isInCheck(next, owner);
}

export function isDropLegal(board, hands, to, owner, type) {
  const next = simulateDrop(board, to, owner, type);
  if (isInCheck(next, owner)) return false;
  if (type === "P" && wouldBeUchifuzume(board, to, owner, hands)) return false;
  return true;
}

// 打ち歩詰め：この歩を打った直後、相手が詰みになるなら禁止
function wouldBeUchifuzume(board, to, owner, hands) {
  const opponent = otherOwner(owner);
  const next = simulateDrop(board, to, owner, "P");
  if (!isInCheck(next, opponent)) return false;
  return getAllLegalMoves(next, hands, opponent).length === 0;
}

// 指定オーナーが指せる全ての合法手（移動＋打ち）を返す
// isFirstMove: この一局でまだ誰も指していない最初の1手を評価しているか（初手駆けの歩用）
export function getAllLegalMoves(board, hands, owner, isFirstMove = false) {
  const moves = [];
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const p = board[y][x];
      if (!p || p.owner !== owner) continue;
      const dests = pieceDestinations(board, x, y, isFirstMove);
      for (const d of dests) {
        if (isMoveLegal(board, { x, y }, d, p.promoted, owner)) {
          moves.push({ from: { x, y }, to: d, drop: null });
        }
      }
    }
  }
  for (const type of Object.keys(hands[owner] || {})) {
    if (!hands[owner][type]) continue;
    const dests = dropDestinations(board, owner, type);
    for (const d of dests) {
      if (isDropLegal(board, hands, d, owner, type)) {
        moves.push({ from: null, to: d, drop: type });
      }
    }
  }
  return moves;
}

export function isCheckmate(board, hands, owner) {
  if (!isInCheck(board, owner)) return false;
  return getAllLegalMoves(board, hands, owner).length === 0;
}

export const SENNICHITE_LIMIT = 4;

export function checkSennichite(history, key) {
  const count = history.filter((k) => k === key).length;
  if (count < SENNICHITE_LIMIT) return null;
  return { draw: true, count };
}
