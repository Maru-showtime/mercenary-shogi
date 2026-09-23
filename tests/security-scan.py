# 公開リポジトリに入れて困るものが無いか洗い出す。
# テキストだけでなく、画像に残るメタデータ（作者名・ソフト名など）も見る。
#
# 使い方:  python tests/security-scan.py
#
# 氏名や社名のような「その人にとっての秘密語」は、このファイルにも、
# リポジトリ内のどのファイルにも書かない。
# 書けばそれ自体が漏洩源になるし、.gitignore はドラッグ&ドロップで
# アップロードする運用では効かないため、置くだけで危ない。
#
# 代わりに、実行環境から自動的に導く：
#   - ホームディレクトリ名        → Windows/Mac のユーザー名
#   - リポジトリより上の階層名    → 会社名を含むフォルダ名（例: OneDrive - ○○株式会社）
# どちらもリポジトリの外にある情報なので、公開物には残らない。
import io, os, re, sys

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")

TEXT_EXT = {".md", ".js", ".mjs", ".json", ".css", ".html", ".py", ".txt", ".yml", ".yaml"}

PATTERNS = [
    ("メールアドレス", re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")),
    ("ローカル絶対パス", re.compile(r"[A-Za-z]:[\\/]Users[\\/]|/home/[\w.-]+|/Users/[\w.-]+")),
    ("プライベートIP", re.compile(r"\b(?:10|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d+\.\d+")),
    ("鍵・トークンらしき文字列",
     re.compile(r"(?:api[_-]?key|secret|token|passwo?rd|bearer)\s*[:=]\s*['\"][^'\"]{8,}", re.I)),
    ("AWS/GCPキーらしき文字列", re.compile(r"AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_\-]{35}")),
]

def local_secret_words():
    """実行環境から「公開されたら困る語」を推測する。リポジトリ内には一切書かない。"""
    words = set()
    # ホームディレクトリ名 = ユーザー名（丸ごと、および区切り文字で分けた各片）
    home = os.path.basename(os.path.normpath(os.path.expanduser("~")))
    if home:
        words.add(home)
        words.update(p for p in re.split(r"[.\-_ ]+", home) if len(p) >= 3)
    # リポジトリより上の階層のフォルダ名（会社名が入りがち）
    parent = os.path.abspath(ROOT)
    for _ in range(4):
        parent = os.path.dirname(parent)
        name = os.path.basename(parent)
        if not name or re.fullmatch(r"[A-Za-z]:\\?", parent):
            break
        # 一般的すぎる名前は誤検出のもとなので除く
        if name.lower() in {"users", "desktop", "documents", "onedrive", "home", "デスクトップ", "ドキュメント"}:
            continue
        words.add(name)
        words.update(p for p in re.split(r"[-–—_ ]+", name) if len(p) >= 3 and p.lower() != "onedrive")
    return sorted(w for w in words if len(w) >= 3)


def extra_secret_words():
    """環境から導けない語（漢字の氏名など）を、リポジトリの外のファイルから読む。

    ホームディレクトリに置くのが要点。リポジトリ内に置くと、
    ドラッグ&ドロップでアップロードした時に一緒に公開されてしまう
    （.gitignore は git を使わない運用では効かない）。
    """
    path = os.path.join(os.path.expanduser("~"), ".publish-private-words.txt")
    if not os.path.exists(path):
        return [], path
    words = [w.strip() for w in io.open(path, encoding="utf-8")
             if w.strip() and not w.lstrip().startswith("#")]
    return [w for w in words if len(w) >= 2], path


secrets = local_secret_words()
extra, extra_path = extra_secret_words()
secrets = sorted(set(secrets) | set(extra))

if secrets:
    PATTERNS.insert(0, ("氏名・所属など",
                        re.compile("|".join(re.escape(w) for w in secrets), re.I)))
    print(f"要注意語 {len(secrets)} 語で検査します（環境から{len(secrets) - len(extra)}語 ＋ 追加{len(extra)}語）")
    print("（一覧はリポジトリ内に保存されません）")

if not extra:
    print()
    print("!" * 68)
    print("  漢字の氏名など、パスから導けない語は検査できていません。")
    print(f"  次の場所に1行1語で書いてください（リポジトリの外なので公開されません）:")
    print(f"    {extra_path}")
    print("!" * 68)
print()

hits = []
binaries = []
for dirpath, dirnames, filenames in os.walk(ROOT):
    dirnames[:] = [d for d in dirnames if d not in (".git", "node_modules", "venv", ".venv")]
    for fn in filenames:
        path = os.path.join(dirpath, fn)
        rel = os.path.relpath(path, ROOT).replace(os.sep, "/")
        if os.path.splitext(fn)[1].lower() not in TEXT_EXT:
            binaries.append((rel, path))
            continue
        try:
            text = io.open(path, encoding="utf-8").read()
        except (UnicodeDecodeError, OSError):
            continue
        for i, line in enumerate(text.splitlines(), 1):
            for label, pat in PATTERNS:
                if pat.search(line):
                    hits.append((label, rel, i, line.strip()[:110]))

print("=" * 70)
print("テキストファイルの検査")
print("=" * 70)
for label, rel, i, line in hits:
    print(f"[{label}] {rel}:{i}\n    {line}")
if not hits:
    print("問題なし")

print("\n" + "=" * 70)
print("画像のメタデータ検査（作者名・ソフト名などが残っていないか）")
print("=" * 70)
try:
    from PIL import Image, ExifTags

    IGNORE = {"icc_profile", "transparency", "background", "loop", "duration", "timestamp"}
    for rel, path in binaries:
        if os.path.splitext(path)[1].lower() not in (".webp", ".png", ".jpg", ".jpeg", ".gif"):
            continue
        im = Image.open(path)
        meta = {}
        for k, v in (im.getexif() or {}).items():
            meta[ExifTags.TAGS.get(k, k)] = str(v)[:80]
        for k, v in (im.info or {}).items():
            if isinstance(v, (str, bytes)):
                meta[k] = str(v)[:80]
        risky = {k: v for k, v in meta.items() if k not in IGNORE}
        print(("NG  " if risky else "OK  ") + f"{rel}  {risky if risky else 'メタデータなし'}")
        if risky:
            hits.append(("画像メタデータ", rel, 0, str(risky)[:110]))
except ImportError:
    # Pillow が入っていない環境でも「未検査」で素通りさせない。
    # 検査が黙って無効になることこそが、公開事故の入口になる。
    # EXIF/XMP/ICCP チャンクの有無と、先頭部の可読文字列を直接見る。
    print("Pillow が無いため、バイト列を直接見る簡易検査に切り替えます")
    META_CHUNKS = (b"EXIF", b"XMP ", b"ICCP", b"tEXt", b"iTXt")
    RISKY_WORD = re.compile(
        rb"(?i)(author|creator|copyright|artist|software|photoshop|adobe|gemini|midjourney|[a-z]:\\)"
    )
    for rel, path in binaries:
        if os.path.splitext(path)[1].lower() not in (".webp", ".png", ".jpg", ".jpeg", ".gif"):
            continue
        head = io.open(path, "rb").read(8192)
        chunks = [c.decode() for c in META_CHUNKS if c in head]
        words = sorted({s.decode("latin-1") for s in re.findall(rb"[ -~]{6,}", head) if RISKY_WORD.search(s)})
        # 実行環境から拾った「公開されたら困る語」も画像の中を探す
        for w in secrets:
            for enc in ("utf-8", "utf-16-le", "cp932"):
                try:
                    if w.encode(enc) in head:
                        words.append(f"<秘匿語 {enc}>")
                except UnicodeEncodeError:
                    pass
        risky = chunks + words
        print(("NG  " if risky else "OK  ") + f"{rel}  {risky if risky else 'メタデータなし'}")
        if risky:
            hits.append(("画像メタデータ", rel, 0, str(risky)[:110]))

print(f"\n検出 {len(hits)} 件")
sys.exit(0 if not hits else 1)
