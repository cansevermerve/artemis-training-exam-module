import type { NextFunction, Request, Response } from "express";

import {
  correctAttemptResult,
  getAdminAttemptReview,
  getAttemptById,
  getAttemptResult,
  startAttempt,
  submitAttempt,
} from "../services/exam-attempt.service.js";
import { getStringParam } from "../utils/request.js";

export async function postAttempt(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const assignmentId = request.body?.assignmentId;
    if (typeof assignmentId !== "string" || !assignmentId.trim()) {
      response.status(400).json({
        success: false,
        message: "Assignment ID zorunludur.",
      });
      return;
    }

    const attempt = await startAttempt(assignmentId.trim());
    response.status(201).json({ success: true, data: attempt });
  } catch (error) {
    next(error);
  }
}

export async function getAttempt(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const attemptId = getStringParam(request, "attemptId");
    const attempt = await getAttemptById(attemptId);

    if (!attempt) {
      response.status(404).json({
        success: false,
        message: "Sınav denemesi bulunamadı.",
      });
      return;
    }

    response.status(200).json({ success: true, data: attempt });
  } catch (error) {
    next(error);
  }
}

export async function submitAttemptController(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const attemptId = getStringParam(request, "attemptId");
    const result = await submitAttempt(
      attemptId,
      request.body?.answers
    );
    response.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getAttemptResultController(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const attemptId = getStringParam(request, "attemptId");
    const result = await getAttemptResult(attemptId);

    if (!result) {
      response.status(404).json({
        success: false,
        message: "Sınav sonucu bulunamadı.",
      });
      return;
    }

    response.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
export async function getAdminAttemptReviewController(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const attemptId = getStringParam(request, "attemptId");
    const review = await getAdminAttemptReview(attemptId);
    if (!review) {
      response.status(404).json({
        success: false,
        message: "Sınav denemesi bulunamadı.",
      });
      return;
    }
    response.status(200).json({ success: true, data: review });
  } catch (error) {
    next(error);
  }
}

export async function correctAttemptResultController(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const attemptId = getStringParam(request, "attemptId");
    const editedById = request.auth?.userId;
    if (!editedById) {
      response.status(401).json({
        success: false,
        message: "Düzenleyen yönetici kimliği bulunamadı.",
      });
      return;
    }
    const review = await correctAttemptResult(
      attemptId,
      editedById,
      request.body?.reason,
      request.body?.answers
    );
    response.status(200).json({ success: true, data: review });
  } catch (error) {
    next(error);
  }
}

