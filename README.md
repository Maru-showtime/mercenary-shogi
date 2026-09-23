# 傭兵将棋（仮題）

通常の将棋（9×9）に「対局前の編成フェーズ」を足した変種。コスト10の範囲で、初期配置の駒を
特殊能力を持つ**傭兵**に差し替えてから戦います。盤と駒の動きはそのままなので、将棋が指せればすぐ遊べます。

**▶ [ブラウザで遊ぶ](https://maru-showtime.github.io/mercenary-shogi/)**

## 遊び方

1. 編成画面で、コスト上限の範囲で傭兵を選ぶ
2. 対局開始。CPU と1局戦う
3. 盤上の傭兵は駒に名前の帯が付いています

将棋のルール（二歩・打ち歩詰め・行き所のない駒・千日手・連続王手）はひととおり実装しています。
敵陣は3段で、盤の星がその境界を示しています。

## 傭兵の例

| 名前 | 元の駒 | 能力 |
|---|---|---|
| 盾歩 | 歩 | 取られる時、1回だけ耐えてその場に残る |
| 遊撃香 | 香 | 前に走れるうえ、真後ろと斜め4方向へ1マスずつ動ける |
| 龍騎銀 | 銀 | 成ると（金ではなく）龍になる |
| 影武者 | 金 | 玉が詰む時、身代わりになって盤から消える |
| 蛮勇の王 | 玉 | 前に2マス進めるが、真後ろには下がれない |

全13種は [`src/data/mercenaries.json`](src/data/mercenaries.json) にあります。

## 技術的なこと

**ビルド不要。** バニラの ES Modules と DOM だけで動きます。npm も webpack も使っていません。

| | |
|---|---|
| 盤面 | CSS Grid（Canvas ではない） |
| 思考ルーチン | ネガマックス + αβ枝刈り + 反復深化 + 静止探索。Web Worker で動くのでUIが固まりません |
| 駒の絵 | 全身イラストを駒の五角形で切り抜き。顔の大きさは実測して揃えてあります |
| 駒字 | Yuji Syuku を駒に出る漢字だけにサブセット化して同梱（17字・8KB） |

### ローカルで動かす

`file://` では ES Modules が動かないので、簡易サーバーを使ってください。

```
python tools/dev-server.py 8765
```

`http://localhost:8765/` が開きます。localhost 限定で待ち受けるので、外部には公開されません。

### 公開する前に

**[`PUBLISH-CHECKLIST.md`](PUBLISH-CHECKLIST.md) を毎回実行する。**
最初の1本は個人情報の検査で、これは飛ばさない。

```
python tests/security-scan.py
```

### テストと検査

ビルドもテストランナーも入れていないので、Node と Python があればそのまま動きます。

```
node tests/test-core.mjs          # 将棋の基本ルール
node tests/test-abilities.mjs     # 傭兵能力
node tests/test-ai.mjs            # AI が合法手を返すか
```

データやドキュメントをいじったら、こちらも回してください。

```
python tests/check-rosters.py       # AIの編成が実在する傭兵か・コスト上限内か
python tests/audit-docs.py          # ドキュメントの数値が実データと合っているか
python tests/audit-json-samples.py  # spec.md のJSONサンプルが実データと同じ書き方か
python tests/security-scan.py       # 公開して困るものが混ざっていないか
```

`audit-docs.py` と `security-scan.py` は Pillow / fontTools があればより多く検査します
（`pip install Pillow fonttools brotli`）。無くても動きます。

### ドキュメント

| ファイル | 内容 |
|---|---|
| [`spec.md`](spec.md) | 仕様（ルール・傭兵・実装方針） |
| [`assets/sprites/README.md`](assets/sprites/README.md) | 駒の絵の差し替え手順 |
| [`assets/fonts/README.md`](assets/fonts/README.md) | 駒字フォントの作り直し手順 |
| [`assets/CREDITS.md`](assets/CREDITS.md) | 素材の出典とライセンス |

## 素材について

駒のイラストは AI（Google Gemini）で生成したものです。フォントは SIL OFL 1.1 の
[Yuji Syuku](https://github.com/Kinutafontfactory/Yuji) をサブセット化して同梱しています。
詳細は [`assets/CREDITS.md`](assets/CREDITS.md) を参照してください。
