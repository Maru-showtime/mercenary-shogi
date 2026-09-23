# 駒の絵が画面サイズによってズレないことを、style.css の書き方から静的に検査する。
#
# なぜ必要か（2026-09 に実際に起きた不具合）:
#   絵の位置と大きさは全部 % （マスに対する割合）で指定してあるのに、
#   絵を切り抜く五角形のほうは --art-inset: 3px / --edge-width: 2.5px と px 固定だった。
#   PC（マス96px）では 3px = マスの3.1% でちょうどよくても、
#   スマホ（マス36px）では 8.3% になり、切り抜き枠だけが太って
#   キャラが余計に切られ「下にずれている」ように見えた。
#
#   つまり「％と px を混ぜた瞬間にレイアウトは画面サイズ依存になる」。
#   駒の形・大きさに関わる変数は必ずマス比（--cell-size からの計算）で持つこと。
import io, os, re, sys

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..") + "/"
CSS = io.open(ROOT + "style.css", encoding="utf-8").read()

# 駒の形・絵の切り抜きに効く変数。ここに px 直書きがあると画面サイズでズレる
SCALE_BOUND_VARS = ["--edge-width", "--art-inset", "--piece-w", "--piece-h", "--shoulder-x", "--shoulder-y"]

# max()/min()/clamp() の中の px は「下限・上限」なので許す。
# ただし本体が --cell-size 由来であることを必ず確認する
BARE_PX = re.compile(r"(?<![\w-])\d+(?:\.\d+)?px")

problems = []
for var in SCALE_BOUND_VARS:
    for m in re.finditer(re.escape(var) + r"\s*:\s*([^;]+);", CSS):
        value = m.group(1).strip()
        line = CSS[: m.start()].count("\n") + 1
        if not BARE_PX.search(value):
            continue  # px を使っていないなら無条件で安全
        if "--cell-size" not in value:
            problems.append(f"style.css:{line} {var}: {value} — px 固定。--cell-size からの計算にすること")
        elif not re.match(r"^(max|min|clamp)\s*\(", value):
            problems.append(
                f"style.css:{line} {var}: {value} — px が下限/上限以外で混ざっている。"
                "max()/clamp() の内側だけに置くこと"
            )

# 絵そのものの配置は % / マス比だけで組まれているか（img.full-body）
m = re.search(r"\.piece-sprite\s+img\.full-body\s*\{([^}]*)\}", CSS)
if not m:
    problems.append("style.css: .piece-sprite img.full-body のルールが見つからない（セレクタ名が変わった？）")
else:
    for line_text in m.group(1).split("\n"):
        prop = line_text.split(":")[0].strip()
        if prop in ("left", "top", "width", "height") and BARE_PX.search(line_text):
            problems.append(f".piece-sprite img.full-body の {prop} に px がある: {line_text.strip()}")

if problems:
    print("NG: 画面サイズでズレうる指定が見つかりました")
    for p in problems:
        print("  -", p)
    sys.exit(1)

print(f"OK: 駒の形に関わる {len(SCALE_BOUND_VARS)} 変数と絵の配置は、すべてマス比で指定されています")
