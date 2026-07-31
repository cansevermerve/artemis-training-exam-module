import { getPrisma, type PrismaClientLike } from "../lib/prisma.js";
import { deleteDocumentIfUnreferenced } from "./document.service.js";
import { HttpError } from "../utils/http-error.js";

export type QuestionType = "SINGLE" | "MULTIPLE";

export interface QuestionOptionInput {
  text: string;
  order: number;
  isCorrect: boolean;
}

export interface CreateQuestionInput {
  text: string;
  explanation?: string;
  type: QuestionType;
  points?: number;
  order: number;
  imageUrl?: string;
  options: QuestionOptionInput[];
}

function documentIdFromUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/^\/documents\/([^/]+)\/preview$/);
  if (!match) {
    throw new HttpError(400, "Soru görseli yalnızca belge upload endpoint'i üzerinden yüklenebilir.");
  }
  return match[1];
}

function validateQuestion(input: CreateQuestionInput): CreateQuestionInput {
  const text = input.text?.trim();
  if (!text) throw new HttpError(400, "Soru metni zorunludur.");

  if (input.type !== "SINGLE" && input.type !== "MULTIPLE") {
    throw new HttpError(400, "Soru tipi SINGLE veya MULTIPLE olmalıdır.");
  }
  if (!Number.isInteger(input.order) || input.order < 1 || input.order > 10_000) {
    throw new HttpError(400, "Soru sırası 1-10000 aralığında tam sayı olmalıdır.");
  }
  const points = input.points ?? 10;
  if (!Number.isInteger(points) || points < 1 || points > 1_000) {
    throw new HttpError(400, "Soru puanı 1-1000 aralığında tam sayı olmalıdır.");
  }
  if (!Array.isArray(input.options) || input.options.length < 2 || input.options.length > 100) {
    throw new HttpError(400, "Her soruda 2-100 arasında cevap seçeneği olmalıdır.");
  }

  const options = input.options.map((option, index) => ({
    text: option.text?.trim(),
    order: option.order ?? index + 1,
    isCorrect: Boolean(option.isCorrect),
  }));
  if (options.some((option) => !option.text)) {
    throw new HttpError(400, "Cevap seçenekleri boş bırakılamaz.");
  }
  if (options.some((option) => !Number.isInteger(option.order) || option.order < 1 || option.order > 10_000)) {
    throw new HttpError(400, "Seçenek sırası 1-10000 aralığında tam sayı olmalıdır.");
  }
  if (new Set(options.map((option) => option.order)).size !== options.length) {
    throw new HttpError(400, "Seçenek sıra değerleri benzersiz olmalıdır.");
  }
  const normalizedTexts = options.map((option) => option.text.toLocaleLowerCase("tr-TR"));
  if (new Set(normalizedTexts).size !== normalizedTexts.length) {
    throw new HttpError(400, "Aynı soru içinde seçenekler tekrar edemez.");
  }

  const correctCount = options.filter((option) => option.isCorrect).length;
  if (input.type === "SINGLE" && correctCount !== 1) {
    throw new HttpError(400, "SINGLE soruda tam bir doğru cevap olmalıdır.");
  }
  if (input.type === "MULTIPLE" && correctCount < 1) {
    throw new HttpError(400, "MULTIPLE soruda en az bir doğru cevap olmalıdır.");
  }

  const imageUrl = input.imageUrl?.trim() || undefined;
  if (imageUrl) documentIdFromUrl(imageUrl);

  return {
    ...input,
    text,
    explanation: input.explanation?.trim() || undefined,
    imageUrl,
    points,
    options,
  };
}

async function assertQuestionImage(
  tx: PrismaClientLike,
  trainingId: string,
  imageUrl: string | undefined
): Promise<void> {
  const documentId = documentIdFromUrl(imageUrl);
  if (!documentId) return;
  const document = await tx.trainingDocument.findFirst({
    where: { id: documentId, trainingId, type: "QUESTION_IMAGE" },
    select: { id: true },
  });
  if (!document) {
    throw new HttpError(400, "Soru görseli bu eğitime ait geçerli bir belge değil.");
  }
}

const questionInclude = {
  options: { orderBy: { order: "asc" } },
};

export async function getQuestionsByTrainingId(trainingId: string) {
  const prisma = await getPrisma();
  return prisma.question.findMany({
    where: { trainingId },
    orderBy: { order: "asc" },
    include: questionInclude,
  });
}

export async function getQuestionById(questionId: string) {
  const prisma = await getPrisma();
  return prisma.question.findUnique({
    where: { id: questionId },
    include: questionInclude,
  });
}

export async function createQuestion(
  trainingId: string,
  input: CreateQuestionInput
) {
  const prisma = await getPrisma();
  const validated = validateQuestion(input);

  return prisma.$transaction(async (tx: PrismaClientLike) => {
    const training = await tx.training.findUnique({
      where: { id: trainingId },
      select: {
        id: true,
        assignments: {
          select: { attempts: { select: { id: true }, take: 1 } },
        },
      },
    });
    if (!training) throw new HttpError(404, "Eğitim bulunamadı.");
    if (training.assignments.some((assignment: { attempts: unknown[] }) => assignment.attempts.length > 0)) {
      throw new HttpError(409, "Sınav denemesi başlamış eğitime yeni soru eklenemez.");
    }
    await assertQuestionImage(tx, trainingId, validated.imageUrl);
    return tx.question.create({
      data: {
        trainingId,
        text: validated.text,
        explanation: validated.explanation,
        type: validated.type,
        points: validated.points,
        order: validated.order,
        imageUrl: validated.imageUrl,
        options: { create: validated.options },
      },
      include: questionInclude,
    });
  });
}

export async function updateQuestion(
  trainingId: string,
  questionId: string,
  input: CreateQuestionInput
) {
  const prisma = await getPrisma();
  const validated = validateQuestion(input);
  let previousDocumentId: string | null = null;

  const updated = await prisma.$transaction(async (tx: PrismaClientLike) => {
    const question = await tx.question.findFirst({
      where: { id: questionId, trainingId },
      include: { answers: { select: { id: true }, take: 1 } },
    });
    if (!question) return undefined;
    if (question.answers.length > 0) {
      throw new HttpError(409, "Sınav denemesinde kullanılan soru değiştirilemez.");
    }
    await assertQuestionImage(tx, trainingId, validated.imageUrl);
    previousDocumentId = documentIdFromUrl(question.imageUrl);
    await tx.questionOption.deleteMany({ where: { questionId } });
    return tx.question.update({
      where: { id: questionId },
      data: {
        text: validated.text,
        explanation: validated.explanation,
        type: validated.type,
        points: validated.points,
        order: validated.order,
        imageUrl: validated.imageUrl,
        options: { create: validated.options },
      },
      include: questionInclude,
    });
  });

  const nextDocumentId = documentIdFromUrl(validated.imageUrl);
  if (previousDocumentId && previousDocumentId !== nextDocumentId) {
    await deleteDocumentIfUnreferenced(previousDocumentId).catch(() => undefined);
  }
  return updated;
}

export async function deleteQuestion(trainingId: string, questionId: string) {
  const prisma = await getPrisma();
  let imageDocumentId: string | null = null;

  const deleted = await prisma.$transaction(async (tx: PrismaClientLike) => {
    const question = await tx.question.findFirst({
      where: { id: questionId, trainingId },
      include: { answers: { select: { id: true }, take: 1 } },
    });
    if (!question) return undefined;
    if (question.answers.length > 0) {
      throw new HttpError(409, "Sınav denemesinde kullanılan soru silinemez.");
    }
    imageDocumentId = documentIdFromUrl(question.imageUrl);
    return tx.question.delete({ where: { id: questionId } });
  });

  if (imageDocumentId) {
    await deleteDocumentIfUnreferenced(imageDocumentId).catch(() => undefined);
  }
  return deleted;
}
