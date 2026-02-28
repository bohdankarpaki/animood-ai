"use client";

import { useState, useEffect } from "react";
// Імпортуємо налаштування Firebase з нашого файлу
import { auth, googleProvider, db } from "@/lib/firebase";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { collection, addDoc, query, where, getDocs, orderBy } from "firebase/firestore";

export default function Home() {
  // СТАНИ (States) для керування даними на сторінці
  const [mood, setMood] = useState("");
  const [result, setResult] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [animeDetails, setAnimeDetails] = useState(null);
  const [user, setUser] = useState(null);
  const [favorites, setFavorites] = useState([]);

  // 1. Слідкуємо за авторизацією користувача
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        fetchFavorites(currentUser.uid); // Завантажуємо обране відразу після входу
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Логіка входу та виходу
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Помилка входу:", error);
    }
  };

  const handleLogout = () => signOut(auth);

  // 3. Основна функція генерації аніме через Gemini ШІ
  const generateAnime = async () => {
    if (!mood.trim()) return alert("Будь ласка, опиши свій настрій!");
    
    setIsLoading(true);
    setResult("");
    setAnimeDetails(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mood }),
      });

      if (!response.ok) throw new Error("Помилка API");

      // Читаємо потік (Streaming) для ефекту друку тексту
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let text = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        text += chunk;
        setResult(text);
      }

      // Після завершення тексту шукаємо постер
      const parts = text.split("|");
      if (parts.length > 0) {
        await fetchAnimeCover(parts[0].trim());
      }
    } catch (error) {
      console.error("Помилка генерації:", error);
      setResult("Сталася помилка. Спробуй ще раз.");
    } finally {
      setIsLoading(false);
    }
  };

  // 4. Пошук додаткових даних про аніме (Jikan API)
  const fetchAnimeCover = async (title) => {
    try {
      const res = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1`);
      const data = await res.json();
      if (data.data && data.data[0]) {
        const anime = data.data[0];
        setAnimeDetails({
          title: anime.title,
          image: anime.images.jpg.large_image_url,
          score: anime.score,
          episodes: anime.episodes,
          year: anime.year
        });
      }
    } catch (error) {
      console.error("Не вдалося знайти дані про аніме:", error);
    }
  };

  // 5. Робота з базою даних Firestore (Збереження та Читання)
  const saveToFavorites = async () => {
    if (!user) return alert("Спочатку увійди в акаунт!");
    try {
      await addDoc(collection(db, "favorites"), {
        userId: user.uid,
        title: animeDetails.title,
        image: animeDetails.image,
        score: animeDetails.score,
        timestamp: new Date()
      });
      alert("Додано в обране! ⭐");
      fetchFavorites(user.uid);
    } catch (error) {
      console.error("Помилка збереження:", error);
    }
  };

  const fetchFavorites = async (uid) => {
    try {
      const q = query(
        collection(db, "favorites"), 
        where("userId", "==", uid),
        orderBy("timestamp", "desc")
      );
      const querySnapshot = await getDocs(q);
      const favs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setFavorites(favs);
    } catch (error) {
      console.error("Помилка завантаження списку:", error);
    }
  };

  return (
    <main className="min-h-screen bg-[#0f172a] text-white p-4 sm:p-8 font-sans">
      {/* HEADER: Кнопка логіну та аватар */}
      <div className="max-w-4xl mx-auto flex justify-between items-center mb-12">
        <div className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
          AniMood AI ⛩️
        </div>
        <div>
          {user ? (
            <div className="flex items-center gap-4 bg-gray-800/50 p-1 pr-4 rounded-full border border-gray-700">
              <img src={user.photoURL} className="w-8 h-8 rounded-full" alt="avatar" />
              <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-white transition-colors">Вийти</button>
            </div>
          ) : (
            <button 
              onClick={handleLogin}
              className="bg-white text-black px-5 py-2 rounded-full text-sm font-bold hover:bg-purple-100 transition-all shadow-lg"
            >
              Увійти з Google
            </button>
          )}
        </div>
      </div>

      {/* MAIN CONTENT: Форма вводу */}
      <div className="max-w-2xl mx-auto bg-[#1e293b] rounded-2xl shadow-2xl p-6 sm:p-10 border border-gray-700">
        <h1 className="text-3xl font-extrabold text-center mb-2">Яке аніме подивитись?</h1>
        <p className="text-gray-400 text-center mb-8 text-sm">Опиши свої емоції, а штучний інтелект зробить решту.</p>

        <textarea
          className="w-full bg-[#0f172a] border border-gray-600 rounded-xl p-4 text-gray-100 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all outline-none resize-none"
          rows="3"
          placeholder="Наприклад: Хочу сумну історію про кохання, яка змусить мене плакати..."
          value={mood}
          onChange={(e) => setMood(e.target.value)}
          disabled={isLoading}
        />

        <button
          onClick={generateAnime}
          disabled={isLoading || !mood}
          className="w-full mt-4 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 py-4 rounded-xl font-bold text-lg transition-all shadow-lg shadow-purple-500/20"
        >
          {isLoading ? "ШІ аналізує твій настрій... ⏳" : "Підібрати аніме ✨"}
        </button>

        {/* RESULT SECTION: Вивід рекомендації */}
        {result && (
          <div className="mt-10 bg-[#0f172a] rounded-xl border border-purple-500/30 overflow-hidden animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row">
              {animeDetails && (
                <div className="md:w-1/3 shrink-0 relative">
                  <img src={animeDetails.image} className="w-full h-full object-cover" alt="Cover" />
                  <div className="absolute top-2 left-2 flex gap-1">
                    <span className="bg-yellow-500 text-black text-[10px] font-black px-2 py-1 rounded">⭐ {animeDetails.score}</span>
                  </div>
                </div>
              )}
              <div className="p-6 flex flex-col justify-between">
                <div>
                  <h3 className="text-purple-400 font-bold text-xl mb-3">Рекомендація:</h3>
                  <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{result}</p>
                </div>
                
                {user && animeDetails && (
                  <button 
                    onClick={saveToFavorites}
                    className="mt-6 flex items-center justify-center gap-2 border border-purple-500/50 text-purple-300 hover:bg-purple-500 hover:text-white px-4 py-2 rounded-lg text-sm transition-all"
                  >
                    ⭐ Зберегти в обране
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* FAVORITES SECTION: Список збереженого */}
      {user && favorites.length > 0 && (
        <div className="max-w-4xl mx-auto mt-20">
          <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
            <span className="w-8 h-8 bg-purple-600 flex items-center justify-center rounded-lg text-sm">📂</span>
            Моя колекція
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {favorites.map((fav) => (
              <div key={fav.id} className="group relative bg-[#1e293b] rounded-xl overflow-hidden border border-gray-800 hover:border-purple-500/50 transition-all">
                <img src={fav.image} className="w-full h-48 object-cover group-hover:scale-110 transition-transform duration-500" alt={fav.title} />
                <div className="p-3 bg-gradient-to-t from-[#0f172a] to-transparent">
                  <p className="text-[10px] font-bold text-white truncate">{fav.title}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}