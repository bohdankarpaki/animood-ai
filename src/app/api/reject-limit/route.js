import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import nodemailer from 'nodemailer';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  const userEmail = searchParams.get('userEmail');
  const secret = searchParams.get('secret');
  const requestId = searchParams.get('requestId');

  if (secret !== process.env.ADMIN_SECRET) return new Response("Доступ заборонено!", { status: 403 });

  try {
    const userRef = doc(db, "usage", userId);
    const userSnap = await getDoc(userRef);

    // 🛑 ПЕРЕВІРКА КВИТКА
    if (!userSnap.exists() || userSnap.data().pendingRequestId !== requestId) {
      return new Response(`
        <html><body style="font-family: sans-serif; text-align: center; padding: 50px; background: #0f172a; color: white;">
          <h1 style="color: #eab308;">Запит недійсний ⚠️</h1>
          <p>Цей запит вже було оброблено раніше.</p>
        </body></html>
      `, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    // 🔥 Оновлюємо статус і "СПАЛЮЄМО" квиток
    await updateDoc(userRef, {
      limitRequestStatus: 'rejected',
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
        subject: 'AniMood AI | Статус запиту',
        html: `<div style="padding: 20px;"><h2 style="color: #ef4444;">Запит відхилено ❌</h2><p>На жаль, ваш запит було відхилено.</p></div>`
      });
    }

    return new Response(`
      <html><body style="font-family: sans-serif; text-align: center; padding: 50px; background: #0f172a; color: white;">
        <h1 style="color: #ef4444;">Відхилено ❌</h1>
        <p>Статус оновлено. Клієнт побачить повідомлення на сайті.</p>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

  } catch (error) {
    console.error(error);
    return new Response("Помилка", { status: 500 });
  }
}