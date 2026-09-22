"""全身キャラ画像を、駒用のPNG（背景透過・余白カット・縮小済み）に変換する。

使い方:
    pip install Pillow
    python tools/prepare-sprite.py 元画像.jpg P
    python tools/prepare-sprite.py 元画像.jpg K --sente          # 先手側だけに使う絵
    python tools/prepare-sprite.py 元画像.jpg K --keep-background # 背景を残したまま使う

第2引数は駒の種類（P/L/N/S/G/K/R/B）。

オプション:
    --sente / --gote   陣営ごとに別の絵を使う。assets/sprites/<陣営>/<種類> に保存する
    --keep-background  背景の透過と余白カットをしない。絵として完成している一枚絵に使う
    --png              WebPではなくPNGで保存する（既定はWebP。PNGの約1/5のサイズになる）

市松模様（透過を表す格子）が焼き込まれたJPEGにも対応する。
色だけで抜くと銀の鎧など灰色の部分まで消えてしまうため、
画像の縁からつながっている領域だけを塗りつぶして背景と判定する。
"""

import sys
from collections import deque
from pathlib import Path

from PIL import Image

# 出力サイズ（全身のままの高さ。盤上では上半身だけが見えるよう拡大表示される）
OUT_HEIGHT = 480

# これより明るい絵は駒の地色（クリーム色）に溶けてしまうので暗く補正する。
# 既存の絵の実測値は 歩0.31 玉0.39 銀0.41 桂0.54 金0.54 飛0.59 角0.78。
TARGET_BRIGHTNESS = 0.55

# WebPの品質。盤上での見え方を実測して決めた値。
# これ以上上げてもPSNRは頭打ちで、ファイルサイズだけが増える。
WEBP_QUALITY = 88

TOLERANCE = 16
# 無彩色とみなす色の偏りの上限。これを超える画素は背景と判定しない
GRAY_LIMIT = 10
# 縁から塗りつぶした後、輪郭に残るにじみを消す回数
FEATHER_PASSES = 2


def detect_background(im):
    """画像の縁をサンプリングして背景の種類を推定する。

    透過を表す市松模様は必ず無彩色（白とグレーの市松）なので、
    縁がほぼ無彩色なら「その明度の範囲すべて」を背景とみなす。
    市松の2色の明暗差は絵によってまちまち（実測で 255対179、255対197、254対214）なので、
    2色をピンポイントで当てにいくと取りこぼす。範囲で捉える方が確実。
    有彩色の背景（単色の青や緑など）の場合は、その色の近傍だけを背景とする。
    """
    from collections import Counter

    w, h = im.size
    px = im.load()
    samples = []
    for x in range(0, w, 2):
        samples += [px[x, 0][:3], px[x, h - 1][:3]]
    for y in range(0, h, 2):
        samples += [px[0, y][:3], px[w - 1, y][:3]]

    # 「色の種類」ではなく「画素数」で数える。
    # にじみで生じた少数の色に判定が引きずられないようにするため。
    # 6割で判定するのは、キャラの衣や武器が画像の端まで届くことが普通にあるため。
    # 実測でも 歩100% 角97% に対し、紺の衣が端まで来ている金は77%だった。
    grays = [c[0] for c in samples if max(c) - min(c) <= GRAY_LIMIT]
    if len(grays) >= len(samples) * 0.6:
        # 背景は特定の明度に画素が集中する（単色なら1つ、市松模様なら2つの山）。
        # 一方、縁に接したキャラの黒髪や黒い衣は色が散らばるので、どの明度帯も薄い。
        # そこで「画素が5%以上集まっている明度帯」だけを背景とみなす。
        # 単純な上下カットだと、黒い冠まで背景範囲に入ってしまう（実測で 65〜255 まで広がった）。
        step = 8
        hist = Counter(v // step for v in grays)
        peaks = [b for b, n in hist.items() if n >= len(grays) * 0.05]
        if peaks:
            return ("gray", min(peaks) * step, max(peaks) * step + step - 1)

    return ("flat", Counter(samples).most_common(1)[0][0], None)


def make_background_test(kind, a, b):
    """背景かどうかを判定する関数を作る。"""
    if kind == "gray":
        lo, hi = a - TOLERANCE, b + TOLERANCE

        def is_background(px, extra=0):
            r, g, bb = px[:3]
            # 無彩色でなければ背景ではない（色の乗ったキャラを削らないための歯止め）
            if max(r, g, bb) - min(r, g, bb) > GRAY_LIMIT:
                return False
            return lo - extra <= r <= hi + extra

        return is_background

    def is_background(px, extra=0):
        return all(abs(px[i] - a[i]) <= TOLERANCE + extra for i in range(3))

    return is_background


def remove_background(im):
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    transparent = bytearray(w * h)

    kind, a, b = detect_background(im)
    if kind == "gray":
        print(f"背景を検出: 無彩色 明度{a}〜{b}（市松模様または灰・白の単色）")
    else:
        print(f"背景を検出: 単色 {a}")
    is_background_like = make_background_test(kind, a, b)

    # 画像の縁から、背景らしい画素だけをたどって塗りつぶす
    queue = deque()
    for x in range(w):
        for y in (0, h - 1):
            queue.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            queue.append((x, y))

    while queue:
        x, y = queue.popleft()
        if not (0 <= x < w and 0 <= y < h):
            continue
        idx = y * w + x
        if transparent[idx]:
            continue
        if not is_background_like(px[x, y]):
            continue
        transparent[idx] = 1
        queue.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    # 輪郭のにじみ（背景と被写体が混ざった画素）を追加で消す
    for _ in range(FEATHER_PASSES):
        edge = []
        for y in range(h):
            row = y * w
            for x in range(w):
                if transparent[row + x]:
                    continue
                near = (
                    (x > 0 and transparent[row + x - 1])
                    or (x < w - 1 and transparent[row + x + 1])
                    or (y > 0 and transparent[row - w + x])
                    or (y < h - 1 and transparent[row + w + x])
                )
                if near and is_background_like(px[x, y], 18):
                    edge.append((x, y))
        if not edge:
            break
        for x, y in edge:
            transparent[y * w + x] = 1

    for y in range(h):
        row = y * w
        for x in range(w):
            if transparent[row + x]:
                px[x, y] = (0, 0, 0, 0)
    return im


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = {a for a in sys.argv[1:] if a.startswith("--")}
    if len(args) < 2:
        print(__doc__)
        sys.exit(1)

    src = Path(args[0])
    name = args[1]
    base_types = {"P", "L", "N", "S", "G", "K", "R", "B"}

    keep_background = "--keep-background" in flags
    layered = "--layered" in flags
    side = "sente" if "--sente" in flags else "gote" if "--gote" in flags else None

    root = Path(__file__).resolve().parent.parent
    ext = "png" if "--png" in flags else "webp"

    # 通常の駒は駒種1文字で指定する。傭兵の専用イラストなど、それ以外は
    # assets/sprites/ からの相対パスで出力先を書く（例: mercenaries/shield_pawn）
    if name.upper() in base_types and "/" not in name:
        piece = name.upper()
        out_dir = root / "assets" / "sprites" / side if side else root / "assets" / "sprites"
        out = out_dir / f"{piece}.{ext}"
    else:
        piece = Path(name).name
        out = root / "assets" / "sprites" / f"{name}.{ext}"
        out_dir = out.parent
    out_dir.mkdir(parents=True, exist_ok=True)

    def save(image, path):
        if path.suffix == ".webp":
            image.save(path, "WEBP", quality=WEBP_QUALITY, method=6)
        else:
            image.save(path, "PNG", optimize=True)

    src_im = Image.open(src)
    print(f"読み込み: {src.name} {src_im.size}")
    if side:
        print(f"適用先: {'先手' if side == 'sente' else '後手'}のみ")

    def shrink(image):
        if image.height <= OUT_HEIGHT:
            return image
        ratio = OUT_HEIGHT / image.height
        return image.resize((max(1, round(image.width * ratio)), OUT_HEIGHT), Image.LANCZOS)

    def normalize(image):
        """明るすぎる絵を落ち着かせる。

        駒の地色がクリーム色なので、パステル調の明るい絵はそのままだと
        地色に溶けて薄く見えてしまう。盤上で実際に見える上部だけを測り、
        明るすぎる場合だけコントラストと彩度を上げる。
        """
        if "--no-adjust" in flags:
            return image

        from PIL import ImageEnhance, ImageStat

        visible = image.crop((0, 0, image.width, max(1, int(image.height * 0.38))))
        rgb = Image.new("RGB", visible.size, (0, 0, 0))
        rgb.paste(visible, mask=visible.split()[3])
        brightness = sum(ImageStat.Stat(rgb, visible.split()[3]).mean[:3]) / 3 / 255

        if brightness <= TARGET_BRIGHTNESS:
            return image
        # 目標の明るさに寄せる。下げすぎると絵の雰囲気が壊れるので 0.72 で止める
        factor = max(0.72, TARGET_BRIGHTNESS / brightness)
        print(f"明るさ {brightness:.2f} → 補正 {factor:.2f}倍（地色に溶けるため）")
        image = ImageEnhance.Brightness(image).enhance(factor)
        image = ImageEnhance.Color(image).enhance(1.25)
        return image

    if layered:
        # 「背景あり」と「背景抜き」を重ねて表示するので、2枚のキャンバスを完全に一致させる。
        # 切り抜き側で余白をカットすると座標がずれて二重像になるため、絶対にカットしない。
        print("重ね表示用に2枚出力します（背景あり＋切り抜き）")
        full = normalize(shrink(src_im.convert("RGBA")))
        cut = normalize(shrink(remove_background(src_im)))
        if full.size != cut.size:
            print(f"！ サイズが一致しません {full.size} vs {cut.size}")
            sys.exit(1)
        save(full, out)
        cut_path = out_dir / f"{piece}_cutout.{ext}"
        save(cut, cut_path)
        print(f"保存: {out.relative_to(root)}  {out.stat().st_size / 1024:.0f}KB")
        print(f"保存: {cut_path.relative_to(root)}  {cut_path.stat().st_size / 1024:.0f}KB")
        print(f"キャンバス一致を確認: {full.size}")
        return

    if keep_background:
        print("背景はそのまま残します")
        im = src_im.convert("RGBA")
    else:
        im = remove_background(src_im)
        box = im.getbbox()
        if box:
            im = im.crop(box)
            print(f"余白をカット: {im.size}")

    im = normalize(shrink(im))
    print(f"出力サイズ: {im.size}")
    save(im, out)
    print(f"保存: {out.relative_to(root)}  {out.stat().st_size / 1024:.0f}KB")


if __name__ == "__main__":
    main()
