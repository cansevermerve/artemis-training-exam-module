import type { NextFunction, Request, Response } from "express";

import {
  createQuestion,
  deleteQuestion,
  getQuestionsByTrainingId,
  updateQuestion,
  type CreateQuestionInput,
} from "../services/question.service.js";
import { getStringParam } from "../utils/request.js";

export async function getTrainingQuestions(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const trainingId = getStringParam(request, "trainingId");
    const questions = await getQuestionsByTrainingId(trainingId);
    response.status(200).json({ success: true, data: questions });
  } catch (error) {
    next(error);
  }
}

export async function postQuestion(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const trainingId = getStringParam(request, "trainingId");
    const question = await createQuestion(
      trainingId,
      request.body as CreateQuestionInput
    );
    response.status(201).json({ success: true, data: question });
  } catch (error) {
    next(error);
  }
}

export async function putQuestion(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const trainingId = getStringParam(request, "trainingId");
    const questionId = getStringParam(request, "questionId");
    const question = await updateQuestion(
      trainingId,
      questionId,
      request.body as CreateQuestionInput
    );

    if (!question) {
      response.status(404).json({ success: false, message: "Soru bulunamadı." });
      return;
    }

    response.status(200).json({ success: true, data: question });
  } catch (error) {
    next(error);
  }
}

export async function removeQuestion(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const trainingId = getStringParam(request, "trainingId");
    const questionId = getStringParam(request, "questionId");
    const question = await deleteQuestion(trainingId, questionId);

    if (!question) {
      response.status(404).json({ success: false, message: "Soru bulunamadı." });
      return;
    }

    response.status(200).json({ success: true, data: question });
  } catch (error) {
    next(error);
  }
}
