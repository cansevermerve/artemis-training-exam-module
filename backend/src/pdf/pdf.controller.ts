import type { NextFunction, Request, Response } from "express";

import { getPrisma } from "../lib/prisma.js";
import { getDocumentAbsolutePath, registerGeneratedDocument } from "../services/document.service.js";
import { HttpError } from "../utils/http-error.js";
import { getStringParam } from "../utils/request.js";
import {
  generateExamPdf,
  type ExamPdfTraining,
} from "./exam-pdf.service.js";

async function resolveQuestionImage(value: string | null): Promise<string | null> {
  const match = value?.match(/^\/documents\/([^/]+)\/preview$/);
  if (!match) return value;
  return getDocumentAbsolutePath(match[1]);
}

export async function generateExamPdfController(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const trainingId = getStringParam(request, "trainingId");
    const prisma = await getPrisma();
    const training = await prisma.training.findUnique({
      where: { id: trainingId },
      include: {
        questions: {
          orderBy: { order: "asc" },
          include: { options: { orderBy: { order: "asc" } } },
        },
      },
    });

    if (!training) {
      throw new HttpError(404, "Eğitim bulunamadı.");
    }

    if (!training.hasExam || training.questions.length === 0) {
      throw new HttpError(409, "Bu eğitim için üretilecek sınav bulunmuyor.");
    }

    const pdfInput: ExamPdfTraining = {
      id: training.id,
      title: training.title,
      examDurationMinutes: training.examDurationMinutes,
      passingScore: training.passingScore,
      questions: await Promise.all(training.questions.map(async (question: any) => ({
        id: question.id,
        text: question.text,
        order: question.order,
        imageUrl: await resolveQuestionImage(question.imageUrl),
        options: question.options.map((option: any) => ({
          id: option.id,
          text: option.text,
          order: option.order,
        })),
      }))),
    };

    const pdfBuffer = Buffer.from(await generateExamPdf(pdfInput));
    const fileName = `exam-${trainingId}.pdf`;
    const document = await registerGeneratedDocument({
      trainingId,
      uploadedById: request.auth?.userId ?? null,
      type: "BLANK_EXAM",
      status: "ARCHIVED",
      title: `${training.title} Boş Sınavı`,
      originalName: fileName,
      mimeType: "application/pdf",
      buffer: pdfBuffer,
    });

    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );
    response.setHeader("X-Document-Id", document.id);
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.status(200).send(pdfBuffer);
  } catch (error) {
    next(error);
  }
}
