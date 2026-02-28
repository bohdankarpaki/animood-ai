# AniMood AI ⛩️

Персоналізований сервіс рекомендацій аніме на основі настрою користувача.

## ✨ Функціонал
- **AI Recommendation**: Використання Gemini 1.5 Flash для аналізу настрою та підбору аніме.
- **Real-time Streaming**: Потокова видача тексту для ефекту "живого" спілкування з ШІ.
- **Google Auth**: Безпечна авторизація користувачів.
- **Personal Collection**: Збереження улюблених тайтлів у базу даних Firestore.
- **Live Search**: Автоматичне підтягування обкладинок та рейтингів через Jikan API.

## 🛠 Технологічний стек
- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS
- **Database & Auth**: Firebase (Firestore)
- **AI Model**: Google Gemini 1.5 Flash
- **API**: Jikan API (MyAnimeList)

## 🚀 Запуск локально
1. Клонувати репозиторій.
2. Встановити залежності: `npm install`.
3. Створити файл `.env.local` з `GEMINI_API_KEY`.
4. Запустити: `npm run dev`.