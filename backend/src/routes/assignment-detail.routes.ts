import { Router } from "express";

import {
  getAssignment,
  putContentProgress,
} from "../controllers/assignment.controller.js";
import { requireAssignmentAccess } from "../middleware/auth.js";

const router = Router();

router.get("/:assignmentId", requireAssignmentAccess(), getAssignment);
router.put(
  "/:assignmentId/contents/:contentId/progress",
  requireAssignmentAccess(),
  putContentProgress
);

export default router;
