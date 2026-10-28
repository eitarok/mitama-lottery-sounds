# 三玉保育園 夕涼み会 抽選会 V3

Google Apps Script で動く抽選会アプリのバックアップです。

## ファイル

- `Code.gs`: 抽選、重複防止、スプレッドシートへの記録
- `Index.html`: iPad・プロジェクター用の抽選画面

## 現在の仕様

- 一度に1〜15個を抽選
- 結果は小さい順に表示
- 3行表示では数字と白い枠を固定し、縦の間隔を4pxに調整
- 抽選中に番号を予約し、停止後すぐ結果を表示
- 当選番号、上限、排除番号をGoogleスプレッドシートで共有
- ドラムロールと決定音に、このリポジトリ直下の音源を使用

## 公開中のウェブアプリ

https://script.google.com/macros/s/AKfycbxLAwWZJwH845tiV2xVlfwJ6VZo8X-LGgsHH4xNSwMTzDBBnrzqWSXyDamIVKquoG55/exec

GitHubのファイルを変更しただけではApps Scriptの公開版は更新されません。Apps Scriptへ貼り付けて、新しいバージョンをデプロイしてください。
