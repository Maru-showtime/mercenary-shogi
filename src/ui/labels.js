// マス目の呼び名。将棋の慣習どおり、筋は右から1〜9、段は上から一〜八。
// 盤の目盛りと棋譜の両方がここを見るので、表記がずれることはない。
export const FILE_KANJI = ["９", "８", "７", "６", "５", "４", "３", "２", "１"];
export const RANK_KANJI = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];

export function squareLabel(pos) {
  return `${FILE_KANJI[pos.x]}${RANK_KANJI[pos.y]}`;
}
