import { Router } from "express";
import * as ctrl from "../controllers/nontonanimeid.js";
import { serverCache, clientCache } from "../lib/cache.js";

const router = Router();
router.use(clientCache(60));

router.get("/", ctrl.getRoutes);
router.get("/latest", serverCache(10), ctrl.getLatest);
router.get("/ongoing", serverCache(10), ctrl.getOngoing);
router.get("/completed", serverCache(10), ctrl.getCompleted);
router.get("/schedule", serverCache(10), ctrl.getSchedule);
router.get("/anime-list", serverCache(10), ctrl.getAnimeCollections);
router.get("/genre", serverCache(10), ctrl.getGenreList);
router.get("/genres/:genreId", serverCache(10), ctrl.getAnimesByGenre);
router.get("/search", serverCache(10), ctrl.searchAnimes);
router.get("/anime/:slug", serverCache(10), ctrl.getAnimeDetails);
router.get("/episode/:slug", serverCache(10), ctrl.getEpisodeDetails);
router.get("/server/:serverId", serverCache(10), ctrl.getServerDetails);

export default router;
