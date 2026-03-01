import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "@/lib/firebase"; 
import { doc, getDoc, setDoc, updateDoc, increment, collection, addDoc, serverTimestamp } from "firebase/firestore";

// Отримуємо рядок з ключами
const keysString = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
const API_KEYS = keysString.split(',').map(key => key.trim()).filter(key => key.length > 0);

const MODELS_PRIORITY = [
  "gemini-2.5-flash-lite", 
  "gemini-2.0-flash-lite", 
  "gemini-2.0-flash",      
  "gemini-2.5-flash",      
  "gemini-3.0-flash",      
  "gemini-2.5-pro",        
  "gemini-3.1-pro"         
];

export async function POST(req) {
  try {
    // 1. ОДРАЗУ ЧИТАЄМО ДАНІ ЗАПИТУ (Без ініціалізації ШІ)
    const { mood, viewedAnime, userId } = await req.json();
    
    const validUserId = userId && userId !== "null" ? userId : null;
    const ADMIN_UID = "RzEsBfPOmsWazI6kevduWjCjv8S2"; 
    
    const ip = req.headers.get("x-forwarded-for")?.split(',')[0] || "anonymous";
    const identifier = validUserId || ip;
    
    const today = new Date().toISOString().split('T')[0];
    const usageRef = doc(db, "usage", identifier);
    
    // 2. ПЕРЕВІРКА ЛІМІТІВ
    const usageSnap = await getDoc(usageRef);
    let currentLimit = validUserId ? 15 : 3; 
    let currentCount = 0;

    if (usageSnap.exists()) {
      const data = usageSnap.data();
      if (data.limit) {
        currentLimit = data.limit; 
      }
      if (data.lastDate === today) {
        currentCount = data.count || 0;
      }
    }

    // Якщо ліміт вичерпано — відхиляємо запит ДО вибору ключа
    if (validUserId !== ADMIN_UID) {
      if (currentCount >= currentLimit) {
        return new Response(JSON.stringify({ 
          error: "LIMIT_REACHED", 
          message: `Вичерпано ліміт (${currentLimit} зап./день).` 
        }), { status: 403 });
      }
    } else {
      console.log("👑 Авторизовано Адміністратора. Безліміт активовано!");
    }

    // ==========================================
    // 3. ВИБІР КЛЮЧА ТА ІНІЦІАЛІЗАЦІЯ ШІ
    // (Виконується ТІЛЬКИ якщо ліміт НЕ вичерпано)
    // ==========================================
    const randomKey = API_KEYS[Math.floor(Math.random() * API_KEYS.length)];
    
    if (!randomKey) {
      throw new Error("API ключі не налаштовані на сервері!");
    }

    const genAI = new GoogleGenerativeAI(randomKey);
    console.log(`🔑 Використовується ключ: ...${randomKey.slice(-6)}`); 

    // 4. ПІДГОТОВКА ПРОМПТУ
    const avoidText = viewedAnime?.length > 0 ? `ЗАБОРОНЕНО пропонувати: ${viewedAnime.join(", ")}.` : "";
    let result = null;
    let usedModel = "";

    // 5. ЦИКЛ ГЕНЕРАЦІЇ З FALLBACK
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

    // 6. ОНОВЛЕННЯ ЛІЧИЛЬНИКА
    await setDoc(usageRef, { count: increment(1), lastDate: today }, { merge: true });

    // 7. СТРІМІНГ ВІДПОВІДІ
    const stream = new ReadableStream({
      async start(controller) {
        let fullText = ""; 

        try {
          for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            fullText += chunkText;
            controller.enqueue(new TextEncoder().encode(chunkText));
          }

          // 8. ЗАПИС В ІСТОРІЮ
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