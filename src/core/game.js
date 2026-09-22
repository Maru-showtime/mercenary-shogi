// 対局の進行管理（手番、持ち駒、棋譜、詰み・千日手判定、傭兵能力の発動）
import {
  createInitialBoard,
  createInitialBoardWithRoster,
  cloneBoard,
  createEmptyHands,
  cloneHands,
  addToHand,
  removeFromHand,
  SENTE,
  GOTE,
  otherOwner,
} from "./board.js";
import { dropDestinations } from "./moves.js";
import {
  pieceDestinations,
  isInCheck,
  isForcedPromotion,
  isPromotionEligible,
  promotionOverrideType,
  getPromotionBonus,
  resolveCapture,
  findActiveDecoy,
  findKing,
  hasReturnToOriginAbility,
  expireFirstMoveOnlyAbilities,
  getMercenaryDefById,
} from "./abilities.js";
import { isMoveLegal, isDropLegal, isCheckmate, positionKey, checkSennichite } from "./rules.js";

export function createGame(roster) {
  const board = roster ? createInitialBoardWithRoster(roster, getMercenaryDefById) : createInitialBoard();
  const hands = createEmptyHands();
  const state = {
    board,
    hands,
    mercPool: { [SENTE]: [], [GOTE]: [] },
    turn: SENTE,
    moveLog: [],
    positionHistory: [positionKey(board, hands, SENTE)],
    checkHistory: [],
    status: "ongoing", // ongoing | checkmate | sennichite_draw | perpetual_check_loss
    winner: null,
  };
  return state;
}

function cloneMercPool(mercPool) {
  return { [SENTE]: [...mercPool[SENTE]], [GOTE]: [...mercPool[GOTE]] };
}

export function legalMovesFrom(state, x, y) {
  const piece = state.board[y][x];
  if (!piece || piece.owner !== state.turn) return [];
  const isFirstMove = state.moveLog.length === 0;
  const dests = pieceDestinations(state.board, x, y, isFirstMove).filter((d) =>
    isMoveLegal(state.board, { x, y }, d, piece.promoted, state.turn)
  );

  if (
    hasReturnToOriginAbility(piece) &&
    piece.prevX != null &&
    state.board[piece.prevY][piece.prevX] === null &&
    !dests.some((d) => d.x === piece.prevX && d.y === piece.prevY)
  ) {
    const back = { x: piece.prevX, y: piece.prevY };
    if (isMoveLegal(state.board, { x, y }, back, piece.promoted, state.turn)) {
      dests.push(back);
    }
  }
  return dests;
}

export function legalDropSquares(state, type) {
  if (!state.hands[state.turn][type]) return [];
  return dropDestinations(state.board, state.turn, type).filter((d) =>
    isDropLegal(state.board, state.hands, d, state.turn, type)
  );
}

// promote: true/false/undefined。強制成りの場合は自動で true 扱いになる。
export function makeMove(state, from, to, promote) {
  if (state.status !== "ongoing") return { ok: false, reason: "game_over" };
  const owner = state.turn;
  const piece = state.board[from.y][from.x];
  if (!piece || piece.owner !== owner) return { ok: false, reason: "no_piece" };

  const legal = legalMovesFrom(state, from.x, from.y);
  if (!legal.some((d) => d.x === to.x && d.y === to.y)) {
    return { ok: false, reason: "illegal" };
  }

  const isReturnMove = piece.prevX === to.x && piece.prevY === to.y && hasReturnToOriginAbility(piece);
  const captured = state.board[to.y][to.x];
  const captureOutcome = captured ? resolveCapture(captured) : null;

  const nextBoard = cloneBoard(state.board);
  const nextHands = cloneHands(state.hands);
  const nextMercPool = cloneMercPool(state.mercPool);

  if (captureOutcome && captureOutcome.survives) {
    // 盾歩などが耐える：攻撃側の駒は動けず、防御側はその場に残ってその能力を使い切る
    const defender = { ...captured, abilityUsed: true, abilityLost: true };
    nextBoard[to.y][to.x] = defender;
    applyResult(state, nextBoard, nextHands, nextMercPool, owner, {
      type: "move",
      from,
      to,
      piece: piece.type,
      promote: false,
      captured: null,
      blocked: true,
      abilityEvent: { type: "shieldBlock", x: to.x, y: to.y },
    });
    return { ok: true, blocked: true };
  }

  const forced = !piece.promoted && isForcedPromotion(piece, to.x, to.y);
  const eligible = !piece.promoted && isPromotionEligible(piece, owner, from.y, to.y);
  const doPromote = forced || (eligible && !!promote);

  const promotionBonus = doPromote ? getPromotionBonus(piece) : null;
  const movedPiece = { ...piece, prevX: from.x, prevY: from.y };
  if (isReturnMove) movedPiece.abilityUsed = true;
  if (doPromote) {
    movedPiece.promotedAs = promotionOverrideType(piece);
    movedPiece.promoted = true;
    movedPiece.abilityLost = true;
  }

  nextBoard[to.y][to.x] = movedPiece;
  nextBoard[from.y][from.x] = null;

  if (captured && !(captureOutcome && captureOutcome.vanish)) {
    addToHand(nextHands, owner, captured.type);
  }
  if (promotionBonus && promotionBonus.type === "refillMercenary") {
    nextMercPool[owner].push(promotionBonus.mercenaryId);
  }

  if (state.moveLog.length === 0) {
    expireFirstMoveOnlyAbilities(nextBoard);
  }

  let abilityEvent = null;
  if (captureOutcome && captureOutcome.vanish) {
    abilityEvent = { type: "vanish", x: to.x, y: to.y };
  } else if (isReturnMove) {
    abilityEvent = { type: "return", x: to.x, y: to.y };
  }

  applyResult(state, nextBoard, nextHands, nextMercPool, owner, {
    type: "move",
    from,
    to,
    piece: piece.type,
    promote: doPromote,
    captured: captured ? captured.type : null,
    capturedOwner: captured ? captured.owner : null,
    abilityEvent,
  });
  return { ok: true, promoted: doPromote };
}

export function dropPiece(state, type, to) {
  if (state.status !== "ongoing") return { ok: false, reason: "game_over" };
  const owner = state.turn;
  const squares = legalDropSquares(state, type);
  if (!squares.some((d) => d.x === to.x && d.y === to.y)) {
    return { ok: false, reason: "illegal" };
  }

  const nextMercPool = cloneMercPool(state.mercPool);
  const pool = nextMercPool[owner];
  const idx = pool.findIndex((id) => {
    const def = getMercenaryDefById(id);
    return def && def.baseType === type;
  });

  let piece;
  if (idx !== -1) {
    const mercenaryId = pool.splice(idx, 1)[0];
    piece = { type, owner, promoted: false, mercenaryId, abilityLost: false, abilityUsed: false, prevX: null, prevY: null };
  } else {
    piece = { type, owner, promoted: false, mercenaryId: null, abilityLost: true, abilityUsed: false, prevX: null, prevY: null };
  }

  const nextBoard = cloneBoard(state.board);
  nextBoard[to.y][to.x] = piece;
  const nextHands = cloneHands(state.hands);
  removeFromHand(nextHands, owner, type);

  applyResult(state, nextBoard, nextHands, nextMercPool, owner, { type: "drop", drop: type, to });
  return { ok: true };
}

function applyResult(state, nextBoard, nextHands, nextMercPool, mover, logEntry) {
  const opponent = otherOwner(mover);

  state.board = nextBoard;
  state.hands = nextHands;
  state.mercPool = nextMercPool;
  state.moveLog.push(logEntry);
  state.turn = opponent;

  // 保険：玉が盤から消えたら、その時点で決着させる。
  // 合法手生成が正しければ玉は取られないが、万一漏れても
  // 「玉がいないまま対局が続く」状態にはしない
  if (!findKing(state.board, opponent)) {
    state.status = "checkmate";
    state.winner = mover;
    return;
  }

  const gaveCheck = isInCheck(state.board, opponent);
  const key = positionKey(state.board, state.hands, state.turn);
  state.checkHistory.push({ key, mover, gaveCheck });
  state.positionHistory.push(key);

  if (isCheckmate(state.board, state.hands, opponent)) {
    const decoy = findActiveDecoy(state.board, opponent);
    if (decoy) {
      state.board[decoy.y][decoy.x] = null;
      logEntry.abilityEvent = { type: "decoy", x: decoy.x, y: decoy.y };
    } else {
      state.status = "checkmate";
      state.winner = mover;
      return;
    }
  }

  const rep = checkSennichite(state.positionHistory, key);
  if (rep) {
    const perpetualLoser = findPerpetualCheckLoser(state.checkHistory, key, rep.count);
    if (perpetualLoser !== null) {
      state.status = "perpetual_check_loss";
      state.winner = otherOwner(perpetualLoser);
    } else {
      state.status = "sennichite_draw";
    }
  }
}

// 直近 N 回の同一局面到達手が、すべて同じ側からの王手だったなら
// その側（王手をかけ続けた側）を返す。そうでなければ null。
function findPerpetualCheckLoser(checkHistory, key, count) {
  const occurrences = checkHistory.filter((h) => h.key === key);
  if (occurrences.length < count) return null;
  const last = occurrences.slice(-count);
  const mover = last[0].mover;
  const allSameMoverChecking = last.every((h) => h.mover === mover && h.gaveCheck);
  return allSameMoverChecking ? mover : null;
}

export function getPieceLabel(piece, pieceDefs) {
  const displayType = piece.promotedAs || piece.type;
  const def = pieceDefs[displayType];
  return piece.promoted ? def.promotedName || def.name : def.name;
}
