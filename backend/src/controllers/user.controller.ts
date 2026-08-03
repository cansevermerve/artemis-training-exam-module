import type { NextFunction, Request, Response } from "express";

import { getAssignmentsByUserId } from "../services/assignment.service.js";
import { getActiveUsers } from "../services/user.service.js";
import { readPagination } from "../utils/pagination.js";

export async function getUsers(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = typeof request.query.q === "string" ? request.query.q : undefined;
    const pagination = readPagination(request, { pageSize: 20, maximumPageSize: 100 });
    const users = await getActiveUsers({ query, ...pagination });
    response.status(200).json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
}

export async function getCurrentUserAssignments(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    response.status(200).json({
      success: true,
      data: await getAssignmentsByUserId(request.auth?.userId ?? ""),
    });
  } catch (error) {
    next(error);
  }
}
