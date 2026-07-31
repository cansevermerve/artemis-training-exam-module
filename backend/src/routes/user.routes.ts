import { Router } from "express";

import { getUserAssignments } from "../controllers/assignment.controller.js";
import { getUsers } from "../controllers/user.controller.js";
import { requireAdmin, requireUserAccess } from "../middleware/auth.js";

const router = Router({ mergeParams: true });
router.get("/", requireAdmin, getUsers);
router.get("/:userId/assignments", requireUserAccess("userId"), getUserAssignments);
export default router;
