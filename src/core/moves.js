// 合法手生成（通常駒のみ。傭兵能力による拡張は abilities.js が担当）
import { WIDTH, HEIGHT, PROMO_DEPTH, SENTE, GOTE, inBounds, otherOwner } from "./board.js";

// 先手（下から上へ進む）を基準とした移動ベクトル。dy=-1 が前進。
// slide:true は距離無制限（他の駒に当たるまで）、false は1マスのみ。
const VECTORS = {
  P: [{ dx: 0, dy: -1, slide: false }],
  L: [{ dx: 0, dy: -1, slide: true }],
  N: [
    { dx: -1, dy: -2, slide: false },
    { dx: 1, dy: -2, slide: false },
  ],
  S: [
    { dx: 0, dy: -1, slide: false },
    { dx: -1, dy: -1, slide: false },
    { dx: 1, dy: -1, slide: false },
    { dx: -1, dy: 1, slide: false },
    { dx: 1, dy: 1, slide: false },
  ],
  G: [
    { dx: 0, dy: -1, slide: false },
    { dx: -1, dy: -1, slide: false },
    { dx: 1, dy: -1, slide: false },
    { dx: -1, dy: 0, slide: false },
    { dx: 1, dy: 0, slide: false },
    { dx: 0, dy: 1, slide: false },
  ],
  K: [
    { dx: 0, dy: -1, slide: false },
    { dx: 1, dy: -1, slide: false },
    { dx: 1, dy: 0, slide: false },
    { dx: 1, dy: 1, slide: false },
    { dx: 0, dy: 1, slide: false },
    { dx: -1, dy: 1, slide: false },
    { dx: -1, dy: 0, slide: false },
    { dx: -1, dy: -1, slide: false },
  ],
  R: [
    { dx: 0, dy: -1, slide: true },
    { dx: 0, dy: 1, slide: true },
    { dx: -1, dy: 0, slide: true },
    { dx: 1, dy: 0, slide: true },
  ],
  B: [
    { dx: -1, dy: -1, slide: true },
    { dx: 1, dy: -1, slide: true },
    { dx: -1, dy: 1, slide: true },
    { dx: 1, dy: 1, slide: true },
  ],
};
// 成り駒は金と同じ動き（+R, +B は例外で下記に個別定義）
VECTORS["+P"] = VECTORS.G;
VECTORS["+L"] = VECTORS.G;
VECTORS["+N"] = VECTORS.G;
VECTORS["+S"] = VECTORS.G;
VECTORS["+R"] = [
  ...VECTORS.R,
  { dx: -1, dy: -1, slide: false },
  { dx: 1, dy: -1, slide: false },
  { dx: -1, dy: 1, slide: false },
  { dx: 1, dy: 1, slide: false },
];
VECTORS["+B"] = [
  ...VECTORS.B,
  { dx: 0, dy: -1, slide: false },
  { dx: 0, dy: 1, slide: false },
  { dx: -1, dy: 0, slide: false },
  { dx: 1, dy: 0, slide: false },
];

// promotedAs: 龍騎銀→龍(+R) のように、成った瞬間に駒種そのものが
// 変わる能力を使った場合の上書き先（abilities.js が成り時に設定する）
export function pieceKey(piece) {
  if (!piece.promoted) return piece.type;
  return `+${piece.promotedAs || piece.type}`;
}

export function canPromote(type) {
  return type !== "G" && type !== "K";
}

// 敵陣への出入り・敵陣内での移動なら成れる
export function isInPromotionZone(owner, y) {
  return owner === SENTE ? y < PROMO_DEPTH : y >= HEIGHT - PROMO_DEPTH;
}

export function crossesPromotionZone(owner, fromY, toY) {
  return isInPromotionZone(owner, fromY) || isInPromotionZone(owner, toY);
}

// 行き所のない駒になるか（打つ時の禁止マス判定に使う。駒種＋段のみで判定）
export function hasNoFurtherMoves(type, owner, toY) {
  const forwardEdge = owner === SENTE ? 0 : HEIGHT - 1;
  if (type === "P" || type === "L") return toY === forwardEdge;
  if (type === "N") {
    return owner === SENTE ? toY <= 1 : toY >= HEIGHT - 2;
  }
  return false;
}

// 移動後にそのマスから幾何的に動けるマスが1つも無いか（傭兵の変則移動にも対応する強制成り判定用）
export function hasAnyGeometricMove(vectors, x, y) {
  return vectors.some((v) => inBounds(x + v.dx, y + v.dy));
}

// 先手基準のベクトルを駒の向きに合わせて反転する
export function ownerVectors(owner, vectors) {
  if (owner === SENTE) return vectors;
  return vectors.map((v) => ({ ...v, dx: -v.dx, dy: -v.dy }));
}

// 通常駒（傭兵能力なし）の移動ベクトル。abilities.js が能力込みのベクトルを作る際の基礎になる。
export function baseVectors(piece) {
  const base = VECTORS[pieceKey(piece)];
  if (!base) return [];
  return ownerVectors(piece.owner, base);
}

// 与えられたベクトル集合から実際の到達マス一覧を求める（自分の駒を取る手は含まない）。
// vector.maxSteps があれば、slide でもその歩数までしか進めない。
export function destinationsFromVectors(board, x, y, owner, vectors) {
  const dests = [];
  for (const v of vectors) {
    let cx = x + v.dx;
    let cy = y + v.dy;
    let steps = 1;
    while (inBounds(cx, cy)) {
      const target = board[cy][cx];
      if (target === null) {
        dests.push({ x: cx, y: cy });
      } else {
        if (target.owner !== owner) dests.push({ x: cx, y: cy });
        break;
      }
      if (!v.slide || (v.maxSteps && steps >= v.maxSteps)) break;
      cx += v.dx;
      cy += v.dy;
      steps += 1;
    }
  }
  return dests;
}

// 傭兵能力を考慮しない、通常駒としての到達マス一覧
export function pieceDestinations(board, x, y) {
  const piece = board[y][x];
  if (!piece) return [];
  return destinationsFromVectors(board, x, y, piece.owner, baseVectors(piece));
}

export function findKing(board, owner) {
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const p = board[y][x];
      if (p && p.owner === owner && p.type === "K") return { x, y };
    }
  }
  return null;
}

// 打てるマスの一覧（二歩・行き所のない駒を除く。打ち歩詰めは rules.js で判定）
export function dropDestinations(board, owner, type) {
  const dests = [];
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      if (board[y][x] !== null) continue;
      if (type === "P") {
        let hasPawn = false;
        for (let yy = 0; yy < HEIGHT; yy++) {
          const p = board[yy][x];
          if (p && p.owner === owner && p.type === "P" && !p.promoted) {
            hasPawn = true;
            break;
          }
        }
        if (hasPawn) continue;
      }
      if (hasNoFurtherMoves(type, owner, y)) continue;
      dests.push({ x, y });
    }
  }
  return dests;
}
