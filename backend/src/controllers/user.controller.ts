import type { NextFunction, Request, Response } from "express";

import { getActiveUsers } from "../services/user.service.js";

export async function getUsers(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = typeof request.query.q === "string" ? request.query.q : undefined;
    const users = await getActiveUsers(query);
    response.status(200).json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
}
