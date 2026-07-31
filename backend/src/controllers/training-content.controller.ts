import type { NextFunction, Request, Response } from "express";

import {
  createTrainingContent,
  getContentsByTrainingId,
  type CreateTrainingContentInput,
} from "../services/training-content.service.js";
import { getStringParam } from "../utils/request.js";

export async function getTrainingContents(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const trainingId = getStringParam(request, "trainingId");
    const contents = await getContentsByTrainingId(trainingId);
    response.status(200).json({ success: true, data: contents });
  } catch (error) {
    next(error);
  }
}

export async function postTrainingContent(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const trainingId = getStringParam(request, "trainingId");
    const content = await createTrainingContent(
      trainingId,
      request.body as CreateTrainingContentInput
    );
    response.status(201).json({ success: true, data: content });
  } catch (error) {
    next(error);
  }
}
