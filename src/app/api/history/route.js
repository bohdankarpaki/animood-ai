import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId || userId === "null") return new Response(JSON.stringify([]), { status: 200 });

    const q = query(
      collection(db, "history"),
      where("userId", "==", userId),
      orderBy("timestamp", "desc"),
      limit(10)
    );

    const snap = await getDocs(q);
    
    // Перетворюємо документи в масив
    const data = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      // Безпечне перетворення дати
      timestamp: doc.data().timestamp?.toDate?.() || new Date()
    }));

    return new Response(JSON.stringify(data), { status: 200 });
  } catch (error) {
    console.error("History Error:", error.message);
    // Повертаємо порожній список замість помилки 500, щоб фронтенд не ламався
    return new Response(JSON.stringify([]), { status: 200 });
  }
}