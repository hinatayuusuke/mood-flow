# タスク入力時の「目安/エネルギー」AI自動入力 実装案（MoodFlow）

## 目的
タスク追加時に `estimated_time`（目安分）と `energy_level`（1〜3）を未入力でも、Gemini の推論で補完し、ユーザーの入力負担を下げる。

---

## ゴール仕様
- タスク追加時、`estimated_time` と `energy_level` が未入力（`null`）の場合:
  - Gemini が推定値を返す
  - DBには推定値を保存する（ユーザーが後で編集できる前提）
- 例外や失敗時は「未設定のまま保存」できる（アプリが止まらない）

---

## 推定したい値
### estimated_time（分）
- `5` / `10` / `15` / `20` / `30` / `45` / `60` / `90` / `120` などの “丸め” を基本にする
- 必ず `5〜240` の範囲に制限（それ以外は `null`）

### energy_level（1〜3）
- `1`: 低（疲れていても着手しやすい）
- `2`: 中
- `3`: 高（集中・準備が必要）

---

## 実装方式（おすすめ順）

### A) 「同期補完」方式（おすすめ・簡単）
タスク追加 API（`POST /api/tasks`）内で推定を実行し、そのまま insert する。

- **メリット**: 実装が単純 / DBが常に埋まる / UIが追加ロジック不要
- **デメリット**: 追加ボタンが遅くなる（Gemini待ち）

#### 仕様（案）
`POST /api/tasks`
- request body:
  - `title` (required)
  - `description` (optional)
  - `estimated_time` (optional)
  - `energy_level` (optional)
  - `auto_estimate` (optional, default `true`)
- server behavior:
  - `estimated_time` が未指定、かつ `auto_estimate=true` の場合 → 推定
  - `energy_level` が未指定、かつ `auto_estimate=true` の場合 → 推定
  - 推定が失敗した場合 → その項目は `null` のままでもOK

#### UI（案）
- 「自動で目安/エネルギーを推定する」チェックボックス（デフォルトON）
- 推定結果が入ったら入力欄に反映（必要ならユーザーが修正）

---

### B) 「非同期補完」方式（体験良い）
まずタスクを `null` のまま登録 → 直後に推定して `PATCH` で埋める（UI側で二段階）。

- **メリット**: 追加ボタンが速い / “推定中…” 表示が作れる
- **デメリット**: 実装がやや複雑（追加→推定→更新）

#### 仕様（案）
1) `POST /api/tasks` で insert（`estimated_time=null`, `energy_level=null`）
2) クライアントが `POST /api/tasks/estimate` を呼ぶ（推定）
3) `PATCH /api/tasks/:id` で更新

---

## 推定API設計（方式Aでも内部利用でOK）
### エンドポイント案
`POST /api/tasks/estimate`

request:
```json
{
  "title": "メール返信",
  "description": "取引先に今日中に返す。短い返信でOK。",
  "mood": "何もしたくない（任意）"
}
```

response（JSONのみ）:
```json
{
  "estimated_time": 10,
  "energy_level": 1,
  "confidence": 0.72,
  "reason": "短い返信で完了しやすく、疲れていても着手可能"
}
```

バリデーション（サーバー側）:
- `estimated_time`: number | null（5〜240、5分単位に丸め）
- `energy_level`: 1 | 2 | 3 | null
- `confidence`: 0.0〜1.0（任意）
- `reason`: string（任意、ログ/UX用。保存しない選択も可）

---

## Geminiプロンプト案（推定専用）
### 方針
- **“JSONのみ”** を厳守
- 出力値は “丸め済み” で返す
- 推定根拠は短い1行（UX用）

プロンプト例（概略）:
```markdown
あなたはタスクの所要時間と負荷を推定するアシスタントです。
次のタスクについて、estimated_time（分）と energy_level（1〜3）を推定し、JSONのみで返してください。

# 制約
- JSONのみ
- estimated_time は 5〜240 の整数（5分単位に丸め）
- energy_level は 1〜3 の整数

# 入力
title: "{title}"
description: "{description}"
mood(optional): "{mood}"

# 出力スキーマ
{
  "estimated_time": 15,
  "energy_level": 2,
  "confidence": 0.6,
  "reason": "..."
}
```

---

## DB拡張（任意だが推奨）
推定値が「ユーザー入力」か「AI推定」かを追跡できるようにする。

追加カラム案:
- `estimated_time_source`: `"user" | "ai" | null`
- `energy_level_source`: `"user" | "ai" | null`
- `ai_notes`: text / jsonb（reasonやconfidenceを保存したい場合）

※ 最小実装では不要（既存カラムに推定値だけ入れても良い）。

---

## エラーハンドリング方針
- 推定APIが落ちてもタスク追加自体は成功させる（UX優先）
- 推定の失敗は `AI_DEBUG=1` のときだけ詳細ログ（本番は最小限）

---

## セキュリティ/コストの注意
- 推定に送るのは原則 `title/description` のみ（個人情報を書かないUI注意喚起も検討）
- 連打対策（簡易レート制限/デバウンス）を入れる余地あり
- モデルは高速な `flash` 系を基本（レスポンス優先）

---

## 実装タスク（チェックリスト）
- [ ] 推定関数（Gemini呼び出し＋バリデーション＋丸め）を `lib/aiEstimate.ts` 等に切り出す
- [ ] 方式A: `POST /api/tasks` で未入力時に推定して insert
- [ ] UI: 「自動推定」トグル（デフォルトON）＋推定値を編集できることを明確化
- [ ] ログ: `AI_DEBUG=1` のときだけ生レスポンスを記録（個人情報配慮）

