import { Router } from "express";

import {
  getTrainingAssignments,
  postAssignments,
  putAssignments,
} from "../controllers/assignment.controller.js";
import { requireAdmin } from "../middleware/auth.js";

const router = Router({ mergeParams: true });
router.use(requireAdmin);
router.get("/", getTrainingAssignments);
router.post("/", postAssignments);
router.put("/", putAssignments);
export default router;
