import type { NextFunction, Request, Response } from "express";

import { getPrisma } from "../lib/prisma.js";
import { findActiveUserByEmail } from "../services/user.service.js";
import { HttpError } from "../utils/http-error.js";

export interface AuthContext {
  userId: string;
  role: string | null;
  isAdmin: boolean;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

const DEFAULT_ADMIN_ROLES = [
  "ADMIN",
  "SUPER_ADMIN",
  "IK",
  "HR",
  "HUMAN_RESOURCES",
  "YONETICI",
  "MANAGER",
];

function normalizeRole(value: string | null | undefined): string {
  return String(value ?? "").trim().toLocaleUpperCase("tr-TR");
}

function getRouteParam(request: Request, name: string): string {
  const value = request.params[name];
  return (Array.isArray(value) ? value[0] : value ?? "").trim();
}

function configuredAdminRoles(): Set<string> {
  const values = process.env.ADMIN_ROLES?.split(",") ?? DEFAULT_ADMIN_ROLES;
  return new Set(values.map(normalizeRole).filter(Boolean));
}

async function resolveAuth(request: Request): Promise<AuthContext> {
  if (request.auth) return request.auth;

  const identityHeader =
    process.env.AUTH_USER_ID_HEADER?.trim().toLowerCase() || "x-user-id";
  const trustedHeaderEnabled =
    process.env.NODE_ENV !== "production" ||
    process.env.TRUST_IDENTITY_HEADER?.trim().toLowerCase() === "true";

  if (!trustedHeaderEnabled) {
    throw new HttpError(
      503,
      "Üretim ortamında kurum kimlik middleware'i request.auth sağlamalı veya güvenilir gateway için TRUST_IDENTITY_HEADER=true yapılandırılmalıdır."
    );
  }

  const emailHeader =
    process.env.AUTH_USER_EMAIL_HEADER?.trim().toLowerCase() || "x-user-email";
  const userId = request.header(identityHeader)?.trim();
  const userEmail = request.header(emailHeader)?.trim();

  if (!userId && !userEmail) {
    throw new HttpError(
      401,
      `Kimlik doğrulaması için ${identityHeader} veya ${emailHeader} header'ı zorunludur.`
    );
  }

  const prisma = await getPrisma();
  const user = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, isActive: true, email: true },
      })
    : await findActiveUserByEmail(userEmail as string);

  if (!user || !user.isActive) {
    throw new HttpError(401, "Kullanıcı bulunamadı veya pasif durumda.");
  }

  const role = normalizeRole(user.role) || null;
  const auth: AuthContext = {
    userId: user.id,
    role,
    isAdmin: role ? configuredAdminRoles().has(role) : false,
  };
  request.auth = auth;
  return auth;
}

export async function requireAuthenticated(
  request: Request,
  _response: Response,
  next: NextFunction
): Promise<void> {
  try {
    await resolveAuth(request);
    next();
  } catch (error) {
    next(error);
  }
}

export async function requireAdmin(
  request: Request,
  _response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const auth = await resolveAuth(request);
    if (!auth.isAdmin) throw new HttpError(403, "Bu işlem için yönetici yetkisi gereklidir.");
    next();
  } catch (error) {
    next(error);
  }
}

export function requireUserAccess(paramName: string) {
  return async (request: Request, _response: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = await resolveAuth(request);
      const targetUserId = getRouteParam(request, paramName);
      if (!targetUserId) throw new HttpError(400, `Geçersiz ${paramName}.`);
      if (!auth.isAdmin && auth.userId !== targetUserId) {
        throw new HttpError(403, "Başka bir kullanıcının kaydına erişemezsiniz.");
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireAssignmentAccess(paramName = "assignmentId") {
  return async (request: Request, _response: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = await resolveAuth(request);
      if (auth.isAdmin) return next();
      const assignmentId = getRouteParam(request, paramName);
      if (!assignmentId) throw new HttpError(400, `Geçersiz ${paramName}.`);
      const prisma = await getPrisma();
      const assignment = await prisma.trainingAssignment.findUnique({
        where: { id: assignmentId },
        select: { userId: true },
      });
      if (!assignment) throw new HttpError(404, "Eğitim ataması bulunamadı.");
      if (assignment.userId !== auth.userId) {
        throw new HttpError(403, "Bu eğitim atamasına erişemezsiniz.");
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export async function requireAttemptBodyAccess(
  request: Request,
  _response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const auth = await resolveAuth(request);
    if (auth.isAdmin) return next();
    const assignmentId =
      typeof request.body?.assignmentId === "string" ? request.body.assignmentId.trim() : "";
    if (!assignmentId) throw new HttpError(400, "Assignment ID zorunludur.");
    const prisma = await getPrisma();
    const assignment = await prisma.trainingAssignment.findUnique({
      where: { id: assignmentId },
      select: { userId: true },
    });
    if (!assignment) throw new HttpError(404, "Eğitim ataması bulunamadı.");
    if (assignment.userId !== auth.userId) {
      throw new HttpError(403, "Bu eğitim atamasına erişemezsiniz.");
    }
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAttemptAccess(paramName = "attemptId") {
  return async (request: Request, _response: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = await resolveAuth(request);
      if (auth.isAdmin) return next();
      const attemptId = getRouteParam(request, paramName);
      if (!attemptId) throw new HttpError(400, `Geçersiz ${paramName}.`);
      const prisma = await getPrisma();
      const attempt = await prisma.examAttempt.findUnique({
        where: { id: attemptId },
        select: { assignment: { select: { userId: true } } },
      });
      if (!attempt) throw new HttpError(404, "Sınav denemesi bulunamadı.");
      if (attempt.assignment.userId !== auth.userId) {
        throw new HttpError(403, "Bu sınav denemesine erişemezsiniz.");
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireDocumentAccess(paramName = "documentId") {
  return async (request: Request, _response: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = await resolveAuth(request);
      if (auth.isAdmin) return next();
      const documentId = getRouteParam(request, paramName);
      if (!documentId) throw new HttpError(400, `Geçersiz ${paramName}.`);
      const prisma = await getPrisma();
      const document = await prisma.trainingDocument.findUnique({
        where: { id: documentId },
        select: {
          employeeId: true,
          trainingId: true,
          type: true,
          assignment: { select: { userId: true } },
          attempt: { select: { assignment: { select: { userId: true } } } },
        },
      });
      if (!document) throw new HttpError(404, "Belge bulunamadı.");
      const directlyOwned =
        document.employeeId === auth.userId ||
        document.assignment?.userId === auth.userId ||
        document.attempt?.assignment.userId === auth.userId;
      if (directlyOwned) return next();

      const sharedTypes = new Set(["TRAINING_COVER", "TRAINING_CONTENT", "QUESTION_IMAGE", "OPTION_IMAGE"]);
      if (!sharedTypes.has(document.type)) {
        throw new HttpError(403, "Bu belgeye erişemezsiniz.");
      }
      const assignment = await prisma.trainingAssignment.findFirst({
        where: { userId: auth.userId, trainingId: document.trainingId, cancelledAt: null },
        select: { id: true },
      });
      if (!assignment) throw new HttpError(403, "Bu eğitim belgesine erişemezsiniz.");
      next();
    } catch (error) {
      next(error);
    }
  };
}
