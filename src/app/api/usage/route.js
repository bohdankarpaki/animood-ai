import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    
    const ip = req.headers.get("x-forwarded-for")?.split(',')[0] || "anonymous";
    const identifier = userId && userId !== "null" ? userId : ip;
    
    const today = new Date().toISOString().split('T')[0];
    const usageRef = doc(db, "usage", identifier);
    const usageSnap = await getDoc(usageRef);

    let count = 0;
    if (usageSnap.exists()) {
      const data = usageSnap.data();
      if (data.lastDate === today) {
        count = data.count || 0;
      }
    }

    return new Response(JSON.stringify({ 
      count, 
      limit: userId && userId !== "null" ? 15 : 3 
    }), { 
      status: 200, 
      headers: { "Content-Type": "application/json" } 
    });
  } catch (error) {
    return new Response("Error", { status: 500 });
  }
}