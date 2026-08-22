import { Router } from "express";
import * as ctrl from "../controllers/nimegami.js";
import { serverCache, clientCache } from "../lib/cache.js";
import { autoSync } from "../middlewares/autoSync.js";

const router = Router();
router.use(clientCache(60));
router.use(autoSync("nimegami"));

router.get("/", ctrl.getRoutes);
router.get("/home", serverCache(10), ctrl.getHome);
router.get("/anime", serverCache(10), ctrl.getAnimeList);
router.get("/anime-list", serverCache(10), ctrl.getAnimeCollections);
router.get("/anime/:slug", serverCache(10), ctrl.getAnimeDetails);
router.get("/episode/:slug/:episode", serverCache(10), ctrl.getEpisodeDetails);
router.get("/search", serverCache(10), ctrl.searchAnimes);
router.get("/schedule", serverCache(10), ctrl.getSchedule);
router.get("/genre", serverCache(10), ctrl.getGenres);
router.get("/ongoing", serverCache(10), ctrl.getOngoing);
router.get("/genre/:genreId", serverCache(10), ctrl.getAnimesByGenre);

export default router;
