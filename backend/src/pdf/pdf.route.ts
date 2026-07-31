import { Router } from "express";

import { requireAdmin } from "../middleware/auth.js";
import { generateExamPdfController } from "./pdf.controller.js";
import { generateParticipantAnswerPdfController } from "./participant-answer-pdf.controller.js";

const router = Router();
router.use(requireAdmin);
router.get("/training/:trainingId/exam", generateExamPdfController);
router.get(
  "/attempt/:attemptId/participant-answers",
  generateParticipantAnswerPdfController
);
export default router;
