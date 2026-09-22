// 棋譜表示
import { squareLabel } from "./labels.js";

export function createLogView(container, pieceDefs) {
  function render(moveLog) {
    container.innerHTML = "";
    moveLog.forEach((entry, i) => {
      const li = document.createElement("li");
      const n = i + 1;
      const who = i % 2 === 0 ? "☖" : "☗"; // 手番前のオーナーに対応
      const name = pieceDefs[entry.piece || entry.drop].name;
      if (entry.type === "move") {
        li.textContent = `${n}. ${who} ${squareLabel(entry.from)}→${squareLabel(entry.to)} ${name}${entry.promote ? "成" : ""}${entry.captured ? "（" + pieceDefs[entry.captured].name + "を取る）" : ""}`;
      } else {
        li.textContent = `${n}. ${who} ${squareLabel(entry.to)} ${name}打`;
      }
      container.appendChild(li);
    });
    container.scrollTop = container.scrollHeight;
  }
  return { render };
}
