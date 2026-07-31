import "dotenv/config";

import cors from "cors";
import express from "express";

import { hasGeneratedPrismaClient } from "./lib/prisma.js";
import { HttpError } from "./utils/http-error.js";
import { readIntegerEnv } from "./utils/env.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import pdfRouter from "./pdf/pdf.route.js";
import adminExportRoutes from "./routes/admin-export.routes.js";
import assignmentDetailRoutes from "./routes/assignment-detail.routes.js";
import assignmentRoutes from "./routes/assignment.routes.js";
import attendancePdfRoutes from "./routes/attendancePdfRoutes.js";
import documentRoutes from "./routes/document.routes.js";
import examAnswerRoutes from "./routes/exam-answer.routes.js";
import examAttemptRoutes from "./routes/exam-attempt.routes.js";
import questionRoutes from "./routes/question.routes.js";
import trainingAssetRoutes from "./routes/training-asset.routes.js";
import trainingContentRoutes from "./routes/training-content.routes.js";
import trainingRoutes from "./routes/training.routes.js";
import userRoutes from "./routes/user.routes.js";

const app = express();
app.disable("x-powered-by");

const configuredOrigins = process.env.CORS_ORIGIN?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? [];
const isProduction = process.env.NODE_ENV === "production";
app.use(cors({
  origin(origin, callback) {
    const developmentFallback = !isProduction && configuredOrigins.length === 0;
    if (!origin || developmentFallback || configuredOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new HttpError(403, "CORS origin izin listesinde değil."));
  },
  credentials: true,
  exposedHeaders: ["Content-Disposition", "X-Document-Id"],
}));
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_request, response) => {
  response.json({
    success: true,
    databaseConfigured: Boolean(process.env.DATABASE_URL?.trim()),
    prismaClientGenerated: hasGeneratedPrismaClient(),
  });
});

app.use("/api/trainings", trainingRoutes);
app.use("/api/trainings/:trainingId/questions", questionRoutes);
app.use("/api/trainings/:trainingId/contents", trainingContentRoutes);
app.use("/api/trainings/:trainingId/assets", trainingAssetRoutes);
app.use("/api/trainings/:trainingId/assignments", assignmentRoutes);
app.use("/api/assignments", assignmentDetailRoutes);
app.use("/api/users", userRoutes);
app.use("/api/exam-attempts", examAttemptRoutes);
app.use("/api/exam-answers", examAnswerRoutes);
app.use("/api/pdf", pdfRouter);
app.use("/api/exports", adminExportRoutes);
app.use("/api/pdfs", attendancePdfRoutes);
app.use("/api", documentRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const port = readIntegerEnv("PORT", 3001, { min: 1, max: 65535 });
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
