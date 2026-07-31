import { Router } from "express";

import {
  exportParticipantsExcel,
  exportParticipantsPdf,
  exportResultsPdf,
} from "../controllers/admin-export.controller.js";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();
router.use(requireAdmin);
router.get("/trainings/:trainingId/participants.pdf", exportParticipantsPdf);
router.get("/trainings/:trainingId/participants.xls", exportParticipantsExcel);
router.get("/trainings/:trainingId/results.pdf", exportResultsPdf);
export default router;
