import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import nodemailer from 'nodemailer';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  const userEmail = searchParams.get('userEmail');
  const secret = searchParams.get('secret');
  const requestId = searchParams.get('requestId'); // 👈 Ловимо квиток

  if (secret !== process.env.ADMIN_SECRET) return new Response("Доступ заборонено!", { status: 403 });

  try {
    const userRef = doc(db, "usage", userId);
    const userSnap = await getDoc(userRef);

    // 🛑 ПЕРЕВІРКА КВИТКА: Якщо його немає, або він не збігається — блокуємо!
    if (!userSnap.exists() || userSnap.data().pendingRequestId !== requestId) {
      return new Response(`
        <html><body style="font-family: sans-serif; text-align: center; padding: 50px; background: #0f172a; color: white;">
          <h1 style="color: #eab308;">Запит недійсний ⚠️</h1>
          <p>Цей запит вже було оброблено раніше, або він застарів.</p>
        </body></html>
      `, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    let newLimit = 25; 
    if (userSnap.data().limit) newLimit = userSnap.data().limit + 10;

    // 🔥 Оновлюємо і "СПАЛЮЄМО" квиток (pendingRequestId: null)
    await updateDoc(userRef, {
      limit: newLimit,
      limitRequestStatus: 'approved', 
      lastRequestTime: Date.now(),
      pendingRequestId: null 
    });

    if (userEmail) {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
      });
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: userEmail,
        subject: 'AniMood AI | Ліміти збільшено! ✨',
        html: `<div style="padding: 20px;"><h2 style="color: #22c55e;">Чудові новини!</h2><p>Адміністратор схвалив ваш запит. Вам додано <b>+10 щоденних генерацій</b>.</p></div>`
      });
    }

    return new Response(`
      <html><body style="font-family: sans-serif; text-align: center; padding: 50px; background: #0f172a; color: white;">
        <h1 style="color: #22c55e;">Схвалено ✅</h1>
        <p>Користувачу успішно встановлено ліміт: ${newLimit}. Сповіщення відправлено.</p>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

  } catch (error) {
    console.error(error);
    return new Response("Помилка сервера", { status: 500 });
  }
}