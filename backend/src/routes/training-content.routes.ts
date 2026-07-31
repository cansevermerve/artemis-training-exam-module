import { Router } from "express";

import {
  getTrainingContents,
  postTrainingContent,
} from "../controllers/training-content.controller.js";
import { requireAdmin } from "../middleware/auth.js";

const router = Router({ mergeParams: true });
router.use(requireAdmin);
router.get("/", getTrainingContents);
router.post("/", postTrainingContent);
export default router;
