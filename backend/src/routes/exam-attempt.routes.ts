import { Router } from "express";

import {
  getAttempt,
  getAttemptResultController,
  postAttempt,
  submitAttemptController,
} from "../controllers/exam-attempt.controller.js";
import {
  requireAttemptAccess,
  requireAttemptBodyAccess,
} from "../middleware/auth.js";

const router = Router();
router.post("/", requireAttemptBodyAccess, postAttempt);
router.get("/:attemptId", requireAttemptAccess(), getAttempt);
router.get("/:attemptId/result", requireAttemptAccess(), getAttemptResultController);
router.put("/:attemptId/submit", requireAttemptAccess(), submitAttemptController);
export default router;
