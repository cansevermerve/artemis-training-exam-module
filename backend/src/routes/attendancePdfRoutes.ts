import { Router, type NextFunction, type Request, type Response } from "express";

import { getPrisma } from "../lib/prisma.js";
import { registerGeneratedDocument } from "../services/document.service.js";
import { HttpError } from "../utils/http-error.js";
import { requireAdmin } from "../middleware/auth.js";
import {
  generateAttendancePdf,
  type AttendancePdfInput,
  type AttendanceTemplateType,
} from "../pdf/attendancePdfService.js";

const router = Router();
router.use(requireAdmin);

router.get(
  "/attendance",
  async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const trainingId = String(request.query.trainingId ?? "").trim();
      if (!trainingId) {
        throw new HttpError(400, "trainingId query parametresi zorunludur.");
      }

      const rawTemplateType = String(request.query.templateType ?? "")
        .trim()
        .toUpperCase();
      if (
        rawTemplateType !== "ISG_BASIC" &&
        rawTemplateType !== "WORKING_AT_HEIGHT"
      ) {
        throw new HttpError(
          400,
          "templateType ISG_BASIC veya WORKING_AT_HEIGHT olmalıdır."
        );
      }
      const templateType = rawTemplateType as AttendanceTemplateType;

      const prisma = await getPrisma();
      const training = await prisma.training.findUnique({
        where: { id: trainingId },
        include: {
          assignments: {
            where: { cancelledAt: null },
            orderBy: { assignedAt: "asc" },
            include: {
              user: true,
              attempts: {
                where: { status: { not: "IN_PROGRESS" } },
                orderBy: { attemptNumber: "desc" },
                take: 1,
              },
            },
          },
        },
      });

      if (!training) {
        throw new HttpError(404, "Eğitim bulunamadı.");
      }
      if (!training.hasAttendanceForm) {
        throw new HttpError(409, "Bu eğitim için katılım formu akışı etkin değil.");
      }

      const organizationName =
        process.env.ORGANIZATION_NAME?.trim() ||
        "ARTEMİS ARITIM SAN. VE TİC. A.Ş.";
      const input: AttendancePdfInput = {
        templateType,
        trainingTitle: training.title,
        trainingTopic: training.description,
        trainingDate: training.trainingDate,
        trainingLocation: training.location,
        trainingFormat: training.trainingFormat,
        organizationName,
        durationMinutes: training.durationMinutes,
        documentTitle: training.title,
        participants: training.assignments.map((assignment: any) => ({
          fullName: String(
            assignment.user.name ?? assignment.user.email ?? "Çalışan"
          ).trim(),
          title: assignment.user.title,
          result: assignment.attempts[0]?.score ?? null,
        })),
      };

      const pdfBuffer = Buffer.from(await generateAttendancePdf(input));
      const fileName =
        templateType === "ISG_BASIC"
          ? `isg-egitim-katilim-${trainingId}.pdf`
          : `yuksekte-calisma-katilim-${trainingId}.pdf`;

      const document = await registerGeneratedDocument({
        trainingId,
        uploadedById: request.auth?.userId ?? null,
        type: "ATTENDANCE_FORM",
        status: "AWAITING_SIGNATURE",
        title: `${training.title} ${
          templateType === "ISG_BASIC"
            ? "İSG Katılım Tutanağı"
            : "Yüksekte Çalışma Katılım Tutanağı"
        }`,
        originalName: fileName,
        mimeType: "application/pdf",
        buffer: pdfBuffer,
      });

      response.setHeader("Content-Type", "application/pdf");
      response.setHeader(
        "Content-Disposition",
        `inline; filename="${fileName}"`
      );
      response.setHeader("X-Document-Id", document.id);
      response.setHeader("Cache-Control", "private, no-store");
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.status(200).send(pdfBuffer);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
