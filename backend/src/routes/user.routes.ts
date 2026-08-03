import { Router } from "express";

import { getUserAssignments } from "../controllers/assignment.controller.js";
import { getCurrentUserAssignments, getUsers } from "../controllers/user.controller.js";
import { requireAdmin, requireAuthenticated, requireUserAccess } from "../middleware/auth.js";

const router = Router({ mergeParams: true });
router.get("/", requireAdmin, getUsers);
router.get("/me/assignments", requireAuthenticated, getCurrentUserAssignments);
router.get("/:userId/assignments", requireUserAccess("userId"), getUserAssignments);
export default router;
