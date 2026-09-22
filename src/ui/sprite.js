// 駒のイラストを <img> にする共通処理。
// 盤（boardView）と編成画面（draftView）の両方が使う。
// 切り出しの判定がずれると、同じ絵なのに顔の大きさが場所によって違って見えるため、
// 判定は必ずここ1か所に置くこと。

// 全身画像は縦長になる。その場合は拡大してずらし、上半身だけを見せる。
// 1.15 は、上半身だけを描いた絵（ほぼ正方形）と全身画像を分ける閾値。
// 武器や髪が横に広がる構図だと縦横比が下がるため、やや低めに取ってある。
const FULL_BODY_RATIO = 1.15;

export function buildSpriteImage(url, alt, extraClass) {
  const img = document.createElement("img");
  img.src = url;
  img.alt = alt || "";
  if (extraClass) img.classList.add(extraClass);
  const markIfFullBody = () => {
    if (img.naturalHeight > img.naturalWidth * FULL_BODY_RATIO) img.classList.add("full-body");
  };
  if (img.complete && img.naturalWidth) markIfFullBody();
  else img.addEventListener("load", markIfFullBody, { once: true });
  return img;
}

// 駒種ごとの切り出し（--sprite-zoom / --sprite-shift）が効く箱を作る。
// クラス名が style.css の .piece-sprite-P … と対応している
export function buildSpriteBox(entry, displayType, alt, layer) {
  const box = document.createElement("div");
  box.className = `piece-sprite piece-sprite-${displayType.replace("+", "p")}`;
  if (layer) box.classList.add(layer);
  if (entry.kind === "svg") {
    box.innerHTML = entry.markup;
  } else {
    box.appendChild(buildSpriteImage(entry.url, alt));
  }
  return box;
}
