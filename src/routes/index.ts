import { Router } from "express";
import otakudesuRouter from "./otakudesu.js";
import kuramanimeRouter from "./kuramanime.js";
import oploverzRouter from "./oploverz.js";
import nimegamiRouter from "./nimegami.js";
import doronimeRouter from "./doronime.js";

const router = Router();

router.use("/otakudesu", otakudesuRouter);
router.use("/kuramanime", kuramanimeRouter);
router.use("/oploverz", oploverzRouter);
router.use("/nimegami", nimegamiRouter);
router.use("/doronime", doronimeRouter);

export default router;
