import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "@/lib/firebase"; 
import { doc, getDoc, setDoc, updateDoc, increment, collection, addDoc, serverTimestamp } from "firebase/firestore";

// 1. Отримуємо рядок з ключами (підтримуємо і старий варіант з одним ключем для сумісності)
const keysString = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";

// 2. Розбиваємо рядок на масив по комі і забираємо зайві пробіли
const API_KEYS = keysString.split(',').map(key => key.trim()).filter(key => key.length > 0);

const MODELS_PRIORITY = [
  // 🟢 1 ешелон: Безлімітні "робочі конячки" (Швидкі та безлімітні на день)
  "gemini-2.5-flash-lite", // 27 RPM / Unlimited RPD
  "gemini-2.0-flash-lite", // 0 RPM / Unlimited RPD 
  "gemini-2.0-flash",      // 0 RPM / Unlimited RPD

  // 🟡 2 ешелон: Супер-розумні моделі з величезним лімітом (по 10 000 запитів)
  "gemini-2.5-flash",      // 22 RPM / 10K RPD
  "gemini-3.0-flash",      // 0 RPM / 10K RPD (у списку вказана як Gemini 3 Flash)

  // 🔴 3 ешелон: Важка артилерія (Pro-версії, використовуємо тільки як крайній запас)
  "gemini-2.5-pro",        // 1K RPD
  "gemini-3.1-pro"         // 250 RPD
];

export async function POST(req) {
  try {
    const randomKey = API_KEYS[Math.floor(Math.random() * API_KEYS.length)];
    
    if (!randomKey) {
      throw new Error("API ключі не налаштовані на сервері!");
    }

    // 4. Ініціалізуємо ШІ саме з цим випадковим ключем
    const genAI = new GoogleGenerativeAI(randomKey);
    console.log(`🔑 Використовується ключ: ...${randomKey.slice(-6)}`); // Логуємо останні 6 символів ключа для перевірки
    const { mood, viewedAnime, userId } = await req.json();
    
    const validUserId = userId && userId !== "null" ? userId : null;
    
    // 👑 ТУТ ВСТАВ СВІЙ СКОПІЙОВАНИЙ UID
    const ADMIN_UID = "RzEsBfPOmsWazI6kevduWjCjv8S2"; 
    
    const ip = req.headers.get("x-forwarded-for")?.split(',')[0] || "anonymous";
    const identifier = validUserId || ip;
    const limit = validUserId ? 15 : 3;
    
    const today = new Date().toISOString().split('T')[0];
    const usageRef = doc(db, "usage", identifier);
    
    // 1. ПЕРЕВІРКА ЛІМІТІВ (З урахуванням адміна)
    const usageSnap = await getDoc(usageRef);
    
    // Якщо поточний юзер - це ти (Адмін), ми просто ігноруємо блок з помилкою 403
    if (validUserId !== ADMIN_UID) {
      if (usageSnap.exists() && usageSnap.data().lastDate === today && usageSnap.data().count >= limit) {
        return new Response(JSON.stringify({ 
          error: "LIMIT_REACHED", 
          message: `Вичерпано ліміт (${limit} зап./день).` 
        }), { status: 403 });
      }
    } else {
      console.log("👑 Авторизовано Адміністратора. Безліміт активовано!");
    }

    // Підготовка списку для виключення
    const avoidText = viewedAnime?.length > 0 ? `ЗАБОРОНЕНО пропонувати: ${viewedAnime.join(", ")}.` : "";

    let result = null;
    let usedModel = "";

    // 2. ЦИКЛ ГЕНЕРАЦІЇ З FALLBACK
    for (const modelName of MODELS_PRIORITY) {
      try {
        console.log(`📡 Запит до моделі: ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName });
        
        const prompt = `Ти — елітний сомельє аніме. Настрій користувача: "${mood}". 
        Підбери ОДНЕ ідеальне аніме. ${avoidText}

        ВИМОГИ ДО ОПИСУ:
        - Рівно 3-4 речення.
        - Атмосферно поясни, чому цей тайтл підходить під вказаний настрій.
        - Без спойлерів.

        ФОРМАТ ВІДПОВІДІ: Назва Eng | Опис Укр | Назва Укр. (Без лапок та зірочок)`;
        
        result = await model.generateContentStream(prompt);
        if (result) {
          usedModel = modelName;
          break; 
        }
      } catch (err) {
        console.error(`⚠️ ${modelName} недоступна, йду далі...`);
        continue; 
      }
    }

    if (!result) throw new Error("Усі моделі ШІ зараз перевантажені.");

    // 3. ОНОВЛЕННЯ ЛІЧИЛЬНИКА
    await setDoc(usageRef, { count: increment(1), lastDate: today }, { merge: true });

    const stream = new ReadableStream({
      async start(controller) {
        let fullText = ""; 

        try {
          for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            fullText += chunkText;
            controller.enqueue(new TextEncoder().encode(chunkText));
          }

          // 4. ЗАПИС В ІСТОРІЮ ПІСЛЯ СТРІМУ
          if (validUserId && fullText.includes("|")) {
            const cleanText = fullText.replace(/\*\*|"/g, "");
            const parts = cleanText.split("|").map(p => p.trim());
            
            if (parts.length >= 2) {
              await addDoc(collection(db, "history"), {
                userId: validUserId,
                mood: mood,
                animeTitle: parts[0],
                animeTitleUa: parts[2] || parts[0],
                timestamp: serverTimestamp()
              });
              console.log(`✅ Історію збережено (${usedModel})`);
            }
          }
        } catch (e) {
          console.error("❌ Помилка в потоці або БД:", e.message);
        }
        controller.close();
      },
    });

    return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });

  } catch (error) {
    console.error("API Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}