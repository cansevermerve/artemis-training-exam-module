import { Router } from "express";

import {
  getAttemptAnswers,
  putAnswer,
} from "../controllers/exam-answer.controller.js";
import { requireAttemptAccess } from "../middleware/auth.js";

const router = Router({ mergeParams: true });
router.get("/:attemptId", requireAttemptAccess(), getAttemptAnswers);
router.put(
  "/:attemptId/questions/:questionId",
  requireAttemptAccess(),
  putAnswer
);
export default router;
