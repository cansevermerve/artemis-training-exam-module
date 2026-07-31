import type { NextFunction, Request, Response } from "express";

import {
  createTraining,
  deleteTraining,
  getAllTrainings,
  getTrainingById,
  updateTraining,
  type SaveTrainingInput,
} from "../services/training.service.js";
import { getStringParam } from "../utils/request.js";

function buildInput(request: Request): SaveTrainingInput {
  return {
    ...(request.body ?? {}),
    createdById: request.auth?.userId ?? "",
  } as SaveTrainingInput;
}

export async function getTrainings(_request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.status(200).json({ success: true, data: await getAllTrainings() }); } catch (error) { next(error); }
}
export async function postTraining(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.status(201).json({ success: true, data: await createTraining(buildInput(request)) }); } catch (error) { next(error); }
}
export async function getTraining(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const training = await getTrainingById(getStringParam(request, "id"));
    if (!training) { response.status(404).json({ success: false, message: "Eğitim bulunamadı." }); return; }
    response.status(200).json({ success: true, data: training });
  } catch (error) { next(error); }
}
export async function putTraining(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.status(200).json({ success: true, data: await updateTraining(getStringParam(request, "id"), buildInput(request)) }); } catch (error) { next(error); }
}
export async function removeTraining(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const training = await deleteTraining(getStringParam(request, "id"));
    if (!training) { response.status(404).json({ success: false, message: "Eğitim bulunamadı." }); return; }
    response.status(200).json({ success: true, data: training });
  } catch (error) { next(error); }
}
