import { GoogleGenerativeAI } from "@google/generative-ai";

// Підключаємо наш ключ, який ми сховали в .env.local
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function POST(req) {
  try {
    // Отримуємо настрій, який користувач ввів на сайті
    const { mood } = await req.json();

    // Вибираємо найшвидшу модель
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

    // Прописуємо жорсткі правила для ШІ (Системний промпт)
    const prompt = `Ти експерт з аніме. Користувач описує свій настрій або побажання: "${mood}".
    Твоє завдання - порадити ТІЛЬКИ ОДНЕ аніме, яке найкраще підходить під цей опис.
    Відповідь має бути у такому форматі: спочатку оригінальна назва аніме англійською мовою, потім символ "|", а потім короткий опис українською мовою, чому ти його радиш.
    Приклад: Cyberpunk: Edgerunners | Тому що це ідеальний драйвовий кіберпанк з крутою музикою.`;

    // Запускаємо потокову генерацію (Real-time комунікація)
    const result = await model.generateContentStream(prompt);

    // Створюємо потік даних для відправки на фронтенд по шматочках
    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          controller.enqueue(new TextEncoder().encode(chunkText));
        }
        controller.close();
      },
    });

    // Повертаємо потік на наш сайт
    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("Помилка API:", error);
    return new Response("Сталася помилка при генерації.", { status: 500 });
  }
}