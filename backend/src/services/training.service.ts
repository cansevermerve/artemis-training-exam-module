import { getPrisma, type PrismaClientLike } from "../lib/prisma.js";
import { deleteDocumentIfUnreferenced, deleteStoredDocument } from "./document.service.js";
import { HttpError, isPrismaKnownRequestError } from "../utils/http-error.js";
import { buildPaginatedResult } from "../utils/pagination.js";

export interface TrainingQuestionInput {
  id?: string;
  order: number;
  text: string;
  explanation?: string | null;
  type: "SINGLE" | "MULTIPLE" | "single" | "multiple";
  points: number;
  imageUrl?: string | null;
  options: Array<{
    id?: string;
    text?: string | null;
    imageUrl?: string | null;
    order?: number;
    isCorrect?: boolean;
  }>;
  correctOptionIndexes?: number[];
}

export interface TrainingContentInput {
  id?: string;
  type: "VIDEO" | "PDF" | "IMAGE" | "LINK";
  title: string;
  fileUrl?: string | null;
  externalUrl?: string | null;
  order: number;
  isRequired?: boolean;
  durationSeconds?: number | null;
}

export interface SaveTrainingInput {
  status?: "draft" | "published";
  title: string;
  description?: string | null;
  category: string;
  trainingKind?: string;
  trainingFormat?: string;
  date?: string | null;
  trainingDate?: string | null;
  startTime?: string | null;
  durationHours?: number;
  durationMinutes?: number;
  location?: string | null;
  isActive?: boolean;
  createdById: string;
  flow?: {
    hasTrainingContent?: boolean;
    mustCompleteContent?: boolean;
    hasExam?: boolean;
    hasAttendanceForm?: boolean;
  };
  hasTrainingContent?: boolean;
  mustCompleteContent?: boolean;
  hasExam?: boolean;
  hasAttendanceForm?: boolean;
  exam?: {
    passingScore?: number;
    attemptLimit?: number;
    durationMinutes?: number;
    shuffleQuestions?: boolean;
    shuffleOptions?: boolean;
    showCorrectAnswersAfterExam?: boolean;
    questions?: TrainingQuestionInput[];
  } | null;
  passingScore?: number;
  attemptLimit?: number;
  examDurationMinutes?: number;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  showCorrectAnswers?: boolean;
  contents?: TrainingContentInput[];
  questions?: TrainingQuestionInput[];
}

function hasOwn(value: object | null | undefined, key: string): boolean {
  return Boolean(value && Object.prototype.hasOwnProperty.call(value, key));
}

function documentIdFromUrl(value: string | null | undefined): string | null {
  return value?.match(/^\/documents\/([^/]+)\/preview$/)?.[1] ?? null;
}

function normalizeStoredDocumentUrl(
  value: string | null | undefined,
  label: string
): string | null {
  if (!value?.trim()) return null;
  const normalized = value.trim();
  if (!documentIdFromUrl(normalized)) {
    throw new HttpError(400, `${label} yalnızca belge upload endpoint'i üzerinden yüklenebilir.`);
  }
  return normalized;
}

function parseOptionalDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new HttpError(400, "Eğitim tarihi geçerli bir tarih olmalıdır.");
  return parsed;
}

function clampInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string
): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new HttpError(400, `${label} ${minimum}-${maximum} aralığında tam sayı olmalıdır.`);
  }
  return value;
}

function validateUniqueOrders(items: Array<{ order: number }>, label: string): void {
  if (new Set(items.map((item) => item.order)).size !== items.length) {
    throw new HttpError(400, `${label} sıra değerleri benzersiz olmalıdır.`);
  }
}

function normalizeQuestion(
  question: TrainingQuestionInput,
  allowPendingImageUploads: boolean
) {
  const type = question.type?.toUpperCase();
  if (type !== "SINGLE" && type !== "MULTIPLE") {
    throw new HttpError(400, "Soru tipi SINGLE veya MULTIPLE olmalıdır.");
  }
  const text = question.text?.trim();
  if (!text) throw new HttpError(400, "Soru metni boş bırakılamaz.");
  if (!Array.isArray(question.options) || question.options.length < 2) {
    throw new HttpError(400, "Her soruda en az iki seçenek olmalıdır.");
  }
  const correctIndexes = new Set(question.correctOptionIndexes ?? []);
  const options = question.options.map((option, index) => ({
    text: option.text?.trim() || null,
    imageUrl: normalizeStoredDocumentUrl(option.imageUrl, "Şık görseli"),
    order: clampInteger(option.order, index + 1, 1, 10000, "Seçenek sırası"),
    isCorrect: option.isCorrect ?? correctIndexes.has(index),
  }));
  if (!allowPendingImageUploads && options.some((option) => !option.text && !option.imageUrl)) {
    throw new HttpError(400, "Her şıkta metin veya görsel bulunmalıdır.");
  }
  validateUniqueOrders(options, "Seçenek");
  const normalizedTexts = options
    .map((option) => option.text?.toLocaleLowerCase("tr-TR") ?? null)
    .filter((value): value is string => Boolean(value));
  if (new Set(normalizedTexts).size !== normalizedTexts.length) {
    throw new HttpError(400, "Aynı soru içinde metin seçenekleri tekrar edemez.");
  }
  const correctCount = options.filter((option) => option.isCorrect).length;
  if (type === "SINGLE" && correctCount !== 1) {
    throw new HttpError(400, "Tek seçimli soruda tam olarak bir doğru seçenek olmalıdır.");
  }
  if (type === "MULTIPLE" && correctCount < 1) {
    throw new HttpError(400, "Çok seçimli soruda en az bir doğru seçenek olmalıdır.");
  }
  return {
    text,
    explanation: question.explanation?.trim() || null,
    type,
    points: clampInteger(question.points, 10, 1, 1000, "Soru puanı"),
    order: clampInteger(question.order, 1, 1, 10000, "Soru sırası"),
    imageUrl: normalizeStoredDocumentUrl(question.imageUrl, "Soru görseli"),
    options,
  };
}

function normalizeExternalUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    return url.toString();
  } catch {
    throw new HttpError(400, "Harici içerik bağlantısı geçerli bir HTTP/HTTPS adresi olmalıdır.");
  }
}

function normalizeContent(content: TrainingContentInput) {
  if (!["VIDEO", "PDF", "IMAGE", "LINK"].includes(content.type)) {
    throw new HttpError(400, "Geçersiz eğitim içeriği tipi.");
  }
  const title = content.title?.trim();
  if (!title) throw new HttpError(400, "İçerik başlığı zorunludur.");
  const fileUrl = content.fileUrl?.trim() || null;
  const externalUrl = normalizeExternalUrl(content.externalUrl);
  if (content.type === "LINK" && !externalUrl) {
    throw new HttpError(400, "LINK içeriğinde externalUrl zorunludur.");
  }
  if (content.type !== "LINK" && !fileUrl) {
    throw new HttpError(400, "Dosya içeriğinde fileUrl zorunludur.");
  }
  const durationSeconds = content.type === "VIDEO"
    ? clampInteger(content.durationSeconds ?? undefined, 0, 1, 86400, "Video süresi")
    : null;
  return {
    type: content.type,
    title,
    fileUrl: content.type === "LINK" ? null : fileUrl,
    externalUrl: content.type === "LINK" ? externalUrl : null,
    order: clampInteger(content.order, 1, 1, 10000, "İçerik sırası"),
    isRequired: content.isRequired ?? true,
    durationSeconds,
  };
}

function normalizeTrainingInput(input: SaveTrainingInput) {
  const isDraft = input.status !== "published";
  const title = input.title?.trim();
  const category = input.category?.trim() || (isDraft ? "Kategorisiz" : "");
  const createdById = input.createdById?.trim();
  if (!title || !category) throw new HttpError(400, "Eğitim adı ve kategori zorunludur.");
  if (!createdById) throw new HttpError(400, "Kimliği doğrulanmış oluşturucu zorunludur.");

  const flow = input.flow ?? {};
  const exam = input.exam ?? undefined;
  const hasTrainingContent = flow.hasTrainingContent ?? input.hasTrainingContent ?? true;
  const hasExam = flow.hasExam ?? input.hasExam ?? true;
  const hasAttendanceForm = flow.hasAttendanceForm ?? input.hasAttendanceForm ?? false;
  const durationTotal = input.durationHours !== undefined
    ? input.durationHours * 60 + (input.durationMinutes ?? 0)
    : input.durationMinutes;
  const questionsProvided = hasOwn(exam, "questions") || hasOwn(input, "questions");
  const contentsProvided = hasOwn(input, "contents");
  const rawQuestions = exam?.questions ?? input.questions ?? [];
  const questions = hasExam && questionsProvided ? rawQuestions.map((question) => normalizeQuestion(question, isDraft)) : [];
  const contents = hasTrainingContent && contentsProvided ? (input.contents ?? []).map(normalizeContent) : [];
  validateUniqueOrders(questions, "Soru");
  validateUniqueOrders(contents, "İçerik");

  const passingScore = clampInteger(exam?.passingScore ?? input.passingScore, 70, 0, 100, "Geçme puanı");
  return {
    isDraft,
    questionsProvided,
    contentsProvided,
    training: {
      title,
      description: input.description?.trim() || null,
      category,
      trainingKind: input.trainingKind?.trim() || "Zorunlu",
      trainingFormat: input.trainingFormat?.trim() || "Yüz Yüze",
      trainingDate: parseOptionalDate(input.trainingDate ?? input.date),
      startTime: input.startTime?.trim() || null,
      durationMinutes: clampInteger(durationTotal, 30, 1, 100000, "Eğitim süresi"),
      location: input.location?.trim() || null,
      isDraft,
      isActive: isDraft ? false : Boolean(input.isActive),
      hasTrainingContent,
      mustCompleteContent: hasTrainingContent && (flow.mustCompleteContent ?? input.mustCompleteContent ?? true),
      hasExam,
      hasAttendanceForm,
      passingScore,
      attemptLimit: clampInteger(exam?.attemptLimit ?? input.attemptLimit, 1, 1, 100, "Deneme limiti"),
      examDurationMinutes: clampInteger(exam?.durationMinutes ?? input.examDurationMinutes, 30, 1, 1440, "Sınav süresi"),
      shuffleQuestions: exam?.shuffleQuestions ?? input.shuffleQuestions ?? false,
      shuffleOptions: exam?.shuffleOptions ?? input.shuffleOptions ?? false,
      showCorrectAnswers: exam?.showCorrectAnswersAfterExam ?? input.showCorrectAnswers ?? false,
      createdById,
    },
    contents,
    questions,
  };
}

const trainingInclude = {
  contents: { orderBy: { order: "asc" } },
  questions: { orderBy: { order: "asc" }, include: { options: { orderBy: { order: "asc" } } } },
  documents: { where: { type: { in: ["TRAINING_COVER", "TRAINING_CONTENT", "QUESTION_IMAGE", "OPTION_IMAGE"] } }, orderBy: { createdAt: "desc" } },
  _count: { select: { assignments: { where: { cancelledAt: null } }, documents: true } },
};

function canonicalQuestions(questions: any[]): string {
  return JSON.stringify(questions.map((question) => ({
    text: question.text,
    explanation: question.explanation ?? null,
    type: question.type,
    points: question.points,
    order: question.order,
    imageUrl: question.imageUrl ?? null,
    options: [...question.options].sort((a, b) => a.order - b.order).map((option) => ({
      text: option.text ?? null,
      imageUrl: option.imageUrl ?? null,
      order: option.order,
      isCorrect: option.isCorrect,
    })),
  })).sort((a, b) => a.order - b.order));
}

function canonicalContents(contents: any[]): string {
  return JSON.stringify(contents.map((content) => ({
    type: content.type,
    title: content.title,
    fileUrl: content.fileUrl ?? null,
    externalUrl: content.externalUrl ?? null,
    order: content.order,
    isRequired: content.isRequired,
    durationSeconds: content.durationSeconds ?? null,
  })).sort((a, b) => a.order - b.order));
}

async function validatePublishState(tx: PrismaClientLike, trainingId: string): Promise<void> {
  const training = await tx.training.findUnique({
    where: { id: trainingId },
    include: { contents: true, questions: { include: { options: true } } },
  });
  if (!training) throw new HttpError(404, "Eğitim bulunamadı.");
  if (!training.trainingDate || !training.startTime || !training.location) {
    throw new HttpError(400, "Yayınlanan eğitimde tarih, başlangıç saati ve konum zorunludur.");
  }
  if (training.hasTrainingContent && training.contents.length === 0) {
    throw new HttpError(400, "İçerik akışı açık olan eğitimde en az bir içerik bulunmalıdır.");
  }
  if (training.mustCompleteContent && !training.contents.some((item: any) => item.isRequired)) {
    throw new HttpError(400, "Zorunlu içerik akışında en az bir içerik zorunlu olmalıdır.");
  }
  if (training.contents.some((item: any) => item.type === "VIDEO" && (!item.durationSeconds || item.durationSeconds < 1))) {
    throw new HttpError(400, "Video içeriklerinin gerçek süresi kaydedilmelidir.");
  }
  if (training.hasExam && training.questions.length === 0) {
    throw new HttpError(400, "Sınav akışı açık olan eğitimde en az bir soru bulunmalıdır.");
  }
  if (training.hasExam && training.questions.some((item: any) => item.options.length < 2)) {
    throw new HttpError(400, "Sınav sorularının en az iki seçeneği olmalıdır.");
  }
  if (
    training.hasExam &&
    training.questions.some((item: any) =>
      item.options.some((option: any) => !option.text?.trim() && !option.imageUrl)
    )
  ) {
    throw new HttpError(400, "Yayınlanan sınavda her şıkta metin veya görsel bulunmalıdır.");
  }
}

export interface TrainingListOptions {
  query?: string;
  status?: "ALL" | "ACTIVE" | "INACTIVE" | "DRAFT";
  page: number;
  pageSize: number;
}

export async function getAllTrainings(options: TrainingListOptions) {
  const prisma = await getPrisma();
  const term = options.query?.trim();
  const statusWhere =
    options.status === "ACTIVE"
      ? { isDraft: false, isActive: true }
      : options.status === "INACTIVE"
        ? { isDraft: false, isActive: false }
        : options.status === "DRAFT"
          ? { isDraft: true }
          : {};
  const where = {
    ...statusWhere,
    ...(term
      ? {
          OR: [
            { title: { contains: term, mode: "insensitive" as const } },
            { category: { contains: term, mode: "insensitive" as const } },
            { description: { contains: term, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [total, items] = await prisma.$transaction([
    prisma.training.count({ where }),
    prisma.training.findMany({
      where,
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { assignments: { where: { cancelledAt: null } }, documents: true },
        },
      },
    }),
  ]);

  return buildPaginatedResult(items, total, options.page, options.pageSize);
}

export async function getTrainingById(id: string) {
  const prisma = await getPrisma();
  return prisma.training.findUnique({ where: { id }, include: trainingInclude });
}

async function assertQuestionAssetReferences(
  tx: PrismaClientLike,
  trainingId: string,
  questions: ReturnType<typeof normalizeQuestion>[]
): Promise<void> {
  const expected = new Map<string, "QUESTION_IMAGE" | "OPTION_IMAGE">();
  for (const question of questions) {
    const questionDocumentId = documentIdFromUrl(question.imageUrl);
    if (questionDocumentId) expected.set(questionDocumentId, "QUESTION_IMAGE");
    for (const option of question.options) {
      const optionDocumentId = documentIdFromUrl(option.imageUrl);
      if (optionDocumentId) expected.set(optionDocumentId, "OPTION_IMAGE");
    }
  }
  if (expected.size === 0) return;

  const documents = await tx.trainingDocument.findMany({
    where: { trainingId, id: { in: [...expected.keys()] } },
    select: { id: true, type: true },
  });
  const actual = new Map(documents.map((document: any) => [document.id, document.type]));
  for (const [documentId, type] of expected) {
    if (actual.get(documentId) !== type) {
      throw new HttpError(400, "Soru veya şık görseli bu eğitime ait geçerli bir belge değil.");
    }
  }
}

async function createNestedQuestions(tx: PrismaClientLike, trainingId: string, questions: ReturnType<typeof normalizeQuestion>[]) {
  await assertQuestionAssetReferences(tx, trainingId, questions);
  for (const question of questions) {
    await tx.question.create({
      data: {
        trainingId,
        text: question.text,
        explanation: question.explanation,
        type: question.type,
        points: question.points,
        order: question.order,
        imageUrl: question.imageUrl,
        options: { create: question.options },
      },
    });
  }
}

export async function createTraining(input: SaveTrainingInput) {
  const prisma = await getPrisma();
  const normalized = normalizeTrainingInput(input);
  try {
    return await prisma.$transaction(async (tx: PrismaClientLike) => {
      const training = await tx.training.create({
        data: {
          ...normalized.training,
          contents: normalized.contents.length ? { create: normalized.contents } : undefined,
        },
      });
      await createNestedQuestions(tx, training.id, normalized.questions);
      if (!normalized.isDraft) await validatePublishState(tx, training.id);
      return tx.training.findUnique({ where: { id: training.id }, include: trainingInclude });
    });
  } catch (error) {
    if (isPrismaKnownRequestError(error, "P2003")) throw new HttpError(400, "Oluşturucu kullanıcı bulunamadı.");
    if (isPrismaKnownRequestError(error, "P2002")) throw new HttpError(409, "Soru veya içerik sırası tekrar ediyor.");
    throw error;
  }
}

export async function updateTraining(id: string, input: SaveTrainingInput) {
  const prisma = await getPrisma();
  const normalized = normalizeTrainingInput(input);
  const possibleOrphanDocumentIds = new Set<string>();
  try {
    const updated = await prisma.$transaction(async (tx: PrismaClientLike) => {
      const existing = await tx.training.findUnique({
        where: { id },
        include: {
          contents: true,
          questions: { include: { options: true } },
          assignments: {
            select: {
              startedAt: true,
              contentProgress: { select: { id: true }, take: 1 },
              attempts: { select: { id: true }, take: 1 },
            },
          },
        },
      });
      if (!existing) throw new HttpError(404, "Eğitim bulunamadı.");
      const hasAttempt = existing.assignments.some((item: any) => item.attempts.length > 0);
      const hasStartedAssignment = existing.assignments.some((item: any) => item.startedAt || item.contentProgress.length || item.attempts.length);
      const questionsChanged = normalized.questionsProvided && canonicalQuestions(existing.questions) !== canonicalQuestions(normalized.questions);
      const contentsChanged = normalized.contentsProvided && canonicalContents(existing.contents) !== canonicalContents(normalized.contents);
      const examSettingsChanged = [
        "hasExam", "passingScore", "attemptLimit", "examDurationMinutes", "shuffleQuestions", "shuffleOptions", "showCorrectAnswers",
      ].some((key) => existing[key] !== (normalized.training as Record<string, unknown>)[key]);
      const contentSettingsChanged = ["hasTrainingContent", "mustCompleteContent"].some(
        (key) => existing[key] !== (normalized.training as Record<string, unknown>)[key]
      );
      if (hasAttempt && (questionsChanged || examSettingsChanged)) {
        throw new HttpError(409, "Sınav denemesi başlamış eğitimde soru veya sınav ayarları değiştirilemez.");
      }
      if (hasStartedAssignment && (contentsChanged || contentSettingsChanged)) {
        throw new HttpError(409, "Çalışan tarafından başlanmış eğitimde içerik akışı değiştirilemez.");
      }
      await tx.training.update({
        where: { id },
        data: {
          ...normalized.training,
          createdById: undefined,
        },
      });
      if (questionsChanged) {
        for (const question of existing.questions) {
          const documentId = documentIdFromUrl(question.imageUrl);
          if (documentId) possibleOrphanDocumentIds.add(documentId);
          for (const option of question.options) {
            const optionDocumentId = documentIdFromUrl(option.imageUrl);
            if (optionDocumentId) possibleOrphanDocumentIds.add(optionDocumentId);
          }
        }
        await tx.question.deleteMany({ where: { trainingId: id } });
        await createNestedQuestions(tx, id, normalized.questions);
      }
      if (contentsChanged) {
        for (const content of existing.contents) {
          const documentId = documentIdFromUrl(content.fileUrl);
          if (documentId) possibleOrphanDocumentIds.add(documentId);
        }
        await tx.trainingContent.deleteMany({ where: { trainingId: id } });
        if (normalized.contents.length) {
          await tx.trainingContent.createMany({ data: normalized.contents.map((content) => ({ trainingId: id, ...content })) });
        }
      }
      if (!normalized.isDraft) await validatePublishState(tx, id);
      return tx.training.findUnique({ where: { id }, include: trainingInclude });
    });
    for (const documentId of possibleOrphanDocumentIds) {
      await deleteDocumentIfUnreferenced(documentId).catch(() => undefined);
    }
    return updated;
  } catch (error) {
    if (isPrismaKnownRequestError(error, "P2002")) throw new HttpError(409, "Soru veya içerik sırası tekrar ediyor.");
    throw error;
  }
}

export async function deleteTraining(id: string) {
  const prisma = await getPrisma();
  const existing = await prisma.training.findUnique({
    where: { id },
    select: { id: true, assignments: { select: { id: true }, take: 1 }, documents: { select: { id: true } } },
  });
  if (!existing) return undefined;
  if (existing.assignments.length) throw new HttpError(409, "Ataması bulunan eğitim silinemez; pasife alınmalıdır.");
  for (const document of existing.documents) await deleteStoredDocument(document.id);
  return prisma.training.delete({ where: { id } });
}
