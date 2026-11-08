# 画像背景棚プレビュー一覧

開発専用（`NODE_ENV === "development"` のみ）。既存ページは削除・差し替えしていません。

## ブラウザで開ける URL

| URL | 内容 |
|---|---|
| [`/dev/image-shelf-preview`](/dev/image-shelf-preview) | **主力プレビュー**。背景バリエーション切替・自然仕上げ・横並び比較 |
| [`/dev/image-shelf-preview/compare`](/dev/image-shelf-preview/compare) | 完成コンセプト写真 vs 実装（配置ボックス）。**現状は白背表紙背景** |

## 1. `/dev/image-shelf-preview`（採用版あり）

ファイル: `ImageShelfPrototype.tsx` / `shelfLayout.ts`

ツールバーで切替:

| 表示名 | 背景画像 | 仕上げ |
|---|---|---|
| ダークネイビー革（暫定完成版） | `shelf-background-navy-leather-complete.png` | flat（CSS影なし） |
| **ダークネイビー革（自然な輪郭・陰影の試作版）** | 同上（採用背景） | **natural（輪郭・光・影 CSS）** |
| 比較表示（完成 / 自然試作） | complete ×2 横並び | flat vs natural |
| 白い背表紙 | `shelf-background-white-spines.png` | flat |
| ネイビー修正前 | `shelf-background-navy-leather-before.png` | flat |
| ネイビー修正前後比較 | before vs complete 横並び | flat |
| 5冊目側面 v2（未採用） | `shelf-background-navy-leather-book5side-v2.png` | natural |
| 採用版 / 側面v2 比較 | complete vs book5side-v2 横並び | natural |

- 初期表示: ネイビー complete + flat
- 動的作品: サンプル最大20件（本番データではない）
- 配置定数: `BAY_LAYOUTS`（変更禁止の試作確定値）

**ネイビー採用版＋自然仕上げは、このページに残っています。** 追加プレビューは不要です。

## 2. `/dev/image-shelf-preview/compare`（白版・保持）

ファイル: `compare/CompareClient.tsx`

| パネル | 参照 |
|---|---|
| ① 完成イメージ | `/images/ref/shelf-concept.jpg` |
| ② 実装（空棚＋動的配置） | **`SHELF_BG` → 白背表紙** `shelf-background-white-spines.png` |

白版比較として意図的に残しています。削除しないでください。  
（本番の画像棚 `ImageShelf` は `utils/imageShelfLayout.ts` 経由で **complete ネイビー** を使用。）

## 背景ファイル対応（変更しない）

| ファイル | 役割 |
|---|---|
| `public/images/shelf-background-navy-leather-complete.png` | **採用済みネイビー**（本番・主力プレビュー） |
| `public/images/shelf-background-navy-leather-before.png` | ネイビー修正前バックアップ |
| `public/images/shelf-background-white-spines.png` | 白版（compare / 白切替） |
| `public/images/shelf-background-navy-leather-sidefix-*.png` | 5巻側面修正の候補（未採用・作業停止中） |

安全バックアップ例: `backups/image-shelf-safe-20261021-010418/`

## 方式（共通）

1. 背景 PNG を棚本体として表示（縦横比維持）
2. 作品表紙は別レイヤー。座標は 1024×664 px → `%`
3. 固定装飾（ネイビー5冊・レコード・ライト）は背景に焼き込み。動的作品数に含めない
