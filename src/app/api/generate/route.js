import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function POST(req) {
  try {
    // Отримуємо настрій ТА історію переглядів (масив)
    const { mood, viewedAnime } = await req.json();
    
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Перетворюємо масив на рядок через кому. 
    // Якщо масив є і не порожній, створюємо жорстке правило
    const avoidList = viewedAnime && viewedAnime.length > 0 ? viewedAnime.join(", ") : "";
    
    const avoidRule = avoidList 
      ? `ВАЖЛИВО: Користувач вже бачив ці рекомендації: ${avoidList}. Ти ПОВИНЕН запропонувати АБСОЛЮТНО ІНШЕ аніме. Категорично заборонено повторювати їх!` 
      : "";

    const prompt = `Ти — елітний сомельє аніме. Користувач має такий настрій: "${mood}". 
Підбери ОДНЕ ідеальне аніме.
${avoidRule}
Опис має бути дуже атмосферним, інтригуючим, БЕЗ спойлерів і КОРОТКИМ (максимум 2-3 речення), щоб легко читався на екрані.
ВАЖЛИВО: Дотримуйся чіткого формату з трьох частин, розділених символом "|".
Формат: Назва англійською/Romaji (оригінал) | Короткий захоплюючий опис українською | Назва українською.
Не пиши ніяких вступних слів.`;

    const result = await model.generateContentStream(prompt);

    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          controller.enqueue(new TextEncoder().encode(chunkText));
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    console.error("Помилка API:", error);
    return new Response("Сталася помилка при генерації.", { status: 500 });
  }
}