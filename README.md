## MoodFlow

“今のあなたに、ちょうどいいタスクを。”

MoodFlow は、タスクを登録して「今の気分」を入力すると、Gemini が “今やるタスク” を最大3件提案してくれる Next.js アプリです。

### Features

- タスク管理（追加 / 完了切替 / 削除）
- 気分入力 → Gemini によるタスク提案（最大3件）
- タスク追加時に「目安（分）/エネルギー（1〜3）」を Gemini が自動推定（ON/OFF可）
- タスクリストの折りたたみ（未完了/完了）＋状態の保存（localStorage）

---

## Tech Stack

- Next.js (App Router)
- Tailwind CSS
- Supabase (PostgreSQL)
- Gemini API（Google AI）

---

## Setup

### 1) Install

```bash
npm install
```

### 2) Configure env

`.env.example` を `.env.local` にコピーして値を設定します。

Required:
- `GEMINI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`（※サーバーAPI専用。ブラウザに公開しない）

Optional:
- `AI_DEBUG=1`（サーバーログに Gemini の生レスポンス等を出します。個人情報に注意）

### 3) Create database table (Supabase)

Supabase の SQL editor で `Doc/supabase.sql` を実行します。

### 4) Run

```bash
npm run dev
```

Open `http://localhost:3000`.

---

## How it works (high level)

- `POST /api/tasks`: タスク作成（未入力の目安/エネルギーは Gemini で推定して保存）
- `GET /api/tasks`: タスク一覧取得
- `PATCH /api/tasks/:id`: 完了切替
- `POST /api/recommend`: 気分＋未完了タスクからおすすめを返す

Main UI:
- `app/ui/MoodFlowApp.tsx`

---

## Notes

- Gemini の無料枠/クォータにより `429 Too Many Requests` が出ることがあります（少し待って再試行、またはプラン/請求設定を確認してください）。
- `SUPABASE_SERVICE_ROLE_KEY` は強力な権限を持つため、絶対にクライアントへ露出させないでください（このアプリではサーバールートのみで使用します）。
