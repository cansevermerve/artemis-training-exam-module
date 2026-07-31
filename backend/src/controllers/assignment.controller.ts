import type { NextFunction, Request, Response } from "express";

import {
  createAssignments,
  getAssignmentById,
  getAssignmentsByTrainingId,
  getAssignmentsByUserId,
  syncAssignments,
  updateContentProgress,
} from "../services/assignment.service.js";
import { getStringParam } from "../utils/request.js";

export async function postAssignments(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const trainingId = getStringParam(request, "trainingId");
    const assignments = await createAssignments(trainingId, {
      userIds: request.body?.userIds,
      assignedById: request.auth?.userId ?? "",
      dueDate: request.body?.dueDate,
    });
    response.status(201).json({ success: true, data: assignments });
  } catch (error) { next(error); }
}

export async function putAssignments(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const trainingId = getStringParam(request, "trainingId");
    const assignments = await syncAssignments(trainingId, {
      userIds: request.body?.userIds,
      assignedById: request.auth?.userId ?? "",
      dueDate: request.body?.dueDate,
    });
    response.status(200).json({ success: true, data: assignments });
  } catch (error) { next(error); }
}

export async function getTrainingAssignments(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const includeCancelled = request.query.includeCancelled === "true";
    response.status(200).json({
      success: true,
      data: await getAssignmentsByTrainingId(
        getStringParam(request, "trainingId"),
        includeCancelled
      ),
    });
  } catch (error) { next(error); }
}
export async function getUserAssignments(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.status(200).json({ success: true, data: await getAssignmentsByUserId(getStringParam(request, "userId")) }); } catch (error) { next(error); }
}
export async function getAssignment(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const assignment = await getAssignmentById(getStringParam(request, "assignmentId"));
    if (!assignment) { response.status(404).json({ success: false, message: "Eğitim ataması bulunamadı." }); return; }
    response.status(200).json({ success: true, data: assignment });
  } catch (error) { next(error); }
}
export async function putContentProgress(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const assignment = await updateContentProgress(
      getStringParam(request, "assignmentId"),
      getStringParam(request, "contentId"),
      request.body ?? {}
    );
    response.status(200).json({ success: true, data: assignment });
  } catch (error) { next(error); }
}
