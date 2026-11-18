# usage-band

Claude Code のプロンプト上に帯を表示する mod。

- 5時間枠・週間枠の使用率バーとリセット時刻
- ペース(経過時間に対する消費の目安)の縦線。使用率がペースを超えると赤系に変化
- 実行中のツール名、経過時間、サブエージェント数、無反応時間

## インストール

ターミナルのセッションで:

```
/plugin install usage-band --marketplace isonya-tools/usage-band
```

シェルから:

```
claude plugin install usage-band --marketplace isonya-tools/usage-band
```

デスクトップアプリ(`/plugin` が使えない場合): プロンプト横の + → Plugins → Add marketplace に `isonya-tools/usage-band` を入力 → Add plugin。

## ライセンス

MIT
