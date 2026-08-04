import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getPrisma } from "../lib/prisma.js";
import { HttpError } from "../utils/http-error.js";
import {
  documentUploadLimitBytes,
  trainingAssetUploadLimitBytes,
} from "../utils/upload-limits.js";

export type TrainingDocumentType =
  | "BLANK_EXAM"
  | "PARTICIPANT_ANSWER"
  | "SIGNED_EXAM"
  | "ATTENDANCE_FORM"
  | "SIGNED_ATTENDANCE_FORM"
  | "OSGB_CERTIFICATE"
  | "TRAINING_COVER"
  | "TRAINING_CONTENT"
  | "QUESTION_IMAGE"
  | "OPTION_IMAGE"
  | "PARTICIPANT_LIST"
  | "RESULTS_REPORT"
  | "OTHER";

export type TrainingDocumentStatus =
  | "DRAFT"
  | "AWAITING_SIGNATURE"
  | "SIGNED"
  | "ARCHIVED";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendDirectory = path.resolve(currentDirectory, "../..");
const storageDirectory = path.resolve(
  process.env.DOCUMENT_STORAGE_DIR?.trim() ||
    path.join(backendDirectory, "storage", "documents")
);

const typeAliases: Record<string, TrainingDocumentType> = {
  "BOŞ SINAV": "BLANK_EXAM",
  "CEVAPLI SINAV": "PARTICIPANT_ANSWER",
  "İMZALI SINAV": "SIGNED_EXAM",
  "IMZALI SINAV": "SIGNED_EXAM",
  "KATILIM FORMU": "ATTENDANCE_FORM",
  "İMZALI KATILIM FORMU": "SIGNED_ATTENDANCE_FORM",
  "IMZALI KATILIM FORMU": "SIGNED_ATTENDANCE_FORM",
  "OSGB SERTİFİKASI": "OSGB_CERTIFICATE",
  "OSGB SERTIFIKASI": "OSGB_CERTIFICATE",
  "DİĞER": "OTHER",
  DIGER: "OTHER",
};

const allowedTypes: TrainingDocumentType[] = [
  "BLANK_EXAM",
  "PARTICIPANT_ANSWER",
  "SIGNED_EXAM",
  "ATTENDANCE_FORM",
  "SIGNED_ATTENDANCE_FORM",
  "OSGB_CERTIFICATE",
  "TRAINING_COVER",
  "TRAINING_CONTENT",
  "QUESTION_IMAGE",
  "OPTION_IMAGE",
  "PARTICIPANT_LIST",
  "RESULTS_REPORT",
  "OTHER",
];

const statusAliases: Record<string, TrainingDocumentStatus> = {
  TASLAK: "DRAFT",
  "İMZA BEKLİYOR": "AWAITING_SIGNATURE",
  "IMZA BEKLIYOR": "AWAITING_SIGNATURE",
  "İMZALANDI": "SIGNED",
  IMZALANDI: "SIGNED",
  "ARŞİVLENDİ": "ARCHIVED",
  ARSIVLENDI: "ARCHIVED",
};

export function normalizeDocumentType(value: string): TrainingDocumentType {
  const normalized = value.trim().toLocaleUpperCase("tr-TR");
  if (allowedTypes.includes(normalized as TrainingDocumentType)) {
    return normalized as TrainingDocumentType;
  }
  const alias = typeAliases[normalized];
  if (!alias) throw new HttpError(400, "Geçersiz belge türü.");
  return alias;
}

export function normalizeDocumentStatus(
  value: string | undefined
): TrainingDocumentStatus {
  if (!value) return "ARCHIVED";
  const normalized = value.trim().toLocaleUpperCase("tr-TR");
  const allowed: TrainingDocumentStatus[] = [
    "DRAFT",
    "AWAITING_SIGNATURE",
    "SIGNED",
    "ARCHIVED",
  ];
  if (allowed.includes(normalized as TrainingDocumentStatus)) {
    return normalized as TrainingDocumentStatus;
  }
  const alias = statusAliases[normalized];
  if (!alias) throw new HttpError(400, "Geçersiz belge durumu.");
  return alias;
}

function sanitizeFilename(value: string): string {
  const basename = path.basename(value).trim() || "document.bin";
  return basename
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^a-zA-Z0-9._\-ğüşöçıİĞÜŞÖÇ]+/g, "-")
    .slice(0, 180) || "document.bin";
}

function parseDocumentDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(400, "Belge tarihi geçerli bir tarih olmalıdır.");
  }
  return parsed;
}

function absoluteStoragePath(filePath: string): string {
  const absolutePath = path.resolve(backendDirectory, filePath);
  const relative = path.relative(storageDirectory, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new HttpError(500, "Belge depolama yolu güvenli değil.");
  }
  return absolutePath;
}

async function persistBuffer(buffer: Buffer, originalName: string) {
  await mkdir(storageDirectory, { recursive: true });
  const safeName = sanitizeFilename(originalName);
  const extension = path.extname(safeName).slice(0, 12).toLowerCase();
  const storedName = `${randomUUID()}${extension}`;
  const absolutePath = path.join(storageDirectory, storedName);
  await writeFile(absolutePath, buffer, { flag: "wx" });
  return {
    storedName,
    filePath: path.relative(backendDirectory, absolutePath).replaceAll(path.sep, "/"),
    checksumSha256: createHash("sha256").update(buffer).digest("hex"),
  };
}

export interface SaveDocumentInput {
  employeeId?: string | null;
  trainingId: string;
  assignmentId?: string | null;
  attemptId?: string | null;
  uploadedById?: string | null;
  type: TrainingDocumentType;
  status?: TrainingDocumentStatus;
  title: string;
  originalName: string;
  mimeType: string;
  documentDate?: string;
  isGenerated?: boolean;
  buffer: Buffer;
}

async function validateRelations(input: SaveDocumentInput) {
  const prisma = await getPrisma();
  const training = await prisma.training.findUnique({
    where: { id: input.trainingId },
    select: { id: true },
  });
  if (!training) throw new HttpError(404, "Belgenin bağlanacağı eğitim bulunamadı.");

  if (input.employeeId) {
    const employee = await prisma.user.findUnique({
      where: { id: input.employeeId },
      select: { id: true },
    });
    if (!employee) throw new HttpError(404, "Belgenin bağlanacağı çalışan bulunamadı.");
  }

  if (input.uploadedById) {
    const uploader = await prisma.user.findUnique({
      where: { id: input.uploadedById },
      select: { id: true },
    });
    if (!uploader) throw new HttpError(404, "Belgeyi yükleyen kullanıcı bulunamadı.");
  }

  let assignment: { trainingId: string; userId: string } | null = null;
  if (input.assignmentId) {
    assignment = await prisma.trainingAssignment.findUnique({
      where: { id: input.assignmentId },
      select: { trainingId: true, userId: true },
    });
    if (!assignment) throw new HttpError(404, "Belgenin bağlanacağı atama bulunamadı.");
    if (
      assignment.trainingId !== input.trainingId ||
      (input.employeeId && assignment.userId !== input.employeeId)
    ) {
      throw new HttpError(400, "Atama, çalışan ve eğitim bilgileri uyuşmuyor.");
    }
  }

  if (input.attemptId) {
    const attempt = await prisma.examAttempt.findUnique({
      where: { id: input.attemptId },
      select: {
        assignmentId: true,
        assignment: { select: { trainingId: true, userId: true } },
      },
    });
    if (!attempt) throw new HttpError(404, "Belgenin bağlanacağı sınav denemesi bulunamadı.");
    if (
      attempt.assignment.trainingId !== input.trainingId ||
      (input.employeeId && attempt.assignment.userId !== input.employeeId) ||
      (input.assignmentId && attempt.assignmentId !== input.assignmentId)
    ) {
      throw new HttpError(400, "Deneme, atama, çalışan ve eğitim bilgileri uyuşmuyor.");
    }
  }
}

function limitForType(type: TrainingDocumentType): number {
  return type === "TRAINING_CONTENT"
    ? trainingAssetUploadLimitBytes()
    : documentUploadLimitBytes();
}

export async function saveDocument(input: SaveDocumentInput) {
  if (!Buffer.isBuffer(input.buffer) || input.buffer.length === 0) {
    throw new HttpError(400, "Yüklenecek dosya boş olamaz.");
  }
  const maxBytes = limitForType(input.type);
  if (input.buffer.length > maxBytes) {
    throw new HttpError(
      413,
      `Dosya boyutu ${Math.floor(maxBytes / 1024 / 1024)} MB sınırını aşıyor.`
    );
  }
  await validateRelations(input);
  const prisma = await getPrisma();
  const stored = await persistBuffer(input.buffer, input.originalName);
  try {
    return await prisma.trainingDocument.create({
      data: {
        employeeId: input.employeeId || null,
        trainingId: input.trainingId,
        assignmentId: input.assignmentId || null,
        attemptId: input.attemptId || null,
        uploadedById: input.uploadedById || null,
        type: input.type,
        status: input.status ?? "ARCHIVED",
        title: input.title.trim() || sanitizeFilename(input.originalName),
        originalName: sanitizeFilename(input.originalName),
        storedName: stored.storedName,
        mimeType: input.mimeType || "application/octet-stream",
        sizeBytes: input.buffer.length,
        filePath: stored.filePath,
        checksumSha256: stored.checksumSha256,
        documentDate: parseDocumentDate(input.documentDate),
        isGenerated: input.isGenerated ?? false,
      },
    });
  } catch (error) {
    await unlink(absoluteStoragePath(stored.filePath)).catch(() => undefined);
    throw error;
  }
}

export async function removeStoredDocumentFiles(filePaths: string[]): Promise<void> {
  await Promise.all(
    [...new Set(filePaths)].map(async (filePath) => {
      try {
        await unlink(absoluteStoragePath(filePath));
      } catch {
        // DB kaydı transaction içinde silindi; eksik veya erişilemeyen eski fiziksel
        // dosya sonuç düzeltme işlemini başarısız saydırmamalıdır.
      }
    })
  );
}

export async function deleteStoredDocument(documentId: string): Promise<void> {
  const prisma = await getPrisma();
  const document = await prisma.trainingDocument.findUnique({ where: { id: documentId } });
  if (!document) return;
  await prisma.trainingDocument.delete({ where: { id: documentId } });
  await unlink(absoluteStoragePath(document.filePath)).catch(() => undefined);
}

export async function deleteDocumentIfUnreferenced(documentId: string): Promise<void> {
  const prisma = await getPrisma();
  const document = await prisma.trainingDocument.findUnique({ where: { id: documentId } });
  if (!document) return;
  const url = `/documents/${documentId}/preview`;
  const [trainingCount, contentCount, questionCount, optionCount] = await Promise.all([
    prisma.training.count({ where: { coverImageUrl: url } }),
    prisma.trainingContent.count({ where: { fileUrl: url } }),
    prisma.question.count({ where: { imageUrl: url } }),
    prisma.questionOption.count({ where: { imageUrl: url } }),
  ]);
  if (trainingCount + contentCount + questionCount + optionCount === 0) {
    await deleteStoredDocument(documentId);
  }
}

export async function saveSignedAttendanceFormDocument(input: SaveDocumentInput) {
  const prisma = await getPrisma();
  const training = await prisma.training.findUnique({
    where: { id: input.trainingId },
    select: { id: true, hasAttendanceForm: true },
  });
  if (!training) throw new HttpError(404, "Eğitim bulunamadı.");
  if (!training.hasAttendanceForm) {
    throw new HttpError(409, "Bu eğitim için katılım formu akışı etkin değil.");
  }
  if (input.employeeId || input.assignmentId || input.attemptId) {
    throw new HttpError(400, "İmzalı katılım formu kişiye veya sınav denemesine bağlanamaz.");
  }
  return saveDocument({
    ...input,
    type: "SIGNED_ATTENDANCE_FORM",
    status: "SIGNED",
    isGenerated: false,
  });
}

export async function savePersonalEmployeeDocument(input: SaveDocumentInput) {
  if (!input.employeeId || !input.assignmentId) {
    throw new HttpError(400, "Kişiye özel belge için çalışan ve eğitim ataması zorunludur.");
  }
  const prisma = await getPrisma();
  const assignment = await prisma.trainingAssignment.findFirst({
    where: {
      id: input.assignmentId,
      userId: input.employeeId,
      trainingId: input.trainingId,
      cancelledAt: null,
    },
    select: { id: true },
  });
  if (!assignment) {
    throw new HttpError(409, "Eğitimden çıkarılmış veya uyuşmayan katılımcıya yeni belge yüklenemez.");
  }
  return saveDocument(input);
}

export async function saveSignedExamDocument(input: SaveDocumentInput) {
  if (!input.employeeId || !input.assignmentId || !input.attemptId) {
    throw new HttpError(400, "İmzalı sınav için çalışan, atama ve tamamlanmış deneme zorunludur.");
  }
  const prisma = await getPrisma();
  const attempt = await prisma.examAttempt.findFirst({
    where: {
      id: input.attemptId,
      assignmentId: input.assignmentId,
      status: { not: "IN_PROGRESS" },
      assignment: {
        userId: input.employeeId,
        trainingId: input.trainingId,
        cancelledAt: null,
      },
    },
    select: { id: true },
  });
  if (!attempt) {
    throw new HttpError(409, "İmzalı sınav yalnızca ilgili çalışanın tamamlanmış sınav denemesine bağlanabilir.");
  }
  return saveDocument({
    ...input,
    type: "SIGNED_EXAM",
    status: "SIGNED",
    isGenerated: false,
  });
}

export async function saveOsgbCertificate(input: SaveDocumentInput) {
  if (!input.employeeId) {
    throw new HttpError(400, "OSGB sertifikası için çalışan ID'si zorunludur.");
  }
  const prisma = await getPrisma();
  const training = await prisma.training.findUnique({
    where: { id: input.trainingId },
    select: { hasExam: true },
  });
  if (!training) throw new HttpError(404, "Eğitim bulunamadı.");
  if (!training.hasExam) {
    throw new HttpError(409, "Sınavı olmayan bir eğitim için OSGB sertifikası yüklenemez.");
  }
  const whereAttempt = {
    status: "PASSED",
    passed: true,
    assignment: { userId: input.employeeId, trainingId: input.trainingId, cancelledAt: null },
  };
  const attempt = input.attemptId
    ? await prisma.examAttempt.findFirst({
        where: { id: input.attemptId, ...whereAttempt },
        select: { id: true, assignmentId: true },
      })
    : await prisma.examAttempt.findFirst({
        where: whereAttempt,
        orderBy: { submittedAt: "desc" },
        select: { id: true, assignmentId: true },
      });
  if (!attempt) {
    throw new HttpError(
      409,
      "OSGB sertifikası yalnızca sınavı başarıyla tamamlayan katılımcıya yüklenebilir."
    );
  }
  if (input.assignmentId && input.assignmentId !== attempt.assignmentId) {
    throw new HttpError(400, "Sertifika ataması ile sınav denemesi uyuşmuyor.");
  }
  return saveDocument({
    ...input,
    type: "OSGB_CERTIFICATE",
    status: "ARCHIVED",
    attemptId: attempt.id,
    assignmentId: attempt.assignmentId,
    isGenerated: false,
  });
}

export async function registerGeneratedDocument(
  input: Omit<SaveDocumentInput, "isGenerated"> & { replaceExisting?: boolean }
) {
  const prisma = await getPrisma();
  if (input.replaceExisting !== false) {
    const checksum = createHash("sha256").update(input.buffer).digest("hex");
    const existing = await prisma.trainingDocument.findFirst({
      where: {
        employeeId: input.employeeId || null,
        trainingId: input.trainingId,
        assignmentId: input.assignmentId || null,
        attemptId: input.attemptId || null,
        type: input.type,
        isGenerated: true,
        checksumSha256: checksum,
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return existing;
  }
  return saveDocument({ ...input, isGenerated: true });
}

export async function getDocumentById(documentId: string) {
  const prisma = await getPrisma();
  return prisma.trainingDocument.findUnique({ where: { id: documentId } });
}

export async function getDocumentAbsolutePath(documentId: string): Promise<string> {
  const document = await getDocumentById(documentId);
  if (!document) throw new HttpError(404, "Belge bulunamadı.");
  return absoluteStoragePath(document.filePath);
}

export async function readDocumentFile(documentId: string) {
  const document = await getDocumentById(documentId);
  if (!document) throw new HttpError(404, "Belge bulunamadı.");
  try {
    const buffer = await readFile(absoluteStoragePath(document.filePath));
    return { document, buffer };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(404, "Belge dosyası depolama alanında bulunamadı.");
  }
}

export async function getTrainingCommonDocuments(trainingId: string) {
  const prisma = await getPrisma();
  const training = await prisma.training.findUnique({
    where: { id: trainingId },
    select: { id: true },
  });
  if (!training) throw new HttpError(404, "Eğitim bulunamadı.");
  return prisma.trainingDocument.findMany({
    where: {
      trainingId,
      employeeId: null,
      assignmentId: null,
      attemptId: null,
      type: { in: ["ATTENDANCE_FORM", "SIGNED_ATTENDANCE_FORM"] },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getParticipantTrainingFile(trainingId: string, employeeId: string) {
  const prisma = await getPrisma();
  const assignment = await prisma.trainingAssignment.findFirst({
    where: { trainingId, userId: employeeId },
    include: {
      user: {
        select: { id: true, name: true, email: true, title: true, department: true },
      },
      training: {
        select: {
          id: true,
          title: true,
          category: true,
          hasExam: true,
          passingScore: true,
        },
      },
      attempts: {
        orderBy: { attemptNumber: "desc" },
        select: {
          id: true,
          attemptNumber: true,
          status: true,
          score: true,
          passed: true,
          startedAt: true,
          submittedAt: true,
          correctCount: true,
          wrongCount: true,
          unansweredCount: true,
          answers: {
            orderBy: { question: { order: "asc" } },
            select: {
              id: true,
              isCorrect: true,
              earnedPoints: true,
              answeredAt: true,
              selectedOptions: { select: { optionId: true } },
              question: {
                select: {
                  id: true,
                  text: true,
                  points: true,
                  order: true,
                  options: {
                    orderBy: { order: "asc" },
                    select: { id: true, text: true, imageUrl: true, order: true, isCorrect: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!assignment) {
    throw new HttpError(404, "Çalışanın bu eğitim için katılımcı kaydı bulunamadı.");
  }
  const documents = await prisma.trainingDocument.findMany({
    where: {
      trainingId,
      employeeId,
      type: { in: ["PARTICIPANT_ANSWER", "SIGNED_EXAM", "OSGB_CERTIFICATE", "OTHER"] },
    },
    orderBy: { createdAt: "desc" },
  });
  return {
    employee: assignment.user,
    training: assignment.training,
    assignment: {
      id: assignment.id,
      trainingId: assignment.trainingId,
      userId: assignment.userId,
      status: assignment.status,
      assignedAt: assignment.assignedAt,
      dueDate: assignment.dueDate,
      contentCompletedAt: assignment.contentCompletedAt,
      completedAt: assignment.completedAt,
      cancelledAt: assignment.cancelledAt,
      cancellationReason: assignment.cancellationReason,
      attempts: assignment.attempts,
    },
    documents,
  };
}
