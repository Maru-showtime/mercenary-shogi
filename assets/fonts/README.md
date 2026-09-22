# 駒字の書体について

盤上の駒に書かれる漢字は **Yuji Syuku**（楷書寄りの筆書体）で表示しています。

将棋の駒字の定番は **錦旗(きんき)体** で、日本将棋連盟の標準駒や対局中継、
将棋ソフトの駒画像の多くがこれかその写しを使っています。
他に有名な駒字は 巻菱湖(まきびしこ)、水無瀬(みなせ)、源兵衛清安(げんべえきよやす) など。

ただし**これらは駒師が彫る書であって、自由に使えるフォントではありません。**
そのため、系統の近い筆書体で雰囲気を寄せています。

## ファイル

| ファイル | 中身 |
|---|---|
| `YujiSyuku-subset.woff2` | 駒に出る17文字だけに絞ったフォント（8,460 バイト。ほかに空白が1字入るので収録は18字） |
| `OFL.txt` | ライセンス本文（SIL Open Font License 1.1） |

**同梱している理由:** Google Fonts から直接読み込むと、日本語フォントは
100近い断片に分割されているせいで**12文字しか使わなくても275KB**落ちてきます。
必要な文字だけに絞れば 8KB で済み、外部への通信も無くなります。

## 収録している文字

```
歩 と 香 桂 銀 金 玉 王 飛 角 龍 馬 成 全 圭 杏 竜
```

`src/data/pieces.json` の `name` と `promotedName` に出る文字がすべて含まれています。
将来これ以外の漢字を駒に出す場合は、下の手順でフォントを作り直してください。
**入っていない文字は明朝体で表示されてしまい、そこだけ書体が変わります。**

## 作り直す手順

PowerShell で2コマンドです。`$chars` に必要な文字をすべて並べてください。

```powershell
$chars = '歩と香桂銀金玉王飛角龍馬成全圭杏竜'   # ← ここに追加する
$ua  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
$url = "https://fonts.googleapis.com/css2?family=Yuji+Syuku&text=$([System.Uri]::EscapeDataString($chars))"
(Invoke-WebRequest -Uri $url -Headers @{'User-Agent'=$ua} -UseBasicParsing).Content
```

返ってきた CSS の `src: url(...)` を控えて、その URL を落とします。

```powershell
Invoke-WebRequest -Uri '<上で控えた URL>' -Headers @{'User-Agent'=$ua} `
  -OutFile 'assets/fonts/YujiSyuku-subset.woff2' -UseBasicParsing
```

`User-Agent` に古いブラウザを名乗ると woff2 ではなく TTF が返ってきて
ファイルが数百KBに膨らみます。上の Chrome の UA をそのまま使ってください。

落としたら `unicode-range` に指定した文字がすべて入っているか、
ブラウザで実際に盤を開いて確かめること（欠けていても静かに明朝へ落ちるだけで、
エラーにはなりません）。

## ライセンス表示について

SIL OFL 1.1 です。**`OFL.txt` を一緒に配布すれば商用・改変・サブセット化すべて可**で、
ウェブページ上に著作権表示を出す義務はありません。
このフォルダごと公開リポジトリに置いておけば条件を満たします。

- 書体名: Yuji Syuku
- 作者: The Yuji Project Authors — https://github.com/Kinutafontfactory/Yuji
- ライセンス: SIL Open Font License 1.1（`OFL.txt`）

## 書体を変えたくなったら

`style.css` の先頭の `@font-face` と `--piece-font` の2か所だけ直せば入れ替わります。
`--piece-font` の後半は、フォントの読み込みに失敗した場合や
収録外の文字が来た場合の逃げ道（明朝体）です。
