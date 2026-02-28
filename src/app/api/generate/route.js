import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "@/lib/firebase"; 
import { doc, getDoc, setDoc, updateDoc, increment, collection, addDoc, serverTimestamp } from "firebase/firestore";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Використовуємо моделі з Unlimited лімітами для стабільності
const MODELS_PRIORITY = [
 "gemini-2.0-flash-lite",      
  
  "gemini-2.5-flash-lite", 
  "gemini-2.0-flash",
];

export async function POST(req) {
  try {
    const { mood, viewedAnime, userId } = await req.json();
    
    // Перевірка userId (ігноруємо рядок "null")
    const validUserId = userId && userId !== "null" ? userId : null;
    
    const ip = req.headers.get("x-forwarded-for")?.split(',')[0] || "anonymous";
    const identifier = validUserId || ip;
    const limit = validUserId ? 15 : 3;
    
    const today = new Date().toISOString().split('T')[0];
    const usageRef = doc(db, "usage", identifier);
    
    // ПЕРЕВІРКА ЛІМІТІВ
    const usageSnap = await getDoc(usageRef);
    if (usageSnap.exists() && usageSnap.data().lastDate === today && usageSnap.data().count >= limit) {
      return new Response(JSON.stringify({ error: "LIMIT_REACHED" }), { status: 403 });
    }

    let result = null;
    for (const modelName of MODELS_PRIORITY) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const prompt = `Ти — аніме-сомельє. Настрій: "${mood}". Підбери 1 аніме.
        ФОРМАТ ВІДПОВІДІ: Назва Eng | Опис | Назва Укр. 
        ВАЖЛИВО: Тільки текст, розділений "|". Без лапок та зірочок.`;
        
        result = await model.generateContentStream(prompt);
        if (result) break; 
      } catch (err) { continue; }
    }

    if (!result) throw new Error("API Unavailable");

    // Оновлюємо лічильник запитів
    await setDoc(usageRef, { count: increment(1), lastDate: today }, { merge: true });

    const stream = new ReadableStream({
      async start(controller) {
        let fullText = ""; 

        for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          fullText += chunkText;
          controller.enqueue(new TextEncoder().encode(chunkText));
        }

        // ЗАПИС В ІСТОРІЮ ПІСЛЯ ЗАВЕРШЕННЯ ГЕНЕРАЦІЇ
        if (validUserId && fullText.includes("|")) {
          try {
            const parts = fullText.replace(/\*\*|"/g, "").split("|").map(p => p.trim());
            
            // Записуємо тільки якщо розбиття пройшло успішно
            if (parts.length >= 2) {
              await addDoc(collection(db, "history"), {
                userId: validUserId,
                mood: mood,
                animeTitle: parts[0],
                animeTitleUa: parts[2] || parts[0],
                timestamp: serverTimestamp()
              });
              console.log("✅ Історію збережено для:", validUserId);
            }
          } catch (e) {
            console.error("❌ Помилка Firebase History:", e.message);
          }
        }
        controller.close();
      },
    });

    return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });

  } catch (error) {
    console.error("API Error:", error);
    return new Response("Error", { status: 500 });
  }
}