import type { NextFunction, Request, Response } from "express";

import { getPrisma } from "../lib/prisma.js";
import { getDocumentAbsolutePath, registerGeneratedDocument } from "../services/document.service.js";
import { HttpError } from "../utils/http-error.js";
import { getStringParam } from "../utils/request.js";
import {
  generateParticipantAnswerPdf,
  type ParticipantAnswerPdfInput,
} from "./participantAnswerPdfService.js";

async function resolveQuestionImage(value: string | null): Promise<string | null> {
  const match = value?.match(/^\/documents\/([^/]+)\/preview$/);
  if (!match) return value;
  return getDocumentAbsolutePath(match[1]);
}

export async function generateParticipantAnswerPdfController(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const attemptId = getStringParam(request, "attemptId");
    const prisma = await getPrisma();
    const attempt = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: {
        assignment: {
          include: {
            user: true,
            training: {
              include: {
                questions: {
                  orderBy: { order: "asc" },
                  include: { options: { orderBy: { order: "asc" } } },
                },
              },
            },
          },
        },
        answers: {
          include: { selectedOptions: true },
        },
      },
    });

    if (!attempt) {
      throw new HttpError(404, "Sınav denemesi bulunamadı.");
    }

    if (attempt.status === "IN_PROGRESS") {
      throw new HttpError(409, "Devam eden sınav için cevap PDF'i üretilemez.");
    }

    const input: ParticipantAnswerPdfInput = {
      attemptId,
      trainingTitle: attempt.assignment.training.title,
      participantName:
        attempt.assignment.user.name ?? attempt.assignment.user.email ?? "Çalışan",
      participantTitle: attempt.assignment.user.title,
      submittedAt: attempt.submittedAt,
      score: attempt.score,
      passed: attempt.passed,
      questions: await Promise.all(attempt.assignment.training.questions.map(async (question: any) => ({
        id: question.id,
        text: question.text,
        order: question.order,
        imageUrl: await resolveQuestionImage(question.imageUrl),
        options: question.options.map((option: any) => ({
          id: option.id,
          text: option.text,
          order: option.order,
          isCorrect: option.isCorrect,
        })),
      }))),
      answers: attempt.answers.map((answer: any) => ({
        questionId: answer.questionId,
        selectedOptionIds: answer.selectedOptions.map(
          (selectedOption: any) => selectedOption.optionId
        ),
        isCorrect: answer.isCorrect,
      })),
    };

    const pdfBuffer = Buffer.from(await generateParticipantAnswerPdf(input));
    const fileName = `participant-answers-${attemptId}.pdf`;
    const document = await registerGeneratedDocument({
      employeeId: attempt.assignment.userId,
      trainingId: attempt.assignment.trainingId,
      assignmentId: attempt.assignmentId,
      attemptId,
      uploadedById: request.auth?.userId ?? null,
      type: "PARTICIPANT_ANSWER",
      status: "ARCHIVED",
      title: `${attempt.assignment.training.title} ${attempt.attemptNumber}. Deneme Cevapları`,
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
