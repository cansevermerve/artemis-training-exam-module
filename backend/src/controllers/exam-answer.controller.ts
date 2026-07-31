import type { NextFunction, Request, Response } from "express";

import { getAnswersByAttemptId, updateExamAnswer } from "../services/exam-answer.service.js";
import { getStringParam } from "../utils/request.js";

export async function getAttemptAnswers(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.status(200).json({ success: true, data: await getAnswersByAttemptId(getStringParam(request, "attemptId")) }); } catch (error) { next(error); }
}

export async function putAnswer(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const selectedOptionIds = Array.isArray(request.body?.selectedOptionIds)
      ? request.body.selectedOptionIds
      : typeof request.body?.selectedOptionId === "string"
        ? [request.body.selectedOptionId]
        : [];
    const answer = await updateExamAnswer(
      getStringParam(request, "attemptId"),
      getStringParam(request, "questionId"),
      selectedOptionIds
    );
    if (!answer) { response.status(404).json({ success: false, message: "Cevap kaydı veya soru bulunamadı." }); return; }
    response.status(200).json({ success: true, data: answer });
  } catch (error) { next(error); }
}
