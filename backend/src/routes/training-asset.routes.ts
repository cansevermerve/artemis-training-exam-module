import express, { Router } from "express";

import { uploadTrainingAsset } from "../controllers/training-asset.controller.js";
import { requireAdmin } from "../middleware/auth.js";
import { expressLimit, trainingAssetUploadLimitBytes } from "../utils/upload-limits.js";

const router = Router({ mergeParams: true });
const rawAsset = express.raw({ type: "*/*", limit: expressLimit(trainingAssetUploadLimitBytes()) });
router.post("/:assetType", requireAdmin, rawAsset, uploadTrainingAsset);
export default router;
