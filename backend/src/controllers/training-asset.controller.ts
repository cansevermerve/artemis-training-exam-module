import type { NextFunction, Request, Response } from "express";

import { getPrisma, type PrismaClientLike } from "../lib/prisma.js";
import {
  deleteDocumentIfUnreferenced,
  saveDocument,
  type TrainingDocumentType,
} from "../services/document.service.js";
import { HttpError } from "../utils/http-error.js";
import { getOptionalHeader, getRequiredHeader, getStringParam } from "../utils/request.js";

const documentUrl = (id: string) => `/documents/${id}/preview`;

function decodeHeader(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

function bodyBuffer(request: Request): Buffer {
  if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
    throw new HttpError(400, "Yüklenecek dosya boş olamaz.");
  }
  return request.body;
}

function parsePositiveInt(value: string | undefined, fallback?: number): number | undefined {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new HttpError(400, "Sayısal header geçersiz.");
  return parsed;
}

function isPdf(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}
function isPng(buffer: Buffer): boolean {
  return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
}
function isJpeg(buffer: Buffer): boolean {
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}
function isWebp(buffer: Buffer): boolean {
  return buffer.length >= 12 && buffer.subarray(0,4).toString("ascii") === "RIFF" && buffer.subarray(8,12).toString("ascii") === "WEBP";
}
function isMp4(buffer: Buffer): boolean {
  return buffer.length >= 12 && buffer.subarray(4,8).toString("ascii") === "ftyp";
}
function isWebm(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]));
}
function isOgg(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.subarray(0,4).toString("ascii") === "OggS";
}

function validateAsset(assetType: string, mimeType: string, buffer: Buffer): void {
  if (assetType === "cover") {
    if (!["image/png", "image/jpeg", "image/webp"].includes(mimeType) || !(isPng(buffer) || isJpeg(buffer) || isWebp(buffer))) {
      throw new HttpError(400, "Kapak yalnızca geçerli PNG, JPEG veya WebP olabilir.");
    }
    return;
  }
  if (assetType === "question-image") {
    if (!["image/png", "image/jpeg"].includes(mimeType) || !(isPng(buffer) || isJpeg(buffer))) {
      throw new HttpError(400, "Soru görseli PDF uyumluluğu için yalnızca PNG veya JPEG olabilir.");
    }
    return;
  }
  const contentType = getContentKind(mimeType);
  if (contentType === "PDF" && !isPdf(buffer)) throw new HttpError(400, "Geçerli bir PDF dosyası yükleyin.");
  if (contentType === "IMAGE" && !(isPng(buffer) || isJpeg(buffer) || isWebp(buffer))) throw new HttpError(400, "Geçerli bir görsel dosyası yükleyin.");
  if (contentType === "VIDEO" && !(isMp4(buffer) || isWebm(buffer) || isOgg(buffer))) throw new HttpError(400, "Geçerli bir MP4, WebM veya Ogg video yükleyin.");
}

function getContentKind(mimeType: string): "VIDEO" | "PDF" | "IMAGE" {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.startsWith("image/")) return "IMAGE";
  if (["video/mp4", "video/webm", "video/ogg", "application/ogg"].includes(mimeType)) return "VIDEO";
  throw new HttpError(400, "İçerik dosyası PDF, görsel veya desteklenen video formatında olmalıdır.");
}

function documentIdFromUrl(value: string | null | undefined): string | null {
  return value?.match(/^\/documents\/([^/]+)\/preview$/)?.[1] ?? null;
}

async function assertAssetsUnlocked(trainingId: string, includeQuestions: boolean): Promise<void> {
  const prisma = await getPrisma();
  const training = await prisma.training.findUnique({
    where: { id: trainingId },
    select: {
      id: true,
      assignments: {
        select: {
          startedAt: true,
          contentProgress: { select: { id: true }, take: 1 },
          attempts: { select: { id: true }, take: 1 },
        },
      },
    },
  });
  if (!training) throw new HttpError(404, "Eğitim bulunamadı.");
  const started = training.assignments.some((item: any) => item.startedAt || item.contentProgress.length || item.attempts.length);
  if (started) {
    throw new HttpError(409, includeQuestions ? "Sınavı başlamış eğitimde soru görseli değiştirilemez." : "Çalışan tarafından başlanmış eğitimde içerik dosyası değiştirilemez.");
  }
}

export async function uploadTrainingAsset(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  let createdDocumentId: string | null = null;
  try {
    const trainingId = getStringParam(request, "trainingId");
    const assetType = getStringParam(request, "assetType");
    if (!["cover", "content", "question-image"].includes(assetType)) {
      throw new HttpError(404, "Geçersiz eğitim varlığı türü.");
    }
    await assertAssetsUnlocked(trainingId, assetType === "question-image");
    const buffer = bodyBuffer(request);
    const mimeType = (request.header("content-type") ?? "application/octet-stream").split(";")[0].trim().toLowerCase();
    validateAsset(assetType, mimeType, buffer);
    const originalName = decodeHeader(getRequiredHeader(request, "x-file-name"));
    const title = decodeHeader(getOptionalHeader(request, "x-document-title") ?? originalName);
    const documentType: TrainingDocumentType = assetType === "cover" ? "TRAINING_COVER" : assetType === "content" ? "TRAINING_CONTENT" : "QUESTION_IMAGE";
    const document = await saveDocument({
      trainingId,
      uploadedById: request.auth?.userId ?? null,
      type: documentType,
      status: "ARCHIVED",
      title,
      originalName,
      mimeType,
      buffer,
    });
    createdDocumentId = document.id;
    const url = documentUrl(document.id);
    const prisma = await getPrisma();
    let data: unknown;
    let oldDocumentId: string | null = null;

    if (assetType === "cover") {
      const previous = await prisma.training.findUnique({ where: { id: trainingId }, select: { coverImageUrl: true } });
      oldDocumentId = documentIdFromUrl(previous?.coverImageUrl);
      data = await prisma.training.update({ where: { id: trainingId }, data: { coverImageUrl: url } });
    } else if (assetType === "question-image") {
      const questionId = getRequiredHeader(request, "x-question-id");
      const question = await prisma.question.findFirst({ where: { id: questionId, trainingId }, select: { id: true, imageUrl: true } });
      if (!question) throw new HttpError(404, "Soru bu eğitime ait değil.");
      oldDocumentId = documentIdFromUrl(question.imageUrl);
      data = await prisma.question.update({ where: { id: questionId }, data: { imageUrl: url } });
    } else {
      const kind = getContentKind(mimeType);
      const contentId = getOptionalHeader(request, "x-content-id");
      const order = parsePositiveInt(getOptionalHeader(request, "x-content-order"), 1) ?? 1;
      const durationSeconds = parsePositiveInt(getOptionalHeader(request, "x-duration-seconds"));
      if (kind === "VIDEO" && (!durationSeconds || durationSeconds < 1)) {
        throw new HttpError(400, "Video süresi x-duration-seconds header'ı ile gönderilmelidir.");
      }
      const isRequired = getOptionalHeader(request, "x-content-required") !== "false";
      data = await prisma.$transaction(async (tx: PrismaClientLike) => {
        if (contentId) {
          const current = await tx.trainingContent.findFirst({ where: { id: contentId, trainingId } });
          if (!current) throw new HttpError(404, "İçerik bu eğitime ait değil.");
          oldDocumentId = documentIdFromUrl(current.fileUrl);
          return tx.trainingContent.update({
            where: { id: contentId },
            data: { type: kind, title, fileUrl: url, externalUrl: null, order, isRequired, durationSeconds: kind === "VIDEO" ? durationSeconds : null },
          });
        }
        return tx.trainingContent.create({
          data: { trainingId, type: kind, title, fileUrl: url, externalUrl: null, order, isRequired, durationSeconds: kind === "VIDEO" ? durationSeconds : null },
        });
      });
    }
    if (oldDocumentId && oldDocumentId !== document.id) {
      await deleteDocumentIfUnreferenced(oldDocumentId).catch(() => undefined);
    }
    response.status(201).json({ success: true, data: { document, url, entity: data } });
  } catch (error) {
    if (createdDocumentId) await deleteDocumentIfUnreferenced(createdDocumentId).catch(() => undefined);
    next(error);
  }
}
