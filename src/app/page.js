"use client";

import { useState, useEffect } from "react";
import { auth, googleProvider, db } from "@/lib/firebase";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { collection, addDoc, query, where, getDocs, orderBy, deleteDoc, doc } from "firebase/firestore";
import { Toaster, toast } from "react-hot-toast";

export default function Home() {
  const [mood, setMood] = useState("");
  const [result, setResult] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [animeDetails, setAnimeDetails] = useState(null);
  const [user, setUser] = useState(null);
  const [favorites, setFavorites] = useState([]);
  const [viewedAnime, setViewedAnime] = useState([]);
  
  // СТАН ДЛЯ ЛІМІТІВ ТА ІСТОРІЇ
  const [usage, setUsage] = useState({ count: 0, limit: 3 });
  const [history, setHistory] = useState([]);
  const [activeTab, setActiveTab] = useState("favorites"); // "favorites" або "history"

  // ОНОВЛЕННЯ ЛІМІТІВ
  const refreshUsage = async () => {
    try {
      const res = await fetch(`/api/usage?userId=${user?.uid || null}`);
      if (res.ok) {
        const data = await res.json();
        setUsage(data);
      }
    } catch (err) {
      console.error("Помилка завантаження лімітів", err);
    }
  };

  // ЗАВАНТАЖЕННЯ ІСТОРІЇ
  const fetchHistory = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/history?userId=${user.uid}`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (err) {
      console.error("Помилка завантаження історії", err);
    }
  };

  // ПІДПИСКА НА СТАН КОРИСТУВАЧА
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        fetchFavorites(currentUser.uid);
        fetchHistory();
      }
      refreshUsage();
    });
    return () => unsubscribe();
  }, [user]);

  const handleLogin = async () => {
    try { 
      await signInWithPopup(auth, googleProvider); 
      toast.success("Вхід успішний! ✨");
    } catch (error) { 
      console.error(error); 
      toast.error("Помилка входу");
    }
  };

  const handleLogout = () => {
    signOut(auth);
    setHistory([]);
    toast("Ви вийшли з акаунта", { icon: "👋" });
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      generateAnime();
    }
  };

  const generateAnime = async () => {
    if (!mood.trim()) return toast.error("Спочатку опиши свій настрій!");
    if (isLoading) return;
    
    setIsLoading(true);
    setResult("");
    setAnimeDetails(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Перевір цей рядок у fetch всередині generateAnime:
body: JSON.stringify({ mood, viewedAnime, userId: user?.uid || null }),
      });

      if (response.status === 403) {
        const errorData = await response.json();
        toast.error(errorData.message, {
          duration: 6000,
          icon: "💳",
          style: { background: "#3b0764", color: "#fff", border: "1px solid #a855f7" }
        });
        setIsLoading(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        setResult(fullText);
      }
const fullTextCleaned = fullText.replace(/\*\*|"|'|Назва:|Title:/g, ""); // Видаляємо сміття
const parts = fullTextCleaned.split("|").map(p => p.trim());
const titleEng = parts[0];
const titleUa = parts[2] || titleEng;

if (titleEng) {
  setViewedAnime(prev => [...prev, titleEng].slice(-5));
  await fetchAnimeCover(titleEng, titleUa);
  refreshUsage();
  fetchHistory();
}
    } catch (error) { 
      console.error(error); 
      toast.error("Сталася помилка при генерації");
    } 
    finally { setIsLoading(false); }
  };

 const fetchAnimeCover = async (title, titleUa) => {
  try {
    const res = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1`);
    const data = await res.json();
    
    if (data.data?.[0]) {
      const a = data.data[0];
      setAnimeDetails({
        title: a.title,
        titleUa: titleUa,
        image: a.images.jpg.large_image_url,
        score: a.score || "N/A",
        url: a.url
      });
    } else {
      // Якщо Jikan не знайшов аніме, все одно показуємо назву без картинки
      setAnimeDetails({ title: title, titleUa: titleUa, image: null, score: "N/A", url: "#" });
    }
  } catch (error) {
    console.error("Помилка Jikan:", error);
    setAnimeDetails({ title: title, titleUa: titleUa, image: null, score: "N/A", url: "#" });
  }
};

  const fetchFavorites = async (uid) => {
    try {
      const q = query(collection(db, "favorites"), where("userId", "==", uid), orderBy("timestamp", "desc"));
      const querySnapshot = await getDocs(q);
      setFavorites(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) { console.error(error); }
  };

  const saveToFavorites = async () => {
    if (!user) return toast.error("Спочатку увійди в акаунт!");
    if (!animeDetails) return;
    try {
      const q = query(collection(db, "favorites"), where("userId", "==", user.uid), where("title", "==", animeDetails.title));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) return toast("Вже у колекції!", { icon: "😉" });
      await addDoc(collection(db, "favorites"), {
        userId: user.uid,
        ...animeDetails,
        timestamp: new Date()
      });
      toast.success("Збережено!"); 
      fetchFavorites(user.uid);
    } catch (error) { toast.error("Помилка збереження"); }
  };

  const removeFavorite = (e, id) => {
    e.preventDefault();
    toast((t) => (
      <div className="flex flex-col gap-3 p-1">
        <p className="font-bold text-white text-base">Видалити з колекції? 💔</p>
        <div className="flex gap-2 justify-end mt-2">
          <button onClick={() => toast.dismiss(t.id)} className="bg-gray-600 px-4 py-2 rounded-xl text-sm font-bold">Ні</button>
          <button onClick={async () => {
              toast.dismiss(t.id);
              try {
                await deleteDoc(doc(db, "favorites", id));
                setFavorites((prev) => prev.filter(f => f.id !== id));
                toast.success("Видалено");
              } catch (error) { toast.error("Помилка"); }
            }} className="bg-red-600 px-4 py-2 rounded-xl text-sm font-bold">Так</button>
        </div>
      </div>
    ), { style: { background: 'rgba(15, 23, 42, 0.95)', color: '#fff' } });
  };

  const displayDescription = result.includes('|') ? result.split('|')[1] : "Шукаю ідеальний тайтл...";

  return (
    <main className="min-h-screen lg:h-screen lg:overflow-hidden bg-[#050505] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#2e0b4b] via-[#0f172a] to-[#050505] text-white p-4 sm:p-6 font-sans flex flex-col">
      <Toaster position="bottom-right" />

      {/* HEADER */}
      <div className="w-full max-w-7xl mx-auto flex justify-between items-center mb-6 shrink-0">
        <div className="text-3xl font-black bg-gradient-to-r from-purple-400 via-pink-400 to-orange-400 bg-clip-text text-transparent tracking-tight">AniMood ⛩️</div>
        {user ? (
          <div className="flex items-center gap-3 bg-white/5 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/10">
            <img src={user.photoURL} className="w-8 h-8 rounded-full border border-purple-500" alt="avatar" />
            <button onClick={handleLogout} className="text-xs text-gray-300 hover:text-pink-400 font-bold transition-colors">Вийти</button>
          </div>
        ) : (
          <button onClick={handleLogin} className="bg-white/10 backdrop-blur-sm text-white border border-white/20 px-6 py-2 rounded-full text-sm font-bold hover:bg-white hover:text-black transition-all">Увійти</button>
        )}
      </div>

      <div className={`flex-1 w-full max-w-7xl mx-auto flex flex-col gap-6 overflow-hidden pb-4 ${user ? 'lg:flex-row' : 'items-center justify-center'}`}>
        
        {/* LEFT SECTION: INPUT & GENERATION */}
        <div className={`w-full flex flex-col gap-6 overflow-y-auto pr-1 pb-2 custom-scrollbar ${user ? 'lg:w-7/12' : 'max-w-2xl'}`}>
          <div className="relative bg-[#0f172a]/60 backdrop-blur-xl border border-white/10 rounded-3xl p-2 shadow-lg shrink-0 overflow-hidden">
            
            {/* ЛІЧИЛЬНИК ЗАПИТІВ */}
            <div className="px-4 pt-3 pb-1">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[10px] font-black uppercase tracking-[0.15em] text-gray-400 flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${usage.count >= usage.limit ? 'bg-red-500 animate-pulse' : 'bg-purple-500'}`}></span>
                  Запити на сьогодні
                </span>
                <span className="text-[10px] font-black text-white bg-white/10 px-2 py-0.5 rounded-md border border-white/5">
                  {usage.count} / {usage.limit}
                </span>
              </div>
              <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden border border-white/5">
                <div 
                  className={`h-full transition-all duration-1000 ease-out ${usage.count >= usage.limit ? 'bg-red-500 shadow-[0_0_8px_#ef4444]' : 'bg-gradient-to-r from-purple-500 to-pink-500 shadow-[0_0_8px_#a855f7]'}`}
                  style={{ width: `${Math.min((usage.count / usage.limit) * 100, 100)}%` }}
                ></div>
              </div>
            </div>

            <textarea
              className="w-full bg-transparent p-4 outline-none text-base resize-none placeholder:text-gray-500 text-gray-100 mt-1"
              rows="2"
              placeholder="Яку історію твоя душа шукає сьогодні? ⛩️"
              value={mood}
              onChange={(e) => setMood(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button 
              onClick={generateAnime} 
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 py-3 rounded-2xl font-bold text-sm tracking-wide uppercase shadow-[0_0_15px_rgba(168,85,247,0.3)] active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {isLoading ? "🔮 СПРИЙНЯТТЯ СВІТІВ..." : "ЗНАЙТИ АНІМЕ ✨"}
            </button>
          </div>

          {/* RESULT CARD */}
          {result && (
            <div className="bg-white/5 backdrop-blur-lg rounded-[1.5rem] border border-white/10 shadow-xl flex flex-col sm:flex-row overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 shrink-0">
              {animeDetails && (
                <div className="sm:w-2/5 relative bg-black/50 shrink-0">
                  <img src={animeDetails.image} className="w-full h-48 sm:h-full object-cover opacity-90" alt="Cover" />
                  <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md text-yellow-400 text-[10px] font-black px-2 py-1 rounded-lg">⭐ {animeDetails.score}</div>
                </div>
              )}
              <div className="p-4 sm:p-6 flex-1 flex flex-col">
                <h3 className="text-xl font-black text-white mb-2 leading-tight">{animeDetails?.titleUa || animeDetails?.title || "Шукаємо..."}</h3>
                <p className="text-gray-300 text-sm font-medium leading-relaxed mb-4 italic">"{displayDescription}"</p>
                <div className="flex gap-2 mt-auto">
                  {user && animeDetails && (
                    <button onClick={saveToFavorites} className="flex-1 bg-white/10 hover:bg-white/20 border border-white/20 px-2 py-2.5 rounded-xl text-xs font-bold transition-all">🤍 Зберегти</button>
                  )}
                  {animeDetails?.title && (
                    <a href={`https://anitube.in.ua/index.php?do=search&subaction=search&story=${encodeURIComponent(animeDetails.title)}`} target="_blank" className="flex-1 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 px-2 py-2.5 rounded-xl text-xs font-black transition-all text-center flex justify-center items-center shadow-[0_0_15px_rgba(239,68,68,0.3)] uppercase tracking-wider">▶ Дивитись</a>
                  )}
                </div>
              </div>
            </div>
          )}

          {!user && !isLoading && !result && (
            <div className="bg-gradient-to-r from-purple-900/40 to-pink-900/40 border border-pink-500/30 backdrop-blur-md rounded-2xl p-6 text-center shadow-lg animate-in fade-in slide-in-from-bottom-4">
              <h3 className="text-lg font-bold text-white mb-2 text-balance">Бажаєш більше запитів? ⛩️</h3>
              <p className="text-gray-300 text-sm mb-5">Увійди через Google, щоб отримати 15 запитів на день!</p>
              <button onClick={handleLogin} className="bg-white text-black px-6 py-2.5 rounded-full text-sm font-bold hover:bg-gray-200 transition-all">Увійди через Google</button>
            </div>
          )}
        </div>

        {/* RIGHT SECTION: VAULT (WITH TABS) */}
        {user && (
          <div className="w-full lg:w-5/12 flex flex-col bg-white/5 backdrop-blur-md rounded-[2rem] border border-white/10 overflow-hidden shadow-2xl h-[60vh] lg:h-auto">
            
            {/* ВКЛАДКИ */}
            <div className="flex border-b border-white/10 bg-black/40 shrink-0">
              <button 
                onClick={() => setActiveTab("favorites")}
                className={`flex-1 py-4 text-[10px] font-black tracking-[0.2em] uppercase transition-all flex items-center justify-center gap-2 ${
                  activeTab === "favorites" ? 'text-white border-b-2 border-purple-500 bg-white/5' : 'text-gray-500'
                }`}
              >
                Обране ({favorites.length})
              </button>
              <button 
                onClick={() => { setActiveTab("history"); fetchHistory(); }}
                className={`flex-1 py-4 text-[10px] font-black tracking-[0.2em] uppercase transition-all flex items-center justify-center gap-2 ${
                  activeTab === "history" ? 'text-white border-b-2 border-purple-500 bg-white/5' : 'text-gray-500'
                }`}
              >
                Історія ({history.length})
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
              {activeTab === "favorites" ? (
                favorites.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {favorites.map((fav) => (
                      <div key={fav.id} className="group relative animate-in fade-in duration-500">
                        <a href={fav.url} target="_blank" className="block bg-black/40 rounded-xl overflow-hidden border border-white/10 hover:border-pink-500 transition-all shadow-lg">
                          <div className="aspect-[3/4] overflow-hidden relative">
                            <img src={fav.image} className="w-full h-full object-cover group-hover:scale-110 opacity-90 transition-all duration-500" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                              <span onClick={(e) => { e.preventDefault(); window.open(`https://anitube.in.ua/index.php?do=search&subaction=search&story=${encodeURIComponent(fav.title)}`, '_blank'); }} className="text-[9px] font-bold text-white bg-red-600 px-2 py-1 rounded-md w-full text-center cursor-pointer shadow-lg uppercase">▶ Дивитись</span>
                            </div>
                          </div>
                          <div className="p-2.5">
                            <p className="text-[10px] font-bold truncate text-gray-200 uppercase tracking-tighter">{fav.titleUa || fav.title}</p>
                          </div>
                        </a>
                        <button onClick={(e) => removeFavorite(e, fav.id)} className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 border border-white/20 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all text-[10px] z-10">✕</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-30 mt-10">
                    <span className="text-4xl mb-2">🏮</span>
                    <p className="text-[10px] font-black uppercase tracking-widest text-center">Тут порожньо</p>
                  </div>
                )
              ) : (
                <div className="flex flex-col gap-3">
                  {history.length > 0 ? (
                    history.map((item) => (
                      <div key={item.id} className="bg-white/5 p-3 rounded-2xl border border-white/5 hover:border-purple-500/30 transition-all group animate-in slide-in-from-right-4">
                        <div className="flex justify-between items-start mb-2">
                           <span className="text-[8px] font-black text-purple-400 uppercase tracking-widest bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">Настрій</span>
                           <span className="text-[8px] text-gray-500 font-bold uppercase">{item.timestamp?.toDate ? new Date(item.timestamp.toDate()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Щойно'}</span>
                        </div>
                        <p className="text-[11px] text-gray-300 italic mb-2 px-1 line-clamp-1">"{item.mood}"</p>
                        <div className="flex items-center justify-between gap-3 bg-black/20 p-2 rounded-xl border border-white/5">
                          <p className="text-xs font-black text-white truncate uppercase tracking-tighter">{item.animeTitleUa || item.animeTitle}</p>
                          <button 
                            onClick={() => { setMood(item.mood); generateAnime(); }}
                            className="shrink-0 text-[9px] font-black text-purple-400 hover:text-white transition-colors uppercase"
                          >
                            ПОВТОРИТИ ↺
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-30 mt-10">
                      <span className="text-4xl mb-2">⏳</span>
                      <p className="text-[10px] font-black uppercase tracking-widest text-center">Історія порожня</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}