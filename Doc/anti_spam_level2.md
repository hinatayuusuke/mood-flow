# 連打防止（レベル2）実装案：UI + 簡易API重複検知（MoodFlow）

## 目的
タスク追加の「多重クリック」「同一内容の連続送信」により、
- 同じタスクが複数作成される
- Gemini推定が無駄に呼ばれてコスト/遅延が増える
を防ぐ。

レベル2は **UIの二重送信ガード + サーバー側の簡易重複検知** で、短時間で効果を出す方針。

---

## 対象操作
- `POST /api/tasks`（タスク追加）
  - UIでの連打が最も起きやすい
  - 推定（Gemini）も絡むため、連打のコストが高い

---

## 1) UI側対策（必須）
### 方針
- 送信中は「追加」ボタンを `disabled`
- `createTask()` が送信中に再度呼ばれたら早期 return

### 実装イメージ
- state:
  - `isCreatingTask: boolean`
- `createTask()`:
  - `if (isCreatingTask) return;`
  - `setIsCreatingTask(true)` → `finally` で `false`
- ボタン:
  - `disabled={!title.trim() || isCreatingTask}`
  - ラベルを `追加` → `追加中...` に切り替える

### 追加の微改善（任意）
- `Enter` キー連打でも同じ挙動になるように form submit を統一
- 送信中に入力欄を `readOnly/disabled` にして体感を安定させる

---

## 2) API側対策（簡易重複検知）
### 方針
「同じ `title + description`（正規化後）」が短時間に連続して作られた場合、重複とみなして弾く/既存を返す。

> 注意: 本格的な冪等性（Idempotency-Key）ではないため、誤検知はゼロにできない。  
> ただし “連打” 由来の重複は高確率で防げる。

### 2-1) 正規化ルール（推奨）
重複判定のキーは「見た目の差」を吸収する。
- `title`:
  - `trim()`
  - 連続空白を1つへ（`\\s+` → `" "`)
  - 大文字小文字は **そのまま** でもよい（日本語中心なら差が少ない）
- `description`:
  - `trim()`
  - 連続空白を1つへ
  - 未入力は `""`

### 2-2) 時間窓（dedupe window）
- 例: `10秒` or `15秒`
- 短すぎるとネットワーク遅延/再送に弱い、長すぎると“意図した連続登録”が阻害される

おすすめ: **10秒**

### 2-3) どうやって検知するか（簡易）
#### パターンA（DB検索のみ・最小）
`tasks` テーブルを “直近N件” から検索し、同一 `title/description` が直近X秒以内なら重複扱い。

- 実装:
  - `created_at >= now() - interval '10 seconds'`
  - `title == normalizedTitle`
  - `description == normalizedDescription`（null/空文字を統一）
  - `is_completed = false`（任意）
- 振る舞い（どちらか選ぶ）:
  - **(推奨)** 既存タスクを `200` で返す（`deduped: true` を付ける）
  - もしくは `409 Conflict` を返す

メリット:
- 追加カラム不要
- 実装が早い

デメリット:
- “同じ内容の別タスクを意図して作る” 場合に阻害される可能性

#### パターンB（dedupe_keyカラム追加・安定）
正規化した `title+description` のハッシュ（`dedupe_key`）を保存し、短時間窓で検索する。

- 追加カラム案:
  - `dedupe_key text`
  - `dedupe_at timestamptz`
- 検索が軽くなる（indexが張れる）

レベル2としては **Aでも十分**。将来的にBへ移行可能。

---

## 3) 返却レスポンス案（既存返し）
### 成功（新規作成）
```json
{ "task": { ... }, "deduped": false }
```

### 重複（既存返し）
```json
{ "task": { ...既存... }, "deduped": true }
```

UI側では `deduped:true` の場合に「同じ内容のタスクが既に追加されています」をトースト表示するなどが可能。

---

## 4) AI推定との関係
重複判定が **insert前** にできれば、重複時に Gemini 推定を呼ばずに済む（コスト削減）。

推奨フロー:
1. title/description 正規化
2. 直近10秒の重複チェック
3. 重複なら既存返し（推定しない）
4. 重複でなければ、未入力項目のみ推定 → insert

---

## 実装タスク（チェックリスト）
- [ ] UI: `isCreatingTask` を追加して二重送信ガード
- [ ] API: `POST /api/tasks` に重複チェックを追加（10秒窓）
- [ ] API: 重複時は既存タスクを返す（`deduped:true`）
- [ ] UI: `deduped:true` のときに軽いメッセージ表示（任意）

