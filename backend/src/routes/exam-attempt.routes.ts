import { Router } from "express";

import {
  correctAttemptResultController,
  getAdminAttemptReviewController,
  getAttempt,
  getAttemptResultController,
  postAttempt,
  submitAttemptController,
} from "../controllers/exam-attempt.controller.js";
import {
  requireAdmin,
  requireAttemptAccess,
  requireAttemptBodyAccess,
} from "../middleware/auth.js";

const router = Router();
router.get("/:attemptId/admin-review", requireAdmin, getAdminAttemptReviewController);
router.put("/:attemptId/admin-correction", requireAdmin, correctAttemptResultController);
router.post("/", requireAttemptBodyAccess, postAttempt);
router.get("/:attemptId", requireAttemptAccess(), getAttempt);
router.get("/:attemptId/result", requireAttemptAccess(), getAttemptResultController);
router.put("/:attemptId/submit", requireAttemptAccess(), submitAttemptController);
export default router;
