import { getPrisma, type PrismaClientLike } from "../lib/prisma.js";
import { HttpError, isPrismaKnownRequestError } from "../utils/http-error.js";

export async function getAnswersByAttemptId(attemptId: string) {
  const prisma = await getPrisma();
  return prisma.examAnswer.findMany({
    where: { attemptId },
    orderBy: { question: { order: "asc" } },
    include: { selectedOptions: true },
  });
}

export async function updateExamAnswer(
  attemptId: string,
  questionId: string,
  selectedOptionIds: unknown[]
) {
  const prisma = await getPrisma();
  if (!Array.isArray(selectedOptionIds) || selectedOptionIds.some((optionId) => typeof optionId !== "string")) {
    throw new HttpError(400, "selectedOptionIds string dizisi olmalıdır.");
  }
  const normalizedIds = [...new Set((selectedOptionIds as string[]).map((id) => id.trim()).filter(Boolean))];
  try {
    return await prisma.$transaction(async (tx: PrismaClientLike) => {
      const answer = await tx.examAnswer.findUnique({
        where: { attemptId_questionId: { attemptId, questionId } },
        include: { attempt: true, question: { include: { options: true } } },
      });
      if (!answer) return undefined;
      if (answer.attempt.status !== "IN_PROGRESS" || answer.attempt.submittedAt) {
        throw new HttpError(409, "Sonuçlandırılmış denemenin cevabı değiştirilemez.");
      }
      if (answer.attempt.expiresAt && answer.attempt.expiresAt.getTime() < Date.now()) {
        throw new HttpError(409, "Sınav süresi dolduğu için cevap kaydedilemez.");
      }
      const lock = await tx.examAttempt.updateMany({
        where: { id: attemptId, status: "IN_PROGRESS", submittedAt: null },
        data: { updatedAt: new Date() },
      });
      if (lock.count !== 1) throw new HttpError(409, "Sınav sonuçlandırıldığı için cevap kaydedilemedi.");
      const validOptionIds = new Set<string>(answer.question.options.map((option: any) => option.id));
      if (normalizedIds.some((optionId) => !validOptionIds.has(optionId))) {
        throw new HttpError(400, "Seçeneklerden biri soruya ait değil.");
      }
      if (answer.question.type === "SINGLE" && normalizedIds.length > 1) {
        throw new HttpError(400, "Tek seçimli soruda birden fazla seçenek seçilemez.");
      }
      await tx.examAnswerOption.deleteMany({ where: { answerId: answer.id } });
      return tx.examAnswer.update({
        where: { id: answer.id },
        data: {
          answeredAt: normalizedIds.length ? new Date() : null,
          isCorrect: null,
          earnedPoints: 0,
          selectedOptions: normalizedIds.length
            ? { create: normalizedIds.map((optionId) => ({ optionId })) }
            : undefined,
        },
        include: { selectedOptions: true },
      });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (isPrismaKnownRequestError(error, "P2034")) {
      throw new HttpError(409, "Cevap kaydetme işlemi sınav gönderimiyle çakıştı; sonucu kontrol edin.");
    }
    throw error;
  }
}
