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
import { readPagination } from "../utils/pagination.js";

function buildInput(request: Request): SaveTrainingInput {
  return {
    ...(request.body ?? {}),
    createdById: request.auth?.userId ?? "",
  } as SaveTrainingInput;
}

export async function getTrainings(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const query = typeof request.query.q === "string" ? request.query.q : undefined;
    const rawStatus = typeof request.query.status === "string"
      ? request.query.status.trim().toUpperCase()
      : "ALL";
    const status = ["ALL", "ACTIVE", "INACTIVE", "DRAFT"].includes(rawStatus)
      ? (rawStatus as "ALL" | "ACTIVE" | "INACTIVE" | "DRAFT")
      : "ALL";
    const pagination = readPagination(request, { pageSize: 10, maximumPageSize: 100 });
    response.status(200).json({
      success: true,
      data: await getAllTrainings({ query, status, ...pagination }),
    });
  } catch (error) {
    next(error);
  }
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
