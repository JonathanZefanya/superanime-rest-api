import app from "./app.js";
import { appConfig } from "./config/index.js";
import { isSupabaseReady } from "./lib/supabase.js";

const PORT = appConfig.port;

if (process.env.NODE_ENV !== "vercel") {
	app.listen(PORT, () => {
		console.log(`🚀 superanime API running at http://localhost:${PORT}`);
		console.log(`   Sources:`);
		console.log(`   ➜  http://localhost:${PORT}/otakudesu`);
		console.log(`   ➜  http://localhost:${PORT}/kuramanime`);
		console.log(`   ➜  http://localhost:${PORT}/oploverz`);
		console.log(`   ➜  http://localhost:${PORT}/nimegami`);
		console.log(`   ➜  http://localhost:${PORT}/ylnime`);
		console.log(`   ➜  http://localhost:${PORT}/nontonanimeid`);
		if (isSupabaseReady()) {
			console.log(`   📦 Database: Supabase connected`);
			console.log(`   🔄 Sync:    POST /sync/:source/:type`);
			console.log(`   📋 Query:   GET  /db/anime`);
		} else {
			console.log(`   📦 Database: not configured (set SUPABASE_URL + SUPABASE_ANON_KEY)`);
		}
	});
}

export default app;
