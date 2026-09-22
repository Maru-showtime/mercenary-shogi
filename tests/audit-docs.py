# ドキュメントに書いてある「事実」が、実際のデータ・ファイルと一致しているか照合する
import json, io, os, re, sys

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..") + "/"
NG = []


def read(p):
    return io.open(ROOT + p, encoding="utf-8").read()


def check(cond, msg):
    print(("OK  " if cond else "NG  ") + msg)
    if not cond:
        NG.append(msg)


merc = json.load(io.open(ROOT + "src/data/mercenaries.json", encoding="utf-8"))
pieces = json.load(io.open(ROOT + "src/data/pieces.json", encoding="utf-8"))
board_js = read("src/core/board.js")
WIDTH = int(re.search(r"WIDTH = (\d+)", board_js).group(1))
HEIGHT = int(re.search(r"HEIGHT = (\d+)", board_js).group(1))

print(f"--- 実際の値: 盤 {WIDTH}x{HEIGHT} / 傭兵 {len(merc)}種 ---\n")

spec = read("spec.md")
readme = read("README.md")
html = read("index.html")
sprites_readme = read("assets/sprites/README.md")
fonts_readme = read("assets/fonts/README.md")

# 1) マス数
cells = WIDTH * HEIGHT
check(f"{cells}マス" in spec or "マス" not in spec, f"spec.md のマス数が {cells} になっている")
# 「9×8から9×9に戻した経緯」は意図的な記録なので、その節だけ除外して探す
history = "### 盤を9×8から9×9に戻した経緯"
spec_wo_history = spec.split(history)[0] + (spec.split(history)[1].split("### ")[1] if history in spec and "### " in spec.split(history)[1] else "")
for bad in ["72マス", "9×8", "9x8"]:
    check(bad not in spec_wo_history + readme + html, f"古い盤サイズ表記 '{bad}' が経緯の節以外に残っていない")

# 2) 傭兵の種類数
for doc, label in [(readme, "README.md"), (spec, "spec.md")]:
    m = re.findall(r"全(\d+)種", doc)
    for n in m:
        check(int(n) == len(merc), f"{label} の「全{n}種」が実際({len(merc)}種)と一致")

# 3) ドキュメントに出てくる傭兵名が実在するか（廃止記録の節は除く）
names = {v["name"] for v in merc.values()}
retired_section = spec.split("### 一度実装したが廃止したもの")[1].split("---")[0] if "### 一度実装したが廃止したもの" in spec else ""
for doc, label in [(readme, "README.md"), (html, "index.html"), (sprites_readme, "sprites/README.md")]:
    for nm in ["隠形歩", "直走香", "馬廻銀", "反転香"]:
        check(nm not in doc, f"{label} に廃止した傭兵 '{nm}' が残っていない")

# 4) 表に書かれたコストが実データと一致するか（「| 名前 | 数字 |」形式を拾う）
for line in spec.splitlines():
    m = re.match(r"\|\s*([^\s|]+)\s*\|\s*(\d+)\s*\|", line)
    if not m:
        continue
    nm, cost = m.group(1), int(m.group(2))
    hit = [v for v in merc.values() if v["name"] == nm]
    if hit:
        check(hit[0]["cost"] == cost, f"spec.md の {nm} のコスト {cost} が実データ({hit[0]['cost']})と一致")

# 5) spec.md のファイル構成図に、実在しないファイルが載っていないか／新ファイルが漏れていないか
listed = set(re.findall(r"([A-Za-z0-9_\-]+\.(?:json|js|css|html|md))", spec.split("## 9")[1][:2500] if "## 9" in spec else ""))
actual = set()
for dirpath, dirnames, filenames in os.walk(ROOT):
    dirnames[:] = [d for d in dirnames if d != ".git"]
    for f in filenames:
        actual.add(f)
ghosts = sorted(f for f in listed if f not in actual)
check(not ghosts, f"spec.md の構成図に存在しないファイルが無い（{ghosts or 'なし'}）")
missing = sorted(f for f in ["labels.js", "sprite.js"] if f not in listed)
check(not missing, f"spec.md の構成図に新しいファイルが載っている（漏れ: {missing or 'なし'}）")

# 6) フォント README の文字数とファイルサイズ
try:
    from fontTools.ttLib import TTFont
    f = TTFont(ROOT + "assets/fonts/YujiSyuku-subset.woff2")
    cm = {}
    for t in f["cmap"].tables:
        cm.update(t.cmap)
    # 空白はサブセット化で自動的に入るので、駒に出る文字数とは別に数える
    covered = len([c for c in cm if chr(c).strip()])
    m = re.search(r"(\d+)文字だけに絞った", fonts_readme)
    if m:
        check(int(m.group(1)) == covered, f"fonts/README.md の収録文字数 {m.group(1)} が実際({covered})と一致")
except ImportError:
    print("--  fontTools 無しのためフォントは未検証")
size = os.path.getsize(ROOT + "assets/fonts/YujiSyuku-subset.woff2")
m = re.search(r"([\d,]+) バイト", fonts_readme)
if m:
    check(int(m.group(1).replace(",", "")) == size, f"fonts/README.md のサイズ {m.group(1)} が実際({size})と一致")

# 7) sprites/README の zoom/shift 表が style.css と一致するか
css = read("style.css")
for m in re.finditer(r"\|\s*([PLNSGKRB])\s\S+\s*\|\s*\d+×\d+\s*\|\s*\d+\s*\|\s*\d+\s*\|\s*([\d.]+)\s*\|\s*([-\d.]+)%\s*\|", sprites_readme):
    t, zoom, shift = m.group(1), m.group(2), m.group(3)
    block = re.search(rf"\.piece-sprite-{t} \{{(.*?)\}}", css, re.S)
    if block:
        z = re.search(r"--sprite-zoom:\s*([\d.]+)", block.group(1)).group(1)
        s_ = re.search(r"--sprite-shift:\s*([-\d.]+)%", block.group(1)).group(1)
        check(float(z) == float(zoom) and float(s_) == float(shift), f"sprites/README の {t} の zoom/shift が style.css と一致")

print("\n" + ("すべて一致" if not NG else f"要修正 {len(NG)} 件"))
sys.exit(0 if not NG else 1)
