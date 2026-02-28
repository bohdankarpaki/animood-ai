import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "@/lib/firebase"; 
import { doc, getDoc, setDoc, updateDoc, increment } from "firebase/firestore";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ПРІОРИТЕТ МОДЕЛЕЙ (від найновіших до найстабільніших)
const MODELS_PRIORITY = [
  "gemini-2.5-flash-lite", // Безлімітна новинка
  "gemini-2.0-flash",      // Надійний сучасний стандарт
  "gemini-2.0-flash-lite" // Максимальна швидкість
];

export async function POST(req) {
  try {
    const { mood, viewedAnime, userId } = await req.json();
    
    // 1. ВИЗНАЧЕННЯ ІДЕНТИФІКАТОРА ТА ЛІМІТІВ
    // Для незареєстрованих використовуємо IP, для своїх — UID
    const ip = req.headers.get("x-forwarded-for")?.split(',')[0] || "anonymous";
    const identifier = userId || ip;
    const limit = userId ? 15 : 3; // Твої умови: 15 для своїх, 3 для гостей
    
    const today = new Date().toISOString().split('T')[0]; // Формат YYYY-MM-DD
    const usageRef = doc(db, "usage", identifier);
    
    // 2. ПЕРЕВІРКА КВОТИ У FIRESTORE
    const usageSnap = await getDoc(usageRef);
    let currentCount = 0;

    if (usageSnap.exists()) {
      const data = usageSnap.data();
      if (data.lastDate === today) {
        currentCount = data.count || 0;
      } else {
        // Новий день — скидаємо лічильник (merge: true збереже інші дані)
        await setDoc(usageRef, { count: 0, lastDate: today }, { merge: true });
      }
    } else {
      // Перший візит за весь час
      await setDoc(usageRef, { count: 0, lastDate: today });
    }

    if (currentCount >= limit) {
      return new Response(JSON.stringify({ 
        error: "LIMIT_REACHED", 
        message: `Ви вичерпали ліміт на сьогодні (${limit} зап.). ${!userId ? 'Увійдіть, щоб отримати 15 запитів!' : 'Приходьте завтра за новими ідеями!'}` 
      }), { status: 403, headers: { "Content-Type": "application/json" } });
    }

    // 3. ЦИКЛ ГЕНЕРАЦІЇ (FALLBACK STRATEGY)
    let result = null;
    let usedModelName = "";

    for (const modelName of MODELS_PRIORITY) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        
        const avoidList = viewedAnime?.length > 0 ? viewedAnime.join(", ") : "";
        const avoidRule = avoidList ? `ВАЖЛИВО: Користувач вже бачив: ${avoidList}. ЗАБОРОНЕНО повторювати ці назви. Запропонуй нове аніме!` : "";

        const prompt = `Ти — елітний сомельє аніме. Користувач має настрій: "${mood}". 
        Підбери ОДНЕ ідеальне аніме.
        ${avoidRule}
        Опис має бути атмосферним, без спойлерів, 2-3 речення.
        Формат: Назва англійською | Опис українською | Назва українською.
        Не пиши нічого зайвого, тільки цей формат.`;

        result = await model.generateContentStream(prompt);
        usedModelName = modelName;
        if (result) break; 
      } catch (err) {
        if (err.status === 429) {
          console.warn(`⚠️ ${modelName} Quota exceeded. Trying next...`);
          continue;
        }
        throw err;
      }
    }

    if (!result) throw new Error("Усі моделі недоступні.");

    // 4. ОНОВЛЕННЯ ЛІЧИЛЬНИКА ТА ПОВЕРНЕННЯ СТРІМУ
    await updateDoc(usageRef, { count: increment(1) });
    console.log(`✅ [${identifier}] використано модель: ${usedModelName}`);

    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of result.stream) {
          controller.enqueue(new TextEncoder().encode(chunk.text()));
        }
        controller.close();
      },
    });

    return new Response(stream, { 
      headers: { "Content-Type": "text/plain; charset=utf-8" } 
    });

  } catch (error) {
    console.error("Critical API Error:", error);
    return new Response("Вибачте, сервіс тимчасово перевантажений.", { status: 500 });
  }
}