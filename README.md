# usage-band

**Windows 版 Claude デスクトップアプリ(Code タブ)用**の mod です。
入力欄の上に「使用量の帯」を表示します。

- 5時間枠・週間枠の使用率バーと、リセット時刻
- 経過時間に対する消費ペースの縦線(使うペースが速すぎるとバーが赤系に変わります)
- 実行中の作業内容、経過時間、無反応の秒数

## インストール方法(PowerShell でコピペするだけ)

所要時間は1分ほどです。パソコンに詳しくなくても大丈夫です。

### 1. PowerShell を開く

1. 画面左下の **スタートボタン(Windows マーク)を右クリック**
2. 出てきたメニューから **「ターミナル」** をクリック
   (「Windows PowerShell」と書かれたものでも OK)
3. 黒い(または青い)文字入力の画面が開けば準備完了です

### 2. コマンドをコピーして貼り付ける

下の灰色の枠の右上にあるコピーボタンでコピーします。
PowerShell の画面で **右クリック**(または `Ctrl + V`)して貼り付け、**Enter キー**を押します。

```powershell
& "$env:USERPROFILE\.local\bin\claude.exe" plugin install usage-band --marketplace isonya-tools/usage-band
```

### 3. 完了を確認する

次のような表示が出れば成功です。

```
Installed usage-band
```

(英語の文章が数行出ます。赤い文字で `error` と出なければ問題ありません。)

### 4. Claude を再起動する

デスクトップアプリを**いったん閉じて、もう一度開き**、Code タブで新しいセッションを始めてください。
入力欄の上に帯が表示されます。

## うまくいかないとき

- **「...claude.exe ... が見つかりません」と出る**
  → Claude Code が別の場所に入っています。次のコマンドを試してください。

  ```powershell
  claude plugin install usage-band --marketplace isonya-tools/usage-band
  ```

- **帯が出ない**
  → アプリを完全に終了してから開き直し、新しいセッションで確認してください。

## アンインストール(削除)

PowerShell に次を貼り付けて Enter。

```powershell
& "$env:USERPROFILE\.local\bin\claude.exe" plugin uninstall usage-band
```

## ライセンス

MIT
