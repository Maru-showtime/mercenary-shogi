// 編成フェーズ：コスト上限10で、初期配置の通常駒を傭兵に差し替える
// 同じ傭兵を複数枚選べる。枚数ぶんのコストがかかり、駒種の枚数が上限になる。
import { SENTE, BASE_TYPE_FILES } from "../core/board.js";
import { buildSpriteBox } from "./sprite.js";

// 傭兵ごとの専用イラストは mercenaries.json の "image" で指定する（assets/sprites/ からの相対パス）。
// 未指定なら元の駒の絵をそのまま使う。専用の絵を描いたら1行足すだけで差し替わる。
const SPRITE_DIR = "./assets/sprites";

export const COST_CAP = 10;

const BASE_TYPE_ORDER = ["P", "L", "N", "S", "G", "K", "B", "R"];
// 初期配置に存在する各駒種の枚数（＝その種の傭兵を同時に置ける上限）
const BASE_TYPE_COUNT = { P: 9, L: 2, N: 2, S: 2, G: 2, K: 1, B: 1, R: 1 };

function fileLabel(x) {
  return `${9 - x}筋`;
}

function groupByBaseType(mercenaryDefs) {
  const groups = {};
  for (const def of Object.values(mercenaryDefs)) {
    (groups[def.baseType] ||= []).push(def);
  }
  for (const type of Object.keys(groups)) {
    groups[type].sort((a, b) => a.cost - b.cost);
  }
  return groups;
}

export function createDraftView(container, mercenaryDefs, pieceDefs, { sprites = {} } = {}) {
  const groups = groupByBaseType(mercenaryDefs);

  // 顔の切り出しは盤と同じ仕組み（.piece-sprite-<駒種> の --sprite-zoom / --sprite-shift）を使う。
  // そのため編成画面で見た顔と、盤に並んだときの顔が一致する。
  function buildFace(def, owner) {
    const face = document.createElement("div");
    face.className = "merc-face";
    // 盤上と同じ絵・同じ切り出しになるよう、mercId を付けて渡す
    const entry = def.image
      ? { kind: "image", url: `${SPRITE_DIR}/${def.image}`, mercId: def.id }
      : (sprites[owner] || sprites)[def.baseType];
    if (!entry) {
      // 絵が無いときは元の駒の漢字で代用する（表示が消えるよりは分かる）
      face.classList.add("no-image");
      face.textContent = pieceDefs[def.baseType].name;
      return face;
    }
    face.appendChild(buildSpriteBox(entry, def.baseType, def.name));
    return face;
  }

  function buildCard(def, owner, { selected = false } = {}) {
    const card = document.createElement("div");
    card.className = "merc-card" + (selected ? " checked" : "");
    card.appendChild(buildFace(def, owner));

    const body = document.createElement("div");
    body.className = "merc-body";

    const head = document.createElement("div");
    head.className = "merc-head";
    const name = document.createElement("span");
    name.className = "merc-name";
    name.textContent = def.name;
    const base = document.createElement("span");
    base.className = "merc-base";
    base.textContent = pieceDefs[def.baseType].name;
    // 数字だけだと何の数か分からないので「コスト」と添える
    const costWrap = document.createElement("span");
    costWrap.className = "merc-cost-wrap";
    const costLabel = document.createElement("span");
    costLabel.className = "merc-cost-label";
    costLabel.textContent = "コスト";
    const cost = document.createElement("span");
    cost.className = "merc-cost";
    cost.textContent = def.cost;
    costWrap.append(costLabel, cost);
    head.append(name, base, costWrap);

    const desc = document.createElement("p");
    desc.className = "merc-desc";
    desc.textContent = def.description;

    body.append(head, desc);
    card.appendChild(body);
    return { card, body };
  }

  function totalCost(items) {
    return items.reduce((sum, item) => sum + (mercenaryDefs[item.id]?.cost || 0), 0);
  }

  function countByBaseType(items, baseType) {
    return items.filter((item) => mercenaryDefs[item.id].baseType === baseType).length;
  }

  // この傭兵を何枚まで選べるか（駒種の枚数・コスト残額・傭兵固有の上限のうち最も小さいもの）
  function maxSelectable(items, def) {
    const current = items.filter((it) => it.id === def.id).length;
    const usedByOthers = countByBaseType(items, def.baseType) - current;
    const bySlots = BASE_TYPE_COUNT[def.baseType] - usedByOthers;
    const spent = totalCost(items) - current * def.cost;
    const byCost = Math.floor((COST_CAP - spent) / def.cost);
    const byRule = def.maxCount ?? Infinity;
    return Math.max(current, Math.min(bySlots, byCost, byRule));
  }

  // 編集できない側（CPU）の表示。選ばれた傭兵だけを同じカードで見せる
  function renderSummary(items, owner) {
    const list = document.createElement("div");
    list.className = "draft-summary";
    if (items.length === 0) {
      const empty = document.createElement("p");
      empty.className = "draft-empty";
      empty.textContent = "傭兵なし（通常の駒のみ）";
      list.appendChild(empty);
      return list;
    }
    for (const item of items) {
      const def = mercenaryDefs[item.id];
      const { card, body } = buildCard(def, owner, { selected: true });
      const files = BASE_TYPE_FILES[def.baseType];
      if (files && files.length > 1 && item.x != null) {
        const place = document.createElement("div");
        place.className = "merc-place";
        place.textContent = fileLabel(item.x);
        body.appendChild(place);
      }
      list.appendChild(card);
    }
    return list;
  }

  function buildCountSelect(owner, def, current, max, editable) {
    const select = document.createElement("select");
    select.className = "draft-count";
    select.dataset.owner = String(owner);
    select.dataset.id = def.id;
    select.dataset.role = "count";
    select.disabled = !editable;
    for (let n = 0; n <= max; n++) {
      const opt = document.createElement("option");
      opt.value = String(n);
      opt.textContent = String(n);
      if (n === current) opt.selected = true;
      select.appendChild(opt);
    }
    return select;
  }

  function buildSlotSelect(owner, def, items, copies, index, editable) {
    // 同じ駒種の他の傭兵・他のコピーが使っている列は選べない
    const usedElsewhere = items
      .filter((it) => mercenaryDefs[it.id].baseType === def.baseType && it !== copies[index])
      .map((it) => it.x);
    const files = BASE_TYPE_FILES[def.baseType];
    const options = files.filter((x) => x === copies[index].x || !usedElsewhere.includes(x));
    const select = document.createElement("select");
    select.className = "draft-slot";
    select.dataset.owner = String(owner);
    select.dataset.id = def.id;
    select.dataset.role = "slot";
    select.dataset.index = String(index);
    select.disabled = !editable;
    for (const x of options) {
      const opt = document.createElement("option");
      opt.value = String(x);
      opt.textContent = fileLabel(x);
      if (x === copies[index].x) opt.selected = true;
      select.appendChild(opt);
    }
    return select;
  }

  function render(rosters, { editable = { [SENTE]: true, 1: true } } = {}) {
    container.innerHTML = "";
    for (const owner of [SENTE, 1]) {
      const items = rosters[owner];
      const col = document.createElement("div");
      col.className = "draft-column";
      const heading = document.createElement("h3");
      heading.textContent = owner === SENTE ? "先手の編成" : "後手の編成";
      col.appendChild(heading);

      const cost = totalCost(items);
      const costEl = document.createElement("p");
      costEl.className = "draft-cost" + (cost > COST_CAP ? " over" : "");
      costEl.textContent = `コスト: ${cost} / ${COST_CAP}`;
      col.appendChild(costEl);

      // 編集できない側（CPU戦のAI）は、選ばれた傭兵だけを一覧で見せる
      if (!editable[owner]) {
        col.appendChild(renderSummary(items, owner));
        container.appendChild(col);
        continue;
      }

      for (const baseType of BASE_TYPE_ORDER) {
        const defs = groups[baseType];
        if (!defs) continue;
        const section = document.createElement("div");
        section.className = "draft-section";
        const label = document.createElement("div");
        label.className = "draft-section-title";
        label.textContent = `${pieceDefs[baseType].name}（最大${BASE_TYPE_COUNT[baseType]}枚）`;
        section.appendChild(label);

        const files = BASE_TYPE_FILES[baseType];
        const grid = document.createElement("div");
        grid.className = "merc-grid";
        for (const def of defs) {
          const copies = items.filter((it) => it.id === def.id);
          const count = copies.length;
          const { card, body } = buildCard(def, owner, { selected: count > 0 });

          const controls = document.createElement("div");
          controls.className = "merc-controls";
          const countLabel = document.createElement("label");
          countLabel.className = "merc-count";
          countLabel.append("枚数", buildCountSelect(owner, def, count, maxSelectable(items, def), editable[owner]));
          controls.appendChild(countLabel);

          // 同じ駒種が複数枚あるものだけ、置く列を選べるようにする
          if (count > 0 && files && files.length > 1) {
            for (let i = 0; i < count; i++) {
              controls.appendChild(buildSlotSelect(owner, def, items, copies, i, editable[owner]));
            }
          }
          body.appendChild(controls);
          grid.appendChild(card);
        }
        section.appendChild(grid);
        col.appendChild(section);
      }
      container.appendChild(col);
    }
  }

  function onCountChange(handler) {
    container.addEventListener("change", (e) => {
      const select = e.target.closest('select[data-role="count"]');
      if (!select) return;
      handler(Number(select.dataset.owner), select.dataset.id, Number(select.value));
    });
  }

  function onSlotChange(handler) {
    container.addEventListener("change", (e) => {
      const select = e.target.closest('select[data-role="slot"]');
      if (!select || select.selectedIndex < 0) return;
      handler(Number(select.dataset.owner), select.dataset.id, Number(select.dataset.index), Number(select.value));
    });
  }

  return { render, onCountChange, onSlotChange, totalCost };
}
