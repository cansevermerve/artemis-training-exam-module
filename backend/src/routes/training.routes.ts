import { Router } from "express";
import {
  getTraining,
  getTrainings,
  postTraining,
  putTraining,
  removeTraining,
} from "../controllers/training.controller.js";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();
router.use(requireAdmin);
router.get("/", getTrainings);
router.get("/:id", getTraining);
router.post("/", postTraining);
router.put("/:id", putTraining);
router.delete("/:id", removeTraining);
export default router;
