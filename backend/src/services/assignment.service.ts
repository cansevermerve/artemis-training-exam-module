import { getPrisma, type PrismaClientLike } from "../lib/prisma.js";
import { readIntegerEnv } from "../utils/env.js";
import { HttpError, isPrismaKnownRequestError } from "../utils/http-error.js";
import { resolveActiveUserIdsByEmails } from "./user.service.js";

export interface CreateAssignmentsInput {
  userIds?: unknown[];
  userEmails?: unknown[];
  assignedById: string;
  dueDate?: string;
}

async function resolveAssignmentUserIds(input: CreateAssignmentsInput): Promise<string[]> {
  const rawIds = input.userIds ?? [];
  const rawEmails = input.userEmails ?? [];
  if (!Array.isArray(rawIds) || rawIds.some((id) => typeof id !== "string")) {
    throw new HttpError(400, "userIds string dizisi olmalıdır.");
  }
  if (!Array.isArray(rawEmails) || rawEmails.some((email) => typeof email !== "string")) {
    throw new HttpError(400, "userEmails string dizisi olmalıdır.");
  }

  const ids = (rawIds as string[]).map((id) => id.trim()).filter(Boolean);
  const emailIds = await resolveActiveUserIdsByEmails(rawEmails as string[]);
  return [...new Set([...ids, ...emailIds])];
}

function parseDueDate(value: string | undefined): Date | null {
  if (!value) return null;
  const dueDate = new Date(value);
  if (Number.isNaN(dueDate.getTime())) throw new HttpError(400, "Son tarih geçerli bir tarih olmalıdır.");
  return dueDate;
}

const assignmentInclude = {
  user: {
    select: { id: true, name: true, email: true, title: true, department: true, isActive: true },
  },
  training: {
    include: {
      contents: { orderBy: { order: "asc" } },
      documents: {
        where: { type: { in: ["TRAINING_COVER", "TRAINING_CONTENT"] } },
        orderBy: { createdAt: "desc" },
      },
    },
  },
  contentProgress: true,
  attempts: { orderBy: { attemptNumber: "asc" }, include: { documents: { orderBy: { createdAt: "desc" } } } },
  documents: { orderBy: { createdAt: "desc" } },
};

function targetContents(training: any): any[] {
  if (!training.hasTrainingContent) return [];
  if (training.mustCompleteContent) return training.contents.filter((item: any) => item.isRequired);
  return training.hasExam ? [] : training.contents;
}

export async function createAssignments(trainingId: string, input: CreateAssignmentsInput) {
  const prisma = await getPrisma();
  const userIds = await resolveAssignmentUserIds(input);
  const assignedById = input.assignedById?.trim();
  if (!userIds.length) throw new HttpError(400, "En az bir çalışan seçilmelidir.");
  if (!assignedById) throw new HttpError(400, "Atamayı yapan kullanıcı zorunludur.");
  const dueDate = parseDueDate(input.dueDate);
  if (dueDate && dueDate.getTime() < Date.now()) throw new HttpError(400, "Son tarih geçmişte olamaz.");

  try {
    return await prisma.$transaction(async (tx: PrismaClientLike) => {
      const training = await tx.training.findUnique({
        where: { id: trainingId },
        select: { id: true, isActive: true, isDraft: true, attemptLimit: true },
      });
      if (!training) throw new HttpError(404, "Eğitim bulunamadı.");
      if (training.isDraft || !training.isActive) {
        throw new HttpError(409, "Yalnızca yayınlanmış ve aktif eğitim atanabilir.");
      }
      const users = await tx.user.findMany({
        where: { id: { in: userIds }, isActive: true },
        select: { id: true },
      });
      if (users.length !== userIds.length) {
        throw new HttpError(400, "Çalışanlardan biri bulunamadı veya pasif durumda.");
      }

      const existing = await tx.trainingAssignment.findMany({
        where: { trainingId, userId: { in: userIds } },
        include: {
          contentProgress: { select: { id: true } },
          attempts: { select: { id: true, status: true } },
          documents: { select: { id: true } },
        },
      });
      const existingByUserId = new Map(existing.map((assignment: any) => [assignment.userId, assignment]));
      const now = new Date();

      for (const userId of userIds) {
        const assignment = existingByUserId.get(userId) as any;
        if (!assignment) {
          await tx.trainingAssignment.create({
            data: { trainingId, userId, assignedById, dueDate },
          });
          continue;
        }
        if (assignment.cancelledAt || assignment.status === "CANCELLED") {
          await tx.trainingAssignment.update({
            where: { id: assignment.id },
            data: {
              cancelledAt: null,
              cancellationReason: null,
              assignedById,
              assignedAt: now,
              dueDate,
              status: restoredAssignmentStatus(assignment, training.attemptLimit),
            },
          });
        }
      }

      return tx.trainingAssignment.findMany({
        where: { trainingId, userId: { in: userIds }, cancelledAt: null },
        orderBy: { assignedAt: "desc" },
        include: assignmentInclude,
      });
    });
  } catch (error) {
    if (isPrismaKnownRequestError(error, "P2003")) {
      throw new HttpError(400, "Eğitim, çalışan veya atayan kullanıcı bulunamadı.");
    }
    throw error;
  }
}


function restoredAssignmentStatus(assignment: any, attemptLimit: number): "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "FAILED" {
  if (assignment.completedAt || assignment.attempts.some((attempt: any) => attempt.status === "PASSED")) {
    return "COMPLETED";
  }
  const finishedAttempts = assignment.attempts.filter((attempt: any) => attempt.status !== "IN_PROGRESS");
  if (finishedAttempts.length >= attemptLimit && !assignment.attempts.some((attempt: any) => attempt.status === "IN_PROGRESS")) {
    return "FAILED";
  }
  if (assignment.startedAt || assignment.contentProgress.length || assignment.attempts.length) {
    return "IN_PROGRESS";
  }
  return "ASSIGNED";
}

export async function syncAssignments(trainingId: string, input: CreateAssignmentsInput) {
  const prisma = await getPrisma();
  const userIds = await resolveAssignmentUserIds(input);
  const assignedById = input.assignedById?.trim();
  if (!assignedById) throw new HttpError(400, "Atamayı yapan kullanıcı zorunludur.");
  const dueDate = parseDueDate(input.dueDate);
  if (dueDate && dueDate.getTime() < Date.now()) throw new HttpError(400, "Son tarih geçmişte olamaz.");

  return prisma.$transaction(async (tx: PrismaClientLike) => {
    const training = await tx.training.findUnique({
      where: { id: trainingId },
      select: { id: true, isActive: true, isDraft: true, attemptLimit: true },
    });
    if (!training) throw new HttpError(404, "Eğitim bulunamadı.");
    if (training.isDraft || !training.isActive) {
      throw new HttpError(409, "Yalnızca yayınlanmış ve aktif eğitimin katılımcıları yönetilebilir.");
    }

    if (userIds.length) {
      const users = await tx.user.findMany({
        where: { id: { in: userIds }, isActive: true },
        select: { id: true },
      });
      if (users.length !== userIds.length) {
        throw new HttpError(400, "Çalışanlardan biri bulunamadı veya pasif durumda.");
      }
    }

    const existing = await tx.trainingAssignment.findMany({
      where: { trainingId },
      include: {
        contentProgress: { select: { id: true } },
        attempts: { select: { id: true, status: true } },
        documents: { select: { id: true } },
      },
    });
    const existingByUserId = new Map(existing.map((assignment: any) => [assignment.userId, assignment]));
    const selected = new Set(userIds);
    const now = new Date();

    for (const userId of userIds) {
      const assignment = existingByUserId.get(userId) as any;
      if (!assignment) {
        await tx.trainingAssignment.create({
          data: { trainingId, userId, assignedById, dueDate },
        });
        continue;
      }
      if (assignment.cancelledAt || assignment.status === "CANCELLED") {
        await tx.trainingAssignment.update({
          where: { id: assignment.id },
          data: {
            cancelledAt: null,
            cancellationReason: null,
            assignedById,
            assignedAt: now,
            dueDate,
            status: restoredAssignmentStatus(assignment, training.attemptLimit),
          },
        });
      }
    }

    for (const assignment of existing as any[]) {
      if (selected.has(assignment.userId) || assignment.cancelledAt || assignment.status === "CANCELLED") continue;
      const hasHistory = Boolean(
        assignment.startedAt ||
        assignment.completedAt ||
        assignment.contentProgress.length ||
        assignment.attempts.length ||
        assignment.documents.length
      );
      if (!hasHistory) {
        await tx.trainingAssignment.delete({ where: { id: assignment.id } });
      } else {
        await tx.trainingAssignment.update({
          where: { id: assignment.id },
          data: {
            cancelledAt: now,
            cancellationReason: "Katılımcıları Yönet ekranından eğitimden çıkarıldı.",
            status: "CANCELLED",
          },
        });
      }
    }

    return tx.trainingAssignment.findMany({
      where: { trainingId, cancelledAt: null },
      orderBy: { assignedAt: "desc" },
      include: assignmentInclude,
    });
  });
}

export async function getAssignmentsByTrainingId(
  trainingId: string,
  includeCancelled = false
) {
  const prisma = await getPrisma();
  return prisma.trainingAssignment.findMany({
    where: {
      trainingId,
      ...(includeCancelled ? {} : { cancelledAt: null }),
    },
    orderBy: [{ cancelledAt: "asc" }, { assignedAt: "desc" }],
    include: assignmentInclude,
  });
}

export async function getAssignmentsByUserId(userId: string) {
  const prisma = await getPrisma();
  return prisma.trainingAssignment.findMany({
    where: { userId, cancelledAt: null },
    orderBy: { assignedAt: "desc" },
    include: assignmentInclude,
  });
}

export async function getAssignmentById(assignmentId: string) {
  const prisma = await getPrisma();
  return prisma.trainingAssignment.findUnique({ where: { id: assignmentId }, include: assignmentInclude });
}

function finiteNonNegativeInteger(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new HttpError(400, `${label} negatif olmayan bir sayı olmalıdır.`);
  }
  return Math.floor(value);
}

export async function updateContentProgress(
  assignmentId: string,
  contentId: string,
  input: { isCompleted?: boolean; lastPositionSeconds?: number; watchedSeconds?: number }
) {
  const prisma = await getPrisma();
  const requestedPosition = finiteNonNegativeInteger(input.lastPositionSeconds, "İçerik konumu");
  const requestedWatched = finiteNonNegativeInteger(input.watchedSeconds, "İzlenme süresi");
  const minimumViewSeconds = readIntegerEnv("NON_VIDEO_MINIMUM_VIEW_SECONDS", 10, { min: 1, max: 3600 });
  const videoToleranceSeconds = readIntegerEnv("VIDEO_PROGRESS_TOLERANCE_SECONDS", 8, { min: 3, max: 120 });

  return prisma.$transaction(async (tx: PrismaClientLike) => {
    const assignment = await tx.trainingAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        training: { include: { contents: { orderBy: { order: "asc" } } } },
        contentProgress: true,
      },
    });
    if (!assignment) throw new HttpError(404, "Eğitim ataması bulunamadı.");
    if (assignment.cancelledAt || assignment.status === "CANCELLED") throw new HttpError(409, "İptal edilmiş atama güncellenemez.");
    if (assignment.dueDate && assignment.dueDate.getTime() < Date.now() && !assignment.completedAt) {
      await tx.trainingAssignment.update({ where: { id: assignmentId }, data: { status: "EXPIRED" } });
      throw new HttpError(409, "Eğitim için belirlenen son tarih geçti.");
    }
    const content = assignment.training.contents.find((item: any) => item.id === contentId);
    if (!content) throw new HttpError(404, "Eğitim içeriği bulunamadı.");
    const existing = assignment.contentProgress.find((item: any) => item.contentId === contentId);
    const now = new Date();
    const startedAt = existing?.startedAt ?? now;
    const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000));
    const previousWatched = existing?.watchedSeconds ?? 0;
    const previousPosition = existing?.lastPositionSeconds ?? 0;
    const watchedSeconds = Math.max(previousWatched, requestedWatched ?? previousWatched);
    const lastPositionSeconds = requestedPosition ?? previousPosition;

    if (content.type === "VIDEO") {
      const duration = content.durationSeconds;
      if (!duration || duration < 1) throw new HttpError(409, "Video süresi tanımlanmadan ilerleme kaydedilemez.");
      if (watchedSeconds > elapsedSeconds + videoToleranceSeconds) {
        throw new HttpError(409, "Video izlenme süresi gerçek geçen süreden hızlı ilerleyemez.");
      }
      if (lastPositionSeconds > duration + 2 || lastPositionSeconds > watchedSeconds + videoToleranceSeconds + 5) {
        throw new HttpError(409, "Video konumu doğrulanmış izlenme süresinin önüne geçemez.");
      }
    }

    let completed = Boolean(existing?.isCompleted);
    if (input.isCompleted && !completed) {
      if (content.type === "VIDEO") {
        const duration = content.durationSeconds as number;
        if (watchedSeconds < Math.ceil(duration * 0.9) || lastPositionSeconds < Math.ceil(duration * 0.85)) {
          throw new HttpError(409, "Video yeterli oranda izlenmeden tamamlanamaz.");
        }
      } else if (elapsedSeconds < minimumViewSeconds) {
        throw new HttpError(409, `İçerik en az ${minimumViewSeconds} saniye açık kalmadan tamamlanamaz.`);
      }
      completed = true;
    }

    await tx.trainingContentProgress.upsert({
      where: { assignmentId_contentId: { assignmentId, contentId } },
      create: {
        assignmentId,
        contentId,
        startedAt,
        completedAt: completed ? now : null,
        isCompleted: completed,
        lastPositionSeconds,
        watchedSeconds,
      },
      update: {
        startedAt,
        completedAt: completed ? existing?.completedAt ?? now : null,
        isCompleted: completed,
        lastPositionSeconds,
        watchedSeconds,
      },
    });

    const targets = targetContents(assignment.training);
    const completedTargetCount = targets.length
      ? await tx.trainingContentProgress.count({
          where: { assignmentId, contentId: { in: targets.map((item: any) => item.id) }, isCompleted: true },
        })
      : 0;
    const allTargetsCompleted = targets.length === 0 || completedTargetCount === targets.length;
    const completesAssignment = allTargetsCompleted && !assignment.training.hasExam;
    await tx.trainingAssignment.update({
      where: { id: assignmentId },
      data: {
        startedAt: assignment.startedAt ?? now,
        contentCompletedAt: allTargetsCompleted ? assignment.contentCompletedAt ?? now : null,
        completedAt: completesAssignment ? assignment.completedAt ?? now : assignment.completedAt,
        status: completesAssignment ? "COMPLETED" : assignment.status === "ASSIGNED" ? "IN_PROGRESS" : assignment.status,
      },
    });
    return tx.trainingAssignment.findUnique({ where: { id: assignmentId }, include: assignmentInclude });
  });
}
