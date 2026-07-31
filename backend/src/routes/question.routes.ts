import { Router } from "express";

import {
  getTrainingQuestions,
  postQuestion,
  putQuestion,
  removeQuestion,
} from "../controllers/question.controller.js";
import { requireAdmin } from "../middleware/auth.js";

const router = Router({ mergeParams: true });
router.use(requireAdmin);
router.get("/", getTrainingQuestions);
router.post("/", postQuestion);
router.put("/:questionId", putQuestion);
router.delete("/:questionId", removeQuestion);
export default router;
