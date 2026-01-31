Gemini APIを活用した「気分連動型タスク管理アプリ」の実装案ですね。素晴らしいアイデアです！

タスクが溜まっている時に「何から手を付ければいいかわからない」「やる気が出ない」という状況は誰にでもあります。Geminiの推論能力を使って、ユーザーの今の状態に寄り添ったタスクを提案することで、**「意思決定のコスト」を下げ、着手へのハードルを下げる**ことができます。

以下に、具体的かつモダンな実装案を構成しました。

---

## 📱 アプリ名案：MoodFlow（ムードフロー）

### コンセプト

**「今のあなたに、ちょうどいいタスクを。」**
ユーザーはタスクを溜めておくだけ。あとは「今の気分」を入力すると、AIが執事のように最適なタスクを選んでくれます。

---

## 🛠 おすすめの技術スタック

開発スピードと拡張性を重視した構成です。

* **Frontend & Backend:** [Next.js](https://nextjs.org/) (App Router)
* フロントとバックエンドAPIを一つにまとめられ、Vercelへのデプロイも容易です。


* **Database:** [Supabase](https://supabase.com/) (PostgreSQL)
* タスクの永続化に使います。


* **AI Model:** Gemini API (`gemini-1.5-flash` 推奨)
* `flash`モデルは非常に高速で安価なため、リアルタイムなUI操作に適しています。


* **Styling:** Tailwind CSS

---

## 💾 1. データ構造 (Database)

タスクにはAIが判断材料にできる「メタデータ」を持たせることが重要です。

**Tasks テーブル**

* `id`: UUID
* `title`: String (タスク名)
* `description`: Text (詳細 - AIの判断材料になります)
* `estimated_time`: Integer (分単位 - "15", "60"など)
* `energy_level`: Integer (1: 低〜3: 高 - 任意入力またはAI自動推定)
* `is_completed`: Boolean

---

## 🧠 2. Gemini プロンプト設計 (ここが肝です)

Geminiに「タスクリスト」と「今の気分」を渡し、**JSON形式**で返答させることで、アプリ側で扱いやすくします。

### プロンプトの構成例

```markdown
あなたは優秀なタスク管理アシスタントです。
以下のユーザーの「現在の気分」と「未完了タスクリスト」をもとに、
今やるべきおすすめのタスクを3つ選び、JSON形式で出力してください。

# 制約条件
- JSON形式のみを出力すること。
- `recommendations` 配列の中にオブジェクトを入れること。
- 各オブジェクトには `taskId` と `reason` (なぜこれを選んだかの一言コメント) を含めること。
- ユーザーの気分が落ち込んでいる時は簡単なタスクを、やる気がある時は重いタスクを優先すること。

# ユーザーの気分
"{userMood}" （例：すごく眠いけど、何か一つは終わらせたい）

# タスクリスト
{tasksJson} （例：[{"id": 1, "title": "メール返信", "time": 5}, ...]）

```

---

## 💻 3. 実装ロジック (Next.js API Route)

`app/api/recommend/route.ts` のイメージです。
`GoogleGenerativeAI` SDKを使用します。

```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

// Gemini APIの初期化
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: Request) {
  const { tasks, mood } = await req.json();

  // プロンプトの作成
  const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    // 必ずJSONで返すように指定（重要）
    generationConfig: { responseMimeType: "application/json" } 
  });

  const prompt = `
    あなたはタスク管理のプロです。以下のタスクリストから、
    ユーザーの気分「${mood}」に最適なタスクを最大3つ選んでください。
    
    タスクリスト: ${JSON.stringify(tasks)}

    出力スキーマ:
    {
      "recommendations": [
        { "id": "タスクID", "reason": "おすすめ理由（励ましの言葉を含めて）" }
      ]
    }
  `;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const recommendations = JSON.parse(responseText);

    return NextResponse.json(recommendations);
  } catch (error) {
    return NextResponse.json({ error: "AI processing failed" }, { status: 500 });
  }
}

```

---

## 🎨 4. UI/UX の流れ

ユーザー体験を楽しくするための工夫です。

1. **タスク登録画面**
* いつも通りタスクを追加します。


2. **「今の気分は？」エリア**
* テキスト入力：「部長に怒られてむしゃくしゃしてる」「眠い」
* または、クイックボタン：「🔥 やる気MAX」「☕️ ちょっと疲れた」「💤 何もしたくない」


3. **マジックボタン**
* 「タスクを選んでもらう ✨」ボタンを押す。


4. **結果表示 (ここがハイライト)**
* Geminiが選んだタスクがカードで表示されます。
* **AIからのコメント付き:**
* *「お疲れ気味ですね。まずは5分で終わる『メールチェック』だけやって、自分を褒めてあげましょう！」*


* この「AIの一言」があるだけで、ユーザーのやる気は大きく変わります。



---
