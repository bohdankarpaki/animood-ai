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
  
  // ТЕПЕР МИ ПАМ'ЯТАЄМО ЦІЛИЙ СПИСОК (останні 5 аніме)
  const [viewedAnime, setViewedAnime] = useState([]);

  // СЛОВНИК ФЕЙСКОНТРОЛЮ (можеш додавати свої слова сюди)
 // ЕНЦИКЛОПЕДІЯ УКРАЇНСЬКОЇ ЛАЙКИ ТА МАТЮКІВ
  const badWords = [
    // --- ВАЖКА АРТИЛЕРІЯ (Класичні корені) ---
    "бля", "бляд", "блять", "вибляд",
    "хуй", "хує", "хуя", "хуї", "поху", "наху", "оху", "хєр", "хер", "хрєн", "залуп",
    "пізд", "пизд", "пізде", "пизде",
    "єбат", "ебат", "їбат", "йоб", "єбн", "ебн", "уйо", "уєб", "виєб", "в'єб", "заєб",

    // --- ПИТОМО УКРАЇНСЬКА АНАТОМІЯ ТА ФІЗІОЛОГІЯ ---
    "срак", "срал", "дуп", "гузн",
    "гівн", "говно", "гавн", "лайн", "кізяк", "сцяк",
    "перд", "бзд", "бздюх", "дрис",
    "шмарк", // від "шмаркач"
    
    // --- ЖІНКИ З НИЗЬКОЮ СОЦІАЛЬНОЮ ВІДПОВІДАЛЬНІСТЮ ---
    "курв", "лярв", "хвойд", "шльонд", "шлюх", "лахудр", "шалав",
    
    // --- ОБРАЗИ ТА ОЦІНКА ІНТЕЛЕКТУ ---
    "бовдур", "бевзь", "телеп", "дурбел", "вайл",
    "вилуп", "вишкреб",
    "наволоч", "падл", "покидь", "мерзот", "набрід",
    "чмо", "мудак", "бидл", "рагуль",

    // --- КЛАСИЧНІ ПРОКЛЬОНИ (якщо хочеш банити і за них) ---
    "шляк", "грець", "трясц", "холер", "дідьк"
  ];
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) fetchFavorites(currentUser.uid);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try { 
      await signInWithPopup(auth, googleProvider); 
      toast.success("Вхід успішний!");
    } 
    catch (error) { 
      console.error(error); 
      toast.error("Помилка входу");
    }
  };

  const handleLogout = () => {
    signOut(auth);
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
    
    // ПЕРЕВІРКА НА ЛАЙКУ
    const lowerMood = mood.toLowerCase();
    const isProfane = badWords.some(word => lowerMood.includes(word));

    if (isProfane) {
      toast.error("🤬 Виявлено нецензурну лексику! Доступ закрито.", { duration: 4000, style: { background: '#ef4444', color: '#fff' }});
      setTimeout(() => {
        if (user) signOut(auth); // Виходимо з акаунта
        window.location.href = "https://google.com"; // ВИКИДАЄМО З САЙТУ
      }, 1500);
      return;
    }

    if (isLoading) return;
    
    setIsLoading(true);
    setResult("");
    setAnimeDetails(null);

   try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mood, viewedAnime, userId: user?.uid }), // Передаємо ID
    });

    if (response.status === 403) {
      const errorData = await response.json();
      toast.error(errorData.message, {
        duration: 6000,
        icon: "💳",
        style: { background: "#3b0764", color: "#fff", border: "1px solid #a855f7" }
      });
      // Тут можна відкрити модальне вікно з цінами
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

      const parts = fullText.split("|");
      const titleEng = parts[0]?.trim();
      const titleUa = parts[2]?.trim() || titleEng;

      if (titleEng) {
        // ДОДАЄМО НОВЕ АНІМЕ В ПАМ'ЯТЬ (зберігаємо тільки останні 5, щоб не перевантажувати запит)
        setViewedAnime(prev => {
          const updatedList = [...prev, titleEng];
          return updatedList.slice(-5);
        });
        await fetchAnimeCover(titleEng, titleUa);
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
        const anime = data.data[0];
        setAnimeDetails({
          title: anime.title,
          titleUa: titleUa,
          image: anime.images.jpg.large_image_url,
          score: anime.score,
          url: anime.url
        });
      }
    } catch (error) { console.error(error); }
  };

  const saveToFavorites = async () => {
    if (!user) return toast.error("Спочатку увійди в акаунт!");
    if (!animeDetails) return;
    
    try {
      const q = query(collection(db, "favorites"), where("userId", "==", user.uid), where("title", "==", animeDetails.title));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) return toast("Це аніме вже є у твоїй колекції!", { icon: "😉" });

      await addDoc(collection(db, "favorites"), {
        userId: user.uid,
        title: animeDetails.title,
        titleUa: animeDetails.titleUa || animeDetails.title,
        image: animeDetails.image,
        url: animeDetails.url,
        timestamp: new Date()
      });
      toast.success("Збережено в обране!"); 
      fetchFavorites(user.uid);
    } catch (error) { 
      console.error(error); 
      toast.error("Помилка збереження");
    }
  };

  const fetchFavorites = async (uid) => {
    try {
      const q = query(collection(db, "favorites"), where("userId", "==", uid), orderBy("timestamp", "desc"));
      const querySnapshot = await getDocs(q);
      setFavorites(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) { console.error(error); }
  };

  const removeFavorite = (e, id) => {
    e.preventDefault();
    toast((t) => (
      <div className="flex flex-col gap-3 p-1">
        <p className="font-bold text-white text-base">Точно видалити з колекції? 💔</p>
        <div className="flex gap-2 justify-end mt-2">
          <button onClick={() => toast.dismiss(t.id)} className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all">Скасувати</button>
          <button onClick={async () => {
              toast.dismiss(t.id);
              try {
                await deleteDoc(doc(db, "favorites", id));
                setFavorites((prev) => prev.filter(f => f.id !== id));
                toast.success("Видалено");
              } catch (error) { console.error(error); toast.error("Помилка"); }
            }} className="bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-[0_0_15px_rgba(220,38,38,0.4)]">Видалити</button>
        </div>
      </div>
    ), { duration: 5000, style: { background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(255, 255, 255, 0.15)', color: '#fff' } });
  };

  const displayDescription = result.includes('|') ? result.split('|')[1] : "Шукаю ідеальний тайтл...";

  return (
    <main className="min-h-screen lg:h-screen lg:overflow-hidden bg-[#050505] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#2e0b4b] via-[#0f172a] to-[#050505] text-white p-4 sm:p-6 font-sans flex flex-col">
      <Toaster position="bottom-right" toastOptions={{ style: { background: '#1e293b', color: '#fff', border: '1px solid #334155' } }} />

      <div className="w-full max-w-7xl mx-auto flex justify-between items-center mb-6">
        <div className="text-3xl font-black bg-gradient-to-r from-purple-400 via-pink-400 to-orange-400 bg-clip-text text-transparent tracking-tight drop-shadow-md">AniMood ⛩️</div>
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
        
        <div className={`w-full flex flex-col gap-6 overflow-y-auto pr-1 pb-2 custom-scrollbar ${user ? 'lg:w-7/12' : 'max-w-2xl'}`}>
          
          <div className="relative bg-[#0f172a]/60 backdrop-blur-xl border border-white/10 rounded-3xl p-2 shadow-lg shrink-0">
            <textarea
              className="w-full bg-transparent p-4 outline-none text-base resize-none placeholder:text-gray-500 text-gray-100"
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
              {isLoading ? "🔮 Заглядаємо в майбутнє..." : "ЗНАЙТИ АНІМЕ ✨"}
            </button>
          </div>

          {result && (
            <div className="bg-white/5 backdrop-blur-lg rounded-[1.5rem] border border-white/10 shadow-xl flex flex-col sm:flex-row overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 shrink-0">
              {animeDetails && (
                <div className="sm:w-2/5 relative bg-black/50 shrink-0">
                  <img src={animeDetails.image} className="w-full h-48 sm:h-full object-cover opacity-90" alt="Cover" />
                  <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md text-yellow-400 text-[10px] font-black px-2 py-1 rounded-lg">⭐ {animeDetails.score}</div>
                </div>
              )}
              <div className="p-4 sm:p-6 flex-1 flex flex-col relative">
                <h3 className="text-xl font-black text-white mb-2 leading-tight">{animeDetails?.titleUa || animeDetails?.title || "Шукаємо..."}</h3>
                <p className="text-gray-300 text-sm font-medium leading-relaxed mb-4">
                  {displayDescription}
                </p>
                <div className="flex gap-2 mt-auto">
                  {user && animeDetails && (
                    <button onClick={saveToFavorites} className="flex-1 bg-white/10 hover:bg-white/20 border border-white/20 px-2 py-2.5 rounded-xl text-xs font-bold transition-all">🤍 Зберегти</button>
                  )}
                  {animeDetails && animeDetails.title && (
                    <a href={`https://anitube.in.ua/index.php?do=search&subaction=search&story=${encodeURIComponent(animeDetails.title)}`} target="_blank" rel="noopener noreferrer" className="flex-1 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 px-2 py-2.5 rounded-xl text-xs font-black transition-all text-center flex justify-center items-center shadow-[0_0_15px_rgba(239,68,68,0.3)]">▶ Дивитись</a>
                  )}
                </div>
              </div>
            </div>
          )}

          {!user && result && !isLoading && (
            <div className="bg-gradient-to-r from-purple-900/40 to-pink-900/40 border border-pink-500/30 backdrop-blur-md rounded-2xl p-6 text-center shadow-lg animate-in fade-in slide-in-from-bottom-4">
              <h3 className="text-lg font-bold text-white mb-2">Сподобалась знахідка? ⛩️</h3>
              <p className="text-gray-300 text-sm mb-5">
                Увійди через Google, щоб зберегти це аніме на майбутнє та розблокувати власне Сховище спогадів!
              </p>
              <button onClick={handleLogin} className="bg-white text-black px-6 py-2.5 rounded-full text-sm font-bold hover:bg-gray-200 transition-all shadow-[0_0_15px_rgba(255,255,255,0.2)]">Увійти через Google</button>
            </div>
          )}
        </div>

        {user && (
          <div className="w-full lg:w-5/12 flex flex-col bg-white/5 backdrop-blur-md rounded-[2rem] border border-white/10 overflow-hidden shadow-2xl h-[60vh] lg:h-auto">
            <div className="p-5 border-b border-white/10 bg-black/20 shrink-0 flex justify-between items-center">
               <h2 className="text-lg font-black text-white tracking-widest flex items-center gap-3">
                <span className="h-1.5 w-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"></span> 
                СХОВИЩЕ
              </h2>
              <span className="text-xs text-gray-400 font-bold bg-white/10 px-3 py-1 rounded-full">{favorites.length}</span>
            </div>
            
            {favorites.length > 0 ? (
              <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {favorites.map((fav) => (
                    <div key={fav.id} className="group relative">
                      <a href={fav.url} target="_blank" className="block bg-black/40 rounded-xl overflow-hidden border border-white/10 hover:border-pink-500 transition-all shadow-lg">
                        <div className="aspect-[3/4] overflow-hidden relative">
                          <img src={fav.image} className="w-full h-full object-cover group-hover:scale-110 opacity-90 transition-all duration-500" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                            <span onClick={(e) => { e.preventDefault(); window.open(`https://anitube.in.ua/index.php?do=search&subaction=search&story=${encodeURIComponent(fav.title)}`, '_blank'); }} className="text-[10px] font-bold text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded-md w-full text-center cursor-pointer shadow-lg">▶ Дивитись</span>
                          </div>
                        </div>
                        <div className="p-2.5">
                          <p className="text-[11px] font-bold truncate text-gray-200" title={fav.titleUa || fav.title}>{fav.titleUa || fav.title}</p>
                        </div>
                      </a>
                      <button onClick={(e) => removeFavorite(e, fav.id)} className="absolute -top-2 -right-2 w-6 h-6 bg-red-500/90 hover:bg-red-500 border border-white/20 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all text-xs z-10 shadow-lg">✕</button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-8">
                <span className="text-4xl mb-4 opacity-50">📭</span>
                <p className="text-sm font-medium text-center">Твоя колекція порожня.<br/>Згенеруй аніме та збережи його!</p>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}