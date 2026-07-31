import { getPrisma, type PrismaClientLike } from "../lib/prisma.js";
import { HttpError } from "../utils/http-error.js";

export type TrainingContentType = "VIDEO" | "PDF" | "IMAGE" | "LINK";
export interface CreateTrainingContentInput {
  type: TrainingContentType;
  title: string;
  fileUrl?: string;
  externalUrl?: string;
  order: number;
  isRequired?: boolean;
  durationSeconds?: number;
}

function validateUrl(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    return url.toString();
  } catch {
    throw new HttpError(400, "Harici bağlantı geçerli bir HTTP/HTTPS adresi olmalıdır.");
  }
}

function documentIdFromUrl(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/^\/documents\/([^/]+)\/preview$/);
  if (!match) {
    throw new HttpError(400, "Dosya içeriği asset upload endpoint'i üzerinden yüklenmelidir.");
  }
  return match[1];
}

function validateContent(input: CreateTrainingContentInput) {
  if (!["VIDEO", "PDF", "IMAGE", "LINK"].includes(input.type)) {
    throw new HttpError(400, "Geçersiz eğitim içeriği tipi.");
  }
  const title = input.title?.trim();
  if (!title) throw new HttpError(400, "İçerik başlığı zorunludur.");
  if (!Number.isInteger(input.order) || input.order < 1 || input.order > 10_000) {
    throw new HttpError(400, "İçerik sırası 1-10000 aralığında tam sayı olmalıdır.");
  }
  const externalUrl = validateUrl(input.externalUrl);
  const fileUrl = input.fileUrl?.trim() || null;
  if (input.type === "LINK" && !externalUrl) {
    throw new HttpError(400, "LINK içeriğinde externalUrl zorunludur.");
  }
  if (input.type !== "LINK" && !fileUrl) {
    throw new HttpError(400, "Dosya içeriği asset upload endpoint'i üzerinden yüklenmelidir.");
  }
  const documentId = input.type === "LINK" ? null : documentIdFromUrl(fileUrl);
  if (
    input.type === "VIDEO" &&
    (!Number.isInteger(input.durationSeconds) || (input.durationSeconds ?? 0) < 1 || (input.durationSeconds ?? 0) > 86_400)
  ) {
    throw new HttpError(400, "Video süresi 1-86400 aralığında tam sayı olmalıdır.");
  }
  return {
    type: input.type,
    title,
    fileUrl: input.type === "LINK" ? null : fileUrl,
    externalUrl: input.type === "LINK" ? externalUrl : null,
    order: input.order,
    isRequired: input.isRequired ?? true,
    durationSeconds: input.type === "VIDEO" ? input.durationSeconds : null,
    documentId,
  };
}

export async function getContentsByTrainingId(trainingId: string) {
  const prisma = await getPrisma();
  return prisma.trainingContent.findMany({
    where: { trainingId },
    orderBy: { order: "asc" },
  });
}

export async function createTrainingContent(
  trainingId: string,
  input: CreateTrainingContentInput
) {
  const prisma = await getPrisma();
  const content = validateContent(input);

  return prisma.$transaction(async (tx: PrismaClientLike) => {
    const training = await tx.training.findUnique({
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
    if (
      training.assignments.some(
        (item: { startedAt: Date | null; contentProgress: unknown[]; attempts: unknown[] }) =>
          item.startedAt || item.contentProgress.length || item.attempts.length
      )
    ) {
      throw new HttpError(409, "Çalışan tarafından başlanmış eğitime içerik eklenemez.");
    }

    if (content.documentId) {
      const document = await tx.trainingDocument.findFirst({
        where: {
          id: content.documentId,
          trainingId,
          type: "TRAINING_CONTENT",
        },
        select: { id: true, mimeType: true },
      });
      if (!document) {
        throw new HttpError(400, "İçerik dosyası bu eğitime ait geçerli bir belge değil.");
      }
      const expectedMime =
        content.type === "PDF"
          ? document.mimeType === "application/pdf"
          : content.type === "IMAGE"
            ? document.mimeType.startsWith("image/")
            : document.mimeType.startsWith("video/") || document.mimeType === "application/ogg";
      if (!expectedMime) {
        throw new HttpError(400, "İçerik tipi ile yüklenen dosyanın MIME tipi uyuşmuyor.");
      }
    }

    const { documentId: _documentId, ...data } = content;
    return tx.trainingContent.create({ data: { trainingId, ...data } });
  });
}
