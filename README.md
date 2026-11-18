# 利用状況ビュー for Claude

Windows 版 Claude デスクトップアプリ(Code タブ)用の mod です。
入力欄の上に、5時間枠・週間枠の使用率バーと実行中の状態を表示します。

## インストール

1. スタートボタンを右クリックし、「ターミナル」を開く
2. 次のコマンドを貼り付けて Enter

```powershell
& "$env:USERPROFILE\.local\bin\claude.exe" plugin install usage-band --marketplace isonya-tools/usage-band
```

3. Claude デスクトップアプリを閉じて、開き直す
4. Code タブで新しいセッションを始める

`claude.exe が見つかりません` と出た場合は、2 のコマンドを次に置き換えます。

```powershell
claude plugin install usage-band --marketplace isonya-tools/usage-band
```

## アンインストール

1. スタートボタンを右クリックし、「ターミナル」を開く
2. 次のコマンドを貼り付けて Enter

```powershell
& "$env:USERPROFILE\.local\bin\claude.exe" plugin uninstall usage-band
```

3. Claude デスクトップアプリを閉じて、開き直す

## ライセンス

MIT
