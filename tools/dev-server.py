"""開発用のローカルサーバー。

    python tools/dev-server.py            # http://localhost:8765 （この PC からのみ）
    python tools/dev-server.py 3000       # ポートを変える場合
    python tools/dev-server.py 8765 --lan # 同じWi-Fiのスマホからも開けるようにする

既定ではこのPCからしか繋がらない（127.0.0.1 で待ち受ける）。
--lan を付けた時だけ同じネットワークの他の端末に公開する。
公開するとネットワーク内の誰でもこのフォルダの中身を読めるので、
スマホで確認したい時だけ付け、終わったら止めること。

`python -m http.server` は Cache-Control を返さないため、ブラウザが
「ヒューリスティックキャッシュ」で勝手に数分〜数時間キャッシュしてしまい、
ファイルを直しても画面に反映されない。このサーバーは毎回 no-store を返すので、
リロードすれば必ず最新が表示される。

※ 公開用（GitHub Pages）には不要。あくまで手元で確認するためのもの。
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # 404 とエラーだけ出す（大量のGETログで埋もれないように）
        status = args[1] if len(args) > 1 else ""
        if str(status).startswith(("4", "5")):
            super().log_message(fmt, *args)


def local_ip():
    """同じWi-Fi上のスマホから開くためのIPアドレスを調べる。"""
    import socket

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except OSError:
        return None


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    expose_to_lan = "--lan" in sys.argv
    port = int(args[0]) if args else 8765

    # 既定はこのPC限定。--lan を明示した時だけネットワークに公開する
    host = "0.0.0.0" if expose_to_lan else "127.0.0.1"
    handler = partial(NoCacheHandler, directory=str(ROOT))

    with ThreadingHTTPServer((host, port), handler) as httpd:
        print(f"起動しました → http://localhost:{port}/")
        if expose_to_lan:
            ip = local_ip()
            print("！ ネットワークに公開しています。同じWi-Fi上の他の端末から、")
            print(f"！ このフォルダ（{ROOT.name}）の中身が誰でも閲覧できます。")
            if ip:
                print(f"！ スマホから → http://{ip}:{port}/")
            print("！ 確認が終わったら Ctrl+C で止めてください。")
        else:
            print("このPCからのみ接続できます（スマホから見たい時は --lan を付けて再起動）")
        print(f"公開フォルダ: {ROOT}")
        print("止めるときは Ctrl+C")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n停止しました")


if __name__ == "__main__":
    main()
