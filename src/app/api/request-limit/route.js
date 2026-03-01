import nodemailer from 'nodemailer';
import { db } from "@/lib/firebase"; 
import { doc, updateDoc, getDoc } from "firebase/firestore";

export async function POST(req) {
  try {
    const { userEmail, userName, userId } = await req.json();
    
    // 1. ГЕНЕРУЄМО УНІКАЛЬНИЙ ID ЗАПИТУ (КВИТОК)
    const requestId = Date.now().toString();

    // 2. ЗАПИСУЄМО ЙОГО В БАЗУ КОРИСТУВАЧА
    const userRef = doc(db, "usage", userId);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      await updateDoc(userRef, { pendingRequestId: requestId });
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });

    const adminSecret = process.env.ADMIN_SECRET;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    // 3. НОВИЙ СТИЛЬНИЙ ДИЗАЙН ЛИСТА (Без зайвих коментарів)
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: `🚀 Новий запит на ліміти: ${userName}`,
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #0f172a; padding: 30px; border-radius: 16px; border: 1px solid #334155; color: #f8fafc;">
          <h2 style="color: #c084fc; margin-top: 0; font-size: 24px; border-bottom: 1px solid #334155; padding-bottom: 15px;">Запит на ліміти AniMood ⛩️</h2>
          
          <p style="font-size: 16px; line-height: 1.5; color: #cbd5e1;">
            Користувач <b style="color: #f8fafc;">${userName}</b> (<a href="mailto:${userEmail}" style="color: #93c5fd; text-decoration: none;">${userEmail}</a>) просить добавки!
          </p>
          
          <div style="margin-top: 35px; display: block;">
            <a href="${baseUrl}/api/approve-limit?userId=${userId}&secret=${adminSecret}&userEmail=${userEmail}&requestId=${requestId}" 
               style="background: linear-gradient(135deg, #22c55e, #16a34a); color: white; padding: 14px 28px; text-decoration: none; border-radius: 12px; font-weight: bold; font-size: 14px; display: inline-block; text-align: center; text-transform: uppercase; letter-spacing: 1px; box-shadow: 0 4px 6px -1px rgba(34, 197, 94, 0.2);">
               ✅ Схвалити (+10)
            </a>
            
            <a href="${baseUrl}/api/reject-limit?userId=${userId}&secret=${adminSecret}&userEmail=${userEmail}&requestId=${requestId}" 
               style="background: linear-gradient(135deg, #ef4444, #dc2626); color: white; padding: 14px 28px; text-decoration: none; border-radius: 12px; font-weight: bold; font-size: 14px; display: inline-block; margin-left: 15px; text-align: center; text-transform: uppercase; letter-spacing: 1px; box-shadow: 0 4px 6px -1px rgba(239, 68, 68, 0.2);">
               ❌ Відхилити
            </a>
          </div>
          
          <p style="margin-top: 40px; font-size: 12px; color: #64748b; border-top: 1px solid #334155; padding-top: 15px;">
            Ці кнопки спрацюють лише один раз. Після натискання запит буде закрито.
          </p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    return new Response(JSON.stringify({ success: true }), { status: 200 });

  } catch (error) {
    console.error("Помилка:", error);
    return new Response(JSON.stringify({ error: 'Помилка' }), { status: 500 });
  }
}