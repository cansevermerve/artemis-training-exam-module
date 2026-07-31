import express, { Router } from "express";

import {
  downloadDocument,
  getParticipantTrainingFileController,
  getTrainingDocumentsController,
  previewDocument,
  uploadEmployeeDocument,
  uploadOsgbCertificate,
  uploadSignedAttendanceForm,
} from "../controllers/document.controller.js";
import {
  requireAdmin,
  requireDocumentAccess,
} from "../middleware/auth.js";
import { documentUploadLimitBytes, expressLimit } from "../utils/upload-limits.js";

const router = Router();
const rawDocumentBody = express.raw({ type: "*/*", limit: expressLimit(documentUploadLimitBytes()) });

router.get(
  "/trainings/:trainingId/documents",
  requireAdmin,
  getTrainingDocumentsController
);
router.post(
  "/trainings/:trainingId/documents/signed-attendance",
  requireAdmin,
  rawDocumentBody,
  uploadSignedAttendanceForm
);
router.get(
  "/trainings/:trainingId/participants/:employeeId/file",
  requireAdmin,
  getParticipantTrainingFileController
);
router.post(
  "/employees/:employeeId/documents",
  requireAdmin,
  rawDocumentBody,
  uploadEmployeeDocument
);
router.post(
  "/employees/:employeeId/osgb-certificates",
  requireAdmin,
  rawDocumentBody,
  uploadOsgbCertificate
);
router.get("/documents/:documentId/preview", requireDocumentAccess(), previewDocument);
router.get("/documents/:documentId/download", requireDocumentAccess(), downloadDocument);
export default router;
