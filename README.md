# 利用状況ビュー for Claude

Claude の5時間枠・週間枠の使用率を常に表示する、Windows 用のツールです。2つの部品でできています。

- **mod**: Claude Code(デスクトップアプリの Code タブ)の入力欄の上に、使用率バーと実行中の状態を表示します。
- **デスクトップアプリ**(任意): 同じ表示を、画面の好きな場所に常時最前面で表示します。タスクトレイに常駐し、クリック透過・表示するディスプレイ・位置・幅を変えられます。

デスクトップアプリは mod が書き出すデータを読むため、**mod のインストールが必須**です。

## mod のインストール

1. Windows PowerShell を開く
2. 次のコマンドを貼り付けて Enter

```powershell
~\.local\bin\claude.exe plugin install usage-band --marketplace isonya-tools/usage-band
```

3. Claude デスクトップアプリを閉じて、開き直す
4. Code タブで新しいセッションを始める

`claude.exe が見つかりません` と出た場合は、2 のコマンドを次に置き換えます。

```powershell
claude plugin install usage-band --marketplace isonya-tools/usage-band
```

すでに入れている場合は、次のコマンドで更新します。

```powershell
~\.local\bin\claude.exe plugin marketplace update usage-band
~\.local\bin\claude.exe plugin update usage-band@usage-band
```

## デスクトップアプリのインストール

1. [Releases](https://github.com/isonya-tools/usage-band/releases/latest) から `UsageBand-Setup-*.exe` をダウンロード
2. ダブルクリックして実行(「PC を保護しました」と出たら「詳細情報」→「実行」)
3. 画面右下のタスクトレイにアイコンが出る。右クリックで設定メニューを開く
4. 幅を変える場合は、表示の左右の端をドラッグする(クリック透過がオフのとき)

使用率は、Claude Code を動かしている間に更新されます。

## アンインストール

mod:

```powershell
~\.local\bin\claude.exe plugin uninstall usage-band
```

デスクトップアプリ: Windows の「設定」→「アプリ」→「インストールされているアプリ」から「UsageBand」を削除

## ライセンス

MIT
