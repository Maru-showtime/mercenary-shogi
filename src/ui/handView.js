// 持ち駒表示
import { SENTE } from "../core/board.js";

const HAND_ORDER = ["R", "B", "G", "S", "N", "L", "P"];

export function createHandView(container, owner, pieceDefs, { mercenaryDefs = {} } = {}) {
  container.innerHTML = "";
  container.classList.add("hand", owner === SENTE ? "hand-sente" : "hand-gote");

  // 盾歩が成ると持ち駒に盾歩が補充される。しかし持ち駒は駒種ごとの枚数しか持たないので、
  // 数字だけでは「次に打つ歩が盾歩になる」ことが分からない。そこで控えを名前で見せる。
  // 打つときは mercPool の先頭から使われるため、並び順がそのまま使用順になる。
  function pendingMercenaries(pool, type) {
    return pool.map((id) => mercenaryDefs[id]).filter((def) => def && def.baseType === type);
  }

  function render(hands, { selectedType = null, activeTurn = null, mercPool = null } = {}) {
    container.innerHTML = "";
    const hand = hands[owner];
    const pool = (mercPool && mercPool[owner]) || [];

    for (const type of HAND_ORDER) {
      const count = hand[type] || 0;
      const pending = pendingMercenaries(pool, type);
      // 持ち駒が0でも控えがあるなら行を出す。消すと補充されたこと自体に気付けない
      if (count === 0 && pending.length === 0) continue;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hand-piece" + (selectedType === type ? " selected" : "") + (count === 0 ? " awaiting" : "");
      btn.disabled = activeTurn !== owner || count === 0;
      btn.dataset.type = type;
      btn.innerHTML = `<span class="label">${pieceDefs[type].name}</span><span class="count">${count}</span>`;

      const pieceName = pieceDefs[type].name;
      pending.forEach((def, i) => {
        const tag = document.createElement("span");
        tag.className = "hand-merc";
        tag.textContent = def.shortName || def.name;
        if (count === 0) {
          tag.title = `${def.name}：${pieceName}を手に入れると打てる`;
        } else if (i === 0) {
          tag.title = `次に${pieceName}を打つと${def.name}になる`;
        } else {
          tag.title = `${def.name}（${i + 1}枚目に打つ${pieceName}）`;
        }
        btn.appendChild(tag);
      });

      container.appendChild(btn);
    }
  }

  function onPieceClick(handler) {
    container.addEventListener("click", (e) => {
      const btn = e.target.closest(".hand-piece");
      if (!btn || btn.disabled) return;
      handler(btn.dataset.type);
    });
  }

  return { render, onPieceClick };
}
