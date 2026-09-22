// 傭兵能力の適用（移動パターンの変更、成りの上書き、取られた時の特殊処理、消滅ルール）
import { WIDTH, HEIGHT, SENTE, otherOwner } from "./board.js";
import { baseVectors, ownerVectors, destinationsFromVectors, canPromote, crossesPromotionZone, hasAnyGeometricMove } from "./moves.js";

let mercenaryDefs = {};

export function configureMercenaries(defs) {
  mercenaryDefs = defs;
}

export function getMercenaryDef(piece) {
  if (!piece.mercenaryId) return null;
  return mercenaryDefs[piece.mercenaryId] || null;
}

export function getMercenaryDefById(id) {
  return mercenaryDefs[id] || null;
}

export function allMercenaryDefs() {
  return mercenaryDefs;
}

export function isAbilityActive(piece) {
  return !!piece.mercenaryId && !piece.abilityLost;
}

function activeEffects(piece) {
  if (!isAbilityActive(piece)) return [];
  const def = getMercenaryDef(piece);
  return def ? def.effects : [];
}

// isFirstMove: この一局のまだ誰も指していない最初の1手を評価しているか（初手駆けの歩専用）
export function effectiveVectors(piece, isFirstMove = false) {
  let vectors = baseVectors(piece);
  const effects = activeEffects(piece);
  if (effects.length === 0) return vectors;

  for (const effect of effects) {
    if (effect.type === "removeMove") {
      const [ov] = ownerVectors(piece.owner, [effect.vector]);
      vectors = vectors.filter((v) => !(v.dx === ov.dx && v.dy === ov.dy));
    }
  }
  for (const effect of effects) {
    if (effect.type === "extraMove") {
      const [ov] = ownerVectors(piece.owner, [effect.vector]);
      vectors = [...vectors, ov];
    }
    if (effect.type === "firstMoveOnly" && isFirstMove) {
      const [ov] = ownerVectors(piece.owner, [effect.vector]);
      vectors = [...vectors, ov];
    }
  }
  return vectors;
}

// 傭兵能力込みの到達マス一覧
export function pieceDestinations(board, x, y, isFirstMove = false) {
  const piece = board[y][x];
  if (!piece) return [];
  return destinationsFromVectors(board, x, y, piece.owner, effectiveVectors(piece, isFirstMove));
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

export function isSquareAttacked(board, x, y, byOwner) {
  for (let sy = 0; sy < HEIGHT; sy++) {
    for (let sx = 0; sx < WIDTH; sx++) {
      const p = board[sy][sx];
      if (!p || p.owner !== byOwner) continue;
      const dests = pieceDestinations(board, sx, sy);
      if (dests.some((d) => d.x === x && d.y === y)) return true;
    }
  }
  return false;
}

export function isInCheck(board, owner) {
  const king = findKing(board, owner);
  if (!king) return false;
  return isSquareAttacked(board, king.x, king.y, otherOwner(owner));
}

export function isPromotionEligible(piece, owner, fromY, toY) {
  if (!canPromote(piece.type)) return false;
  const effects = activeEffects(piece);
  if (effects.some((e) => e.type === "cannotPromote")) return false;
  if (effects.some((e) => e.type === "promoteAnywhere")) return true;
  return crossesPromotionZone(owner, fromY, toY);
}

export function isForcedPromotion(piece, toX, toY) {
  if (!canPromote(piece.type)) return false;
  const effects = activeEffects(piece);
  if (effects.some((e) => e.type === "cannotPromote")) return false;
  return !hasAnyGeometricMove(effectiveVectors(piece, false), toX, toY);
}

// 龍騎銀のような「成った時の種類そのものが変わる」能力。通常は null（+元の駒種）。
export function promotionOverrideType(piece) {
  const effects = activeEffects(piece);
  const effect = effects.find((e) => e.type === "promoteTo");
  return effect ? effect.value : null;
}

export function getPromotionBonus(piece) {
  if (!isAbilityActive(piece)) return null;
  const def = getMercenaryDef(piece);
  return def && def.promotionBonus ? def.promotionBonus : null;
}

// 取られた時の処理。
//   survives : 盾歩のように取られず耐える
//   vanish   : 持ち駒にならず盤外へ消える（現在使用する傭兵は無し）
//   toOwner  : 帰還桂のように、相手ではなく自分の持ち駒として戻る
export function resolveCapture(defenderPiece) {
  const effects = activeEffects(defenderPiece);
  const survive = effects.find((e) => e.type === "surviveCapture");
  if (survive && !defenderPiece.abilityUsed) {
    return { survives: true, vanish: false, toOwner: false };
  }
  const vanish = effects.some((e) => e.type === "vanishOnCapture");
  // 消滅と帰還は両立しないので、消滅を優先する
  const toOwner = !vanish && effects.some((e) => e.type === "returnToOwnerOnCapture");
  return { survives: false, vanish, toOwner };
}

export function findActiveDecoy(board, owner) {
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const p = board[y][x];
      if (!p || p.owner !== owner) continue;
      const effects = activeEffects(p);
      if (effects.some((e) => e.type === "decoyKing")) return { x, y };
    }
  }
  return null;
}

export function hasReturnToOriginAbility(piece) {
  return activeEffects(piece).some((e) => e.type === "returnToOrigin") && !piece.abilityUsed;
}

// 初手駆けの歩など：一局の最初の1手が指された直後、使われなかった firstMoveOnly 能力を消す
export function expireFirstMoveOnlyAbilities(board) {
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const p = board[y][x];
      if (!p || !p.mercenaryId) continue;
      const def = getMercenaryDef(p);
      if (def && def.effects.some((e) => e.type === "firstMoveOnly")) {
        p.abilityLost = true;
      }
    }
  }
}
