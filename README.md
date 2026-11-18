# usage-band

Claude Code の入力欄の上に「使用量の帯」を表示する mod です。

- 5時間枠・週間枠の使用率バーと、リセット時刻
- 経過時間に対する消費ペースの縦線(使用率がペースを超えるとバーが赤系に変化)
- 実行中のツール名、経過時間、サブエージェント数、無反応の秒数

## インストール方法

Claude Code が入っていれば、次のどちらか1つで入ります。

### 方法1: Claude Code の入力欄から(ターミナル版)

Claude Code を起動し、入力欄に次を貼り付けて Enter。

```
/plugin install usage-band --marketplace isonya-tools/usage-band
```

「Add marketplace?」と聞かれたら `y`、続けてスコープは Enter(user)で OK。
`Installed usage-band.` と出れば完了です。

### 方法2: コマンドプロンプト / PowerShell から

```
claude plugin install usage-band --marketplace isonya-tools/usage-band
```

`claude` が見つからない場合は、Claude Code のインストール先(Windows なら `%USERPROFILE%\.local\bin`)を PATH に追加するか、フルパスで実行してください。

### 方法3: デスクトップアプリ

`/plugin` が使えないため、画面から追加します。

1. 入力欄の横の「+」を押す
2. 「Plugins」を選ぶ
3. 「Add marketplace」に `isonya-tools/usage-band` と入力
4. 「Add plugin」から `usage-band` を追加

## 反映のしかた

インストール後、Claude Code を再起動(または新しいセッションを開始)すると、入力欄の上に帯が出ます。

## アンインストール

```
/plugin uninstall usage-band
```

## ライセンス

MIT
