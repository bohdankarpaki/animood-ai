"use client";

import { useState, useEffect } from "react";
import { auth, googleProvider, db } from "@/lib/firebase";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { collection, addDoc, query, where, getDocs, orderBy, deleteDoc, doc } from "firebase/firestore";

export default function Home() {
  const [mood, setMood] = useState("");
  const [result, setResult] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [animeDetails, setAnimeDetails] = useState(null);
  const [user, setUser] = useState(null);
  const [favorites, setFavorites] = useState([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) fetchFavorites(currentUser.uid);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try { await signInWithPopup(auth, googleProvider); } 
    catch (error) { console.error(error); }
  };

  const handleLogout = () => signOut(auth);

  // Функція для обробки натискання клавіш
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault(); // Запобігаємо переносу рядка
      generateAnime();    // Запускаємо пошук
    }
  };

const generateAnime = async () => {
    if (!mood.trim()) return alert("Опиши свій настрій!");
    setIsLoading(true);
    setResult("");
    setAnimeDetails(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mood }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        setResult(fullText);
      }

      // Розділяємо текст. Тепер title буде англійською.
      const parts = fullText.split("|");
      if (parts.length >= 2) {
        const titleEng = parts[0].trim();
        await fetchAnimeCover(titleEng);
      }
    } catch (error) { console.error(error); } 
    finally { setIsLoading(false); }
  };

  const fetchAnimeCover = async (title) => {
    try {
      const res = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1`);
      const data = await res.json();
      if (data.data?.[0]) {
        const anime = data.data[0];
        setAnimeDetails({
          title: anime.title,
          image: anime.images.jpg.large_image_url,
          score: anime.score,
          url: anime.url
        });
      }
    } catch (error) { console.error(error); }
  };

  const saveToFavorites = async () => {
    if (!user || !animeDetails) return;
    try {
      const q = query(collection(db, "favorites"), where("userId", "==", user.uid), where("title", "==", animeDetails.title));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        alert("Це аніме вже є у твоїй колекції! 😉");
        return;
      }

      await addDoc(collection(db, "favorites"), {
        userId: user.uid,
        title: animeDetails.title,
        image: animeDetails.image,
        url: animeDetails.url,
        timestamp: new Date()
      });
      alert("Збережено в обране! ⭐");
      fetchFavorites(user.uid);
    } catch (error) { console.error(error); }
  };

  const fetchFavorites = async (uid) => {
    try {
      const q = query(collection(db, "favorites"), where("userId", "==", uid), orderBy("timestamp", "desc"));
      const querySnapshot = await getDocs(q);
      setFavorites(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) { console.error(error); }
  };

  const removeFavorite = async (e, id) => {
    e.preventDefault();
    if (!confirm("Видалити з колекції?")) return;
    await deleteDoc(doc(db, "favorites", id));
    setFavorites(favorites.filter(f => f.id !== id));
  };

  return (
    <main className="min-h-screen bg-[#0f172a] text-white p-4 sm:p-8 font-sans">
      {/* Header */}
      <div className="max-w-5xl mx-auto flex justify-between items-center mb-12">
        <div className="text-3xl font-black bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">AniMood AI ⛩️</div>
        {user ? (
          <div className="flex items-center gap-4">
            <img src={user.photoURL} className="w-10 h-10 rounded-full border-2 border-purple-500 shadow-lg" alt="avatar" />
            <button onClick={handleLogout} className="text-xs text-gray-500 hover:text-red-400 font-bold uppercase">Вийти</button>
          </div>
        ) : (
          <button onClick={handleLogin} className="bg-white text-black px-8 py-2.5 rounded-full font-bold hover:bg-purple-100 transition-all shadow-lg">Увійти</button>
        )}
      </div>

      {/* Input Section */}
      <div className="max-w-3xl mx-auto mb-16">
        <textarea
          className="w-full bg-[#1e293b] border-2 border-gray-700 rounded-3xl p-6 mb-4 outline-none focus:border-purple-500 text-xl transition-all shadow-inner placeholder:text-gray-600"
          rows="3"
          placeholder="Який настрій сьогодні? (Enter для пошуку)"
          value={mood}
          onChange={(e) => setMood(e.target.value)}
          onKeyDown={handleKeyDown} // ДОДАНО ОБРОБКУ ENTER
        />
        <button 
          onClick={generateAnime} 
          disabled={isLoading}
          className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 py-5 rounded-2xl font-black text-xl shadow-xl shadow-purple-900/40 transform active:scale-95 transition-all"
        >
          {isLoading ? "⏳ АНАЛІЗУЄМО..." : "ЗНАЙТИ МОЄ АНІМЕ ✨"}
        </button>
      </div>

      {/* Result Card */}
      {result && (
        <div className="max-w-4xl mx-auto bg-[#1e293b] rounded-[2.5rem] overflow-hidden border border-gray-700 shadow-2xl flex flex-col lg:flex-row mb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
          {animeDetails && (
            <a href={animeDetails.url} target="_blank" rel="noopener noreferrer" className="lg:w-[45%] group relative block overflow-hidden">
              <img src={animeDetails.image} className="w-full h-full object-cover min-h-[400px] group-hover:scale-105 transition-transform duration-700" alt="Cover" />
              <div className="absolute top-4 left-4 bg-yellow-500 text-black text-sm font-black px-3 py-1.5 rounded-xl shadow-lg">⭐ {animeDetails.score}</div>
            </a>
          )}
          <div className="p-8 lg:p-12 flex-1 flex flex-col justify-center">
            <h2 className="text-purple-400 font-black text-xs uppercase tracking-[0.3em] mb-4">Твоя рекомендація</h2>
            <p className="text-gray-100 text-xl font-medium leading-relaxed italic mb-10">"{result}"</p>
            <div className="flex flex-wrap gap-4">
              {user && animeDetails && (
                <button onClick={saveToFavorites} className="bg-purple-600 hover:bg-purple-500 text-white px-8 py-3 rounded-2xl font-bold transition-all shadow-lg">⭐ Зберегти</button>
              )}
              {animeDetails && (
                <a href={animeDetails.url} target="_blank" rel="noopener noreferrer" className="bg-gray-800 hover:bg-gray-700 text-white px-8 py-3 rounded-2xl font-bold transition-all">Огляд ↗</a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Gallery */}
      {user && favorites.length > 0 && (
        <div className="max-w-6xl mx-auto mt-24 border-t border-gray-800 pt-16">
          <h2 className="text-2xl font-black mb-10 text-gray-400 uppercase tracking-widest flex items-center gap-4">
            <span className="h-1 w-12 bg-purple-500 rounded-full"></span> ТВОЯ КОЛЕКЦІЯ
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
            {favorites.map((fav) => (
              <div key={fav.id} className="group relative">
                <a href={fav.url} target="_blank" className="block bg-[#1e293b] rounded-2xl overflow-hidden border border-gray-800 hover:border-purple-500 transition-all shadow-lg">
                  <div className="aspect-[3/4] overflow-hidden"><img src={fav.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" /></div>
                  <div className="p-3"><p className="text-[11px] font-bold truncate text-gray-300">{fav.title}</p></div>
                </a>
                <button onClick={(e) => removeFavorite(e, fav.id)} className="absolute -top-2 -right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-10">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}