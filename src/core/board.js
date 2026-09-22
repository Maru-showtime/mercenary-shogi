// 盤面の初期状態と基本操作
// board[y][x] : y=0 が後手側の最奥段（段1）、x=0 が左端

export const WIDTH = 9;
export const HEIGHT = 9;

// 敵陣の深さ（手前から何段目までが敵陣か）。
// 成りの判定（moves.js）と、盤に打つ星＝敵陣の境界（boardView.js）の両方がここを見る
export const PROMO_DEPTH = 3;

export const SENTE = 0;
export const GOTE = 1;

// 段1〜9の初期配置（駒種のみ。null=空マス）。通常の将棋と同じ配置。
// 手前 PROMO_DEPTH 段が後手、奥 PROMO_DEPTH 段が先手、間の3段が中立地帯。
const INITIAL_LAYOUT = [
  ["L", "N", "S", "G", "K", "G", "S", "N", "L"],
  [null, "R", null, null, null, null, null, "B", null],
  ["P", "P", "P", "P", "P", "P", "P", "P", "P"],
  [null, null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null, null],
  ["P", "P", "P", "P", "P", "P", "P", "P", "P"],
  [null, "B", null, null, null, null, null, "R", null],
  ["L", "N", "S", "G", "K", "G", "S", "N", "L"],
];

export function createPiece(type, owner, mercenaryId = null) {
  return {
    type,
    owner,
    promoted: false,
    mercenaryId,
    abilityLost: mercenaryId === null,
    abilityUsed: false,
  };
}

export function createInitialBoard() {
  const board = [];
  for (let y = 0; y < HEIGHT; y++) {
    const row = [];
    for (let x = 0; x < WIDTH; x++) {
      const type = INITIAL_LAYOUT[y][x];
      if (type === null) {
        row.push(null);
      } else {
        // 手前 PROMO_DEPTH 段が後手の陣。盤の段数を変えてもここは追従する
        const owner = y < PROMO_DEPTH ? GOTE : SENTE;
        row.push(createPiece(type, owner));
      }
    }
    board.push(row);
  }
  return board;
}

// 同じ駒種が複数枚ある場合の、選べる列（x）の一覧。左右対称なので先手・後手共通。
// 飛・角・玉は1枚しかないため選択の余地がなく、ここには含めない。
export const BASE_TYPE_FILES = {
  P: [0, 1, 2, 3, 4, 5, 6, 7, 8],
  L: [0, 8],
  N: [1, 7],
  S: [2, 6],
  G: [3, 5],
  K: [4],
};

// roster: { [SENTE]: [{id, x?}, ...], [GOTE]: [...] }（x省略時は空いている左側から自動で選ばれる）
// getMercenaryDef: (id) => { baseType, ... } | null（abilities.js から注入される）
export function createInitialBoardWithRoster(roster, getMercenaryDef) {
  const board = createInitialBoard();
  for (const owner of [SENTE, GOTE]) {
    const items = roster && roster[owner] ? roster[owner] : [];
    for (const item of items) {
      const id = typeof item === "string" ? item : item.id;
      const preferredX = typeof item === "string" ? null : item.x;
      const def = getMercenaryDef(id);
      if (!def) continue;
      const pos = findUnclaimedSquare(board, owner, def.baseType, preferredX);
      if (!pos) continue;
      board[pos.y][pos.x] = createPiece(def.baseType, owner, id);
    }
  }
  return board;
}

function findUnclaimedSquare(board, owner, baseType, preferredX) {
  let fallback = null;
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const p = board[y][x];
      if (p && p.owner === owner && p.type === baseType && !p.mercenaryId) {
        if (fallback === null) fallback = { x, y };
        if (preferredX != null && x === preferredX) return { x, y };
      }
    }
  }
  return fallback;
}

export function cloneBoard(board) {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

export function inBounds(x, y) {
  return x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT;
}

export function otherOwner(owner) {
  return owner === SENTE ? GOTE : SENTE;
}

export function createEmptyHands() {
  return { [SENTE]: {}, [GOTE]: {} };
}

export function cloneHands(hands) {
  return {
    [SENTE]: { ...hands[SENTE] },
    [GOTE]: { ...hands[GOTE] },
  };
}

export function addToHand(hands, owner, type) {
  hands[owner][type] = (hands[owner][type] || 0) + 1;
}

export function removeFromHand(hands, owner, type) {
  if (!hands[owner][type]) return false;
  hands[owner][type] -= 1;
  if (hands[owner][type] <= 0) delete hands[owner][type];
  return true;
}
