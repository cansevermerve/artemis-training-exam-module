import { getPrisma, type PrismaClientLike } from "../lib/prisma.js";
import { readIntegerEnv } from "../utils/env.js";
import { HttpError, isPrismaKnownRequestError } from "../utils/http-error.js";

export interface SubmittedAnswerInput {
  questionId: string;
  selectedOptionIds: string[];
}

type EvaluatedAnswer = {
  questionId: string;
  selectedOptionIds: string[];
  answered: boolean;
  isCorrect: boolean;
  earnedPoints: number;
};

function shuffle<T>(values: T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }
  return result;
}

const attemptInclude = {
  assignment: {
    include: {
      user: { select: { id: true, name: true, email: true, title: true, department: true } },
      documents: { orderBy: { createdAt: "desc" } },
      training: {
        include: {
          questions: { orderBy: { order: "asc" }, include: { options: { orderBy: { order: "asc" } } } },
        },
      },
    },
  },
  answers: { include: { selectedOptions: true } },
  documents: { orderBy: { createdAt: "desc" } },
};

function orderAttemptQuestions(attempt: any) {
  const questions = attempt.assignment.training.questions;
  const questionOrder = Array.isArray(attempt.questionOrder)
    ? attempt.questionOrder.filter((id: unknown): id is string => typeof id === "string")
    : questions.map((question: any) => question.id);
  const optionOrder = attempt.optionOrder && typeof attempt.optionOrder === "object" && !Array.isArray(attempt.optionOrder)
    ? attempt.optionOrder as Record<string, unknown>
    : {};
  const questionMap = new Map<string, any>(questions.map((question: any) => [question.id, question]));
  return questionOrder
    .map((questionId: string) => questionMap.get(questionId))
    .filter(Boolean)
    .map((question: any) => {
      const storedOrder = optionOrder[question.id];
      const optionIds = Array.isArray(storedOrder)
        ? storedOrder.filter((id: unknown): id is string => typeof id === "string")
        : question.options.map((option: any) => option.id);
      const optionMap = new Map<string, any>(question.options.map((option: any) => [option.id, option]));
      return {
        id: question.id,
        text: question.text,
        type: question.type,
        points: question.points,
        order: question.order,
        imageUrl: question.imageUrl,
        options: optionIds.map((id: string) => optionMap.get(id)).filter(Boolean).map((option: any) => ({
          id: option.id,
          text: option.text,
          order: option.order,
        })),
      };
    });
}

function serializeAttempt(attempt: any) {
  const selectedByQuestion = new Map<string, string[]>(
    attempt.answers.map((answer: any) => [answer.questionId, answer.selectedOptions.map((record: any) => record.optionId)])
  );
  return {
    id: attempt.id,
    assignmentId: attempt.assignmentId,
    attemptNumber: attempt.attemptNumber,
    status: attempt.status,
    startedAt: attempt.startedAt,
    expiresAt: attempt.expiresAt,
    submittedAt: attempt.submittedAt,
    durationSeconds: attempt.durationSeconds,
    score: attempt.score,
    passed: attempt.passed,
    remainingAttempts: Math.max(0, attempt.assignment.training.attemptLimit - attempt.attemptNumber),
    training: {
      id: attempt.assignment.training.id,
      title: attempt.assignment.training.title,
      passingScore: attempt.assignment.training.passingScore,
      examDurationMinutes: attempt.assignment.training.examDurationMinutes,
      showCorrectAnswers: attempt.assignment.training.showCorrectAnswers,
    },
    questions: orderAttemptQuestions(attempt).map((question: any) => ({
      ...question,
      selectedOptionIds: selectedByQuestion.get(question.id) ?? [],
    })),
  };
}

function normalizeSubmittedAnswers(input: unknown): SubmittedAnswerInput[] {
  if (!Array.isArray(input)) throw new HttpError(400, "answers bir dizi olmalıdır.");
  const normalized = input.map((value, index) => {
    if (typeof value !== "object" || value === null) throw new HttpError(400, `${index + 1}. cevap nesne olmalıdır.`);
    const answer = value as Partial<SubmittedAnswerInput>;
    if (typeof answer.questionId !== "string" || !answer.questionId.trim()) {
      throw new HttpError(400, `${index + 1}. cevabın questionId alanı geçersiz.`);
    }
    if (!Array.isArray(answer.selectedOptionIds) || answer.selectedOptionIds.some((id) => typeof id !== "string")) {
      throw new HttpError(400, `${index + 1}. cevabın selectedOptionIds alanı string dizisi olmalıdır.`);
    }
    return {
      questionId: answer.questionId.trim(),
      selectedOptionIds: [...new Set(answer.selectedOptionIds.map((id) => id.trim()).filter(Boolean))],
    };
  });
  if (new Set(normalized.map((answer) => answer.questionId)).size !== normalized.length) {
    throw new HttpError(400, "Aynı soru için birden fazla cevap gönderilemez.");
  }
  return normalized;
}

function setsEqual(first: Set<string>, second: Set<string>): boolean {
  return first.size === second.size && [...first].every((value) => second.has(value));
}

function persistedAnswerMap(attempt: any): Map<string, string[]> {
  return new Map(attempt.answers.map((answer: any) => [
    answer.questionId,
    answer.selectedOptions.map((item: any) => item.optionId),
  ]));
}

function evaluateAnswers(questions: any[], answerMap: Map<string, string[]>): {
  answers: EvaluatedAnswer[];
  totalPoints: number;
  earnedPoints: number;
  score: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
} {
  const evaluated = questions.map((question: any): EvaluatedAnswer => {
    const selectedOptionIds = answerMap.get(question.id) ?? [];
    const validOptionIds = new Set<string>(question.options.map((option: any) => option.id));
    if (selectedOptionIds.some((optionId) => !validOptionIds.has(optionId))) {
      throw new HttpError(400, "Cevapta soruya ait olmayan bir seçenek bulundu.");
    }
    if (question.type === "SINGLE" && selectedOptionIds.length > 1) {
      throw new HttpError(400, "Tek seçimli soruda birden fazla seçenek gönderilemez.");
    }
    const selectedSet = new Set(selectedOptionIds);
    const correctSet = new Set<string>(question.options.filter((option: any) => option.isCorrect).map((option: any) => option.id));
    const answered = selectedSet.size > 0;
    const isCorrect = answered && setsEqual(selectedSet, correctSet);
    return {
      questionId: question.id,
      selectedOptionIds,
      answered,
      isCorrect,
      earnedPoints: isCorrect ? question.points : 0,
    };
  });
  const totalPoints = questions.reduce((sum: number, question: any) => sum + question.points, 0);
  if (totalPoints <= 0) throw new HttpError(409, "Sınavın toplam puanı sıfır olamaz.");
  const earnedPoints = evaluated.reduce((sum, answer) => sum + answer.earnedPoints, 0);
  const correctCount = evaluated.filter((answer) => answer.isCorrect).length;
  const unansweredCount = evaluated.filter((answer) => !answer.answered).length;
  return {
    answers: evaluated,
    totalPoints,
    earnedPoints,
    score: Math.round((earnedPoints / totalPoints) * 100),
    correctCount,
    wrongCount: evaluated.length - correctCount - unansweredCount,
    unansweredCount,
  };
}

async function writeEvaluation(
  tx: PrismaClientLike,
  attempt: any,
  evaluation: ReturnType<typeof evaluateAnswers>,
  now: Date,
  forcedStatus?: "TIMED_OUT"
): Promise<void> {
  for (const evaluated of evaluation.answers) {
    const answer = attempt.answers.find((record: any) => record.questionId === evaluated.questionId);
    if (!answer) throw new HttpError(409, "Sınav cevap kaydı eksik.");
    await tx.examAnswerOption.deleteMany({ where: { answerId: answer.id } });
    await tx.examAnswer.update({
      where: { id: answer.id },
      data: {
        isCorrect: evaluated.isCorrect,
        earnedPoints: evaluated.earnedPoints,
        answeredAt: evaluated.answered ? now : null,
        selectedOptions: evaluated.selectedOptionIds.length
          ? { create: evaluated.selectedOptionIds.map((optionId) => ({ optionId })) }
          : undefined,
      },
    });
  }
  const training = attempt.assignment.training;
  const passedByScore = evaluation.score >= training.passingScore;
  const passed = forcedStatus ? false : passedByScore;
  const status = forcedStatus ?? (passed ? "PASSED" : "FAILED");
  await tx.examAttempt.update({
    where: { id: attempt.id },
    data: {
      status,
      submittedAt: now,
      durationSeconds: Math.max(0, Math.floor((now.getTime() - attempt.startedAt.getTime()) / 1000)),
      totalPoints: evaluation.totalPoints,
      score: evaluation.score,
      passed,
      correctCount: evaluation.correctCount,
      wrongCount: evaluation.wrongCount,
      unansweredCount: evaluation.unansweredCount,
    },
  });
  const noAttemptsRemain = attempt.attemptNumber >= training.attemptLimit;
  await tx.trainingAssignment.update({
    where: { id: attempt.assignmentId },
    data: {
      status: passed ? "COMPLETED" : noAttemptsRemain ? "FAILED" : "IN_PROGRESS",
      completedAt: passed ? now : null,
    },
  });
}

function requiredContentComplete(assignment: any): boolean {
  if (!assignment.training.hasTrainingContent || !assignment.training.mustCompleteContent) return true;
  const required = assignment.training.contents.filter((item: any) => item.isRequired);
  const completed = new Set(assignment.contentProgress.filter((item: any) => item.isCompleted).map((item: any) => item.contentId));
  return required.length > 0 && required.every((item: any) => completed.has(item.id));
}

export async function startAttempt(assignmentId: string) {
  const prisma = await getPrisma();
  const now = new Date();
  try {
    const result = await prisma.$transaction(async (tx: PrismaClientLike) => {
      const assignment = await tx.trainingAssignment.findUnique({
        where: { id: assignmentId },
        include: {
          training: {
            include: {
              contents: true,
              questions: { orderBy: { order: "asc" }, include: { options: { orderBy: { order: "asc" } } } },
            },
          },
          contentProgress: true,
          attempts: {
            orderBy: { attemptNumber: "asc" },
            include: { answers: { include: { selectedOptions: true } } },
          },
        },
      });
      if (!assignment) throw new HttpError(404, "Eğitim ataması bulunamadı.");
      if (assignment.cancelledAt || assignment.status === "CANCELLED") throw new HttpError(409, "İptal edilmiş atama için sınav başlatılamaz.");
      if (assignment.dueDate && assignment.dueDate.getTime() < now.getTime()) {
        await tx.trainingAssignment.update({ where: { id: assignmentId }, data: { status: "EXPIRED" } });
        throw new HttpError(409, "Bu eğitim atamasının son tarihi geçmiş.");
      }
      const training = assignment.training;
      if (training.isDraft || !training.isActive) throw new HttpError(409, "Eğitim aktif olmadığı için sınav başlatılamaz.");
      if (!training.hasExam || training.questions.length === 0) throw new HttpError(409, "Bu eğitimde kullanılabilir sınav bulunmuyor.");
      if (assignment.attempts.some((attempt: any) => attempt.status === "PASSED" || attempt.passed === true)) {
        throw new HttpError(409, "Bu sınav daha önce başarıyla tamamlandığı için yeniden girilemez.");
      }
      if (!requiredContentComplete(assignment)) {
        throw new HttpError(409, "Zorunlu eğitim içeriği tamamlanmadan sınava başlanamaz.");
      }
      const activeAttempt = assignment.attempts.find((attempt: any) => attempt.status === "IN_PROGRESS");
      if (activeAttempt && (!activeAttempt.expiresAt || activeAttempt.expiresAt.getTime() > now.getTime())) {
        return { attemptId: activeAttempt.id };
      }
      if (activeAttempt) {
        const fullAttempt = { ...activeAttempt, assignment: { ...assignment, training } };
        const evaluation = evaluateAnswers(training.questions, persistedAnswerMap(activeAttempt));
        await writeEvaluation(tx, fullAttempt, evaluation, now, "TIMED_OUT");
      }
      const usedAttemptCount = assignment.attempts.length;
      if (usedAttemptCount >= training.attemptLimit) throw new HttpError(409, "Sınav deneme hakkı dolmuş.");
      const attemptNumber = Math.max(0, ...assignment.attempts.map((attempt: any) => attempt.attemptNumber)) + 1;
      const orderedQuestions = training.shuffleQuestions ? shuffle(training.questions) : training.questions;
      const questionOrder = orderedQuestions.map((question: any) => question.id);
      const optionOrder = Object.fromEntries(training.questions.map((question: any) => [
        question.id,
        (training.shuffleOptions ? shuffle(question.options) : question.options).map((option: any) => option.id),
      ]));
      const attempt = await tx.examAttempt.create({
        data: {
          assignmentId,
          attemptNumber,
          expiresAt: new Date(now.getTime() + training.examDurationMinutes * 60_000),
          questionOrder,
          optionOrder,
          answers: { create: training.questions.map((question: any) => ({ questionId: question.id })) },
        },
      });
      await tx.trainingAssignment.update({
        where: { id: assignmentId },
        data: {
          startedAt: assignment.startedAt ?? now,
          status: "IN_PROGRESS",
          contentCompletedAt: assignment.contentCompletedAt ?? now,
        },
      });
      return { attemptId: attempt.id };
    }, { isolationLevel: "Serializable" });
    const attempt = await prisma.examAttempt.findUnique({ where: { id: result.attemptId }, include: attemptInclude });
    if (!attempt) throw new HttpError(500, "Oluşturulan sınav denemesi okunamadı.");
    return serializeAttempt(attempt);
  } catch (error) {
    if (isPrismaKnownRequestError(error, "P2002") || isPrismaKnownRequestError(error, "P2034")) {
      const active = await prisma.examAttempt.findFirst({
        where: { assignmentId, status: "IN_PROGRESS", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        orderBy: { startedAt: "desc" },
        include: attemptInclude,
      });
      if (active) return serializeAttempt(active);
      throw new HttpError(409, "Sınav başlatma isteği eşzamanlı başka bir işlemle çakıştı; yeniden deneyin.");
    }
    throw error;
  }
}

export async function getAttemptById(attemptId: string) {
  const prisma = await getPrisma();
  const attempt = await prisma.examAttempt.findUnique({ where: { id: attemptId }, include: attemptInclude });
  return attempt ? serializeAttempt(attempt) : undefined;
}

export async function submitAttempt(attemptId: string, submittedAnswers: unknown) {
  const prisma = await getPrisma();
  const normalizedAnswers = normalizeSubmittedAnswers(submittedAnswers);
  const now = new Date();
  const graceSeconds = readIntegerEnv("EXAM_SUBMIT_GRACE_SECONDS", 15, { min: 0, max: 300 });
  try {
    await prisma.$transaction(async (tx: PrismaClientLike) => {
      const attempt = await tx.examAttempt.findUnique({ where: { id: attemptId }, include: attemptInclude });
      if (!attempt) throw new HttpError(404, "Sınav denemesi bulunamadı.");
      if (attempt.status !== "IN_PROGRESS" || attempt.submittedAt) throw new HttpError(409, "Bu sınav denemesi daha önce sonuçlandırılmış.");
      const claim = await tx.examAttempt.updateMany({
        where: { id: attemptId, status: "IN_PROGRESS", submittedAt: null },
        data: { submittedAt: now },
      });
      if (claim.count !== 1) throw new HttpError(409, "Sınav aynı anda başka bir istek tarafından sonuçlandırıldı.");
      const expiredByMs = attempt.expiresAt ? now.getTime() - attempt.expiresAt.getTime() : -1;
      const beyondGrace = expiredByMs > graceSeconds * 1000;
      const answerMap = persistedAnswerMap(attempt);
      if (!beyondGrace) {
        const questionIds = new Set<string>(attempt.assignment.training.questions.map((question: any) => question.id));
        for (const answer of normalizedAnswers) {
          if (!questionIds.has(answer.questionId)) throw new HttpError(400, "Cevapta sınava ait olmayan bir soru bulundu.");
          answerMap.set(answer.questionId, answer.selectedOptionIds);
        }
      }
      const evaluation = evaluateAnswers(attempt.assignment.training.questions, answerMap);
      await writeEvaluation(tx, attempt, evaluation, now, beyondGrace ? "TIMED_OUT" : undefined);
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (isPrismaKnownRequestError(error, "P2034")) {
      throw new HttpError(409, "Sınav sonuçlandırma işlemi eşzamanlı bir istekle çakıştı; sonucu yeniden açın.");
    }
    throw error;
  }
  return getAttemptResult(attemptId);
}

export async function getAttemptResult(attemptId: string) {
  const prisma = await getPrisma();
  const attempt = await prisma.examAttempt.findUnique({ where: { id: attemptId }, include: attemptInclude });
  if (!attempt) return undefined;
  if (attempt.status === "IN_PROGRESS") throw new HttpError(409, "Sınav henüz tamamlanmadı.");
  const certificate = attempt.documents.find((document: any) => document.type === "OSGB_CERTIFICATE")
    ?? attempt.assignment.documents.find((document: any) => document.type === "OSGB_CERTIFICATE" && document.attemptId === attempt.id);
  return {
    attemptId: attempt.id,
    assignmentId: attempt.assignmentId,
    employee: attempt.assignment.user,
    training: {
      id: attempt.assignment.training.id,
      title: attempt.assignment.training.title,
      passingScore: attempt.assignment.training.passingScore,
      showCorrectAnswers: attempt.assignment.training.showCorrectAnswers,
      hasCertificate: attempt.assignment.training.hasCertificate,
      certificateMinimumScore:
        attempt.assignment.training.certificateMinimumScore ??
        attempt.assignment.training.passingScore,
    },
    attemptNumber: attempt.attemptNumber,
    status: attempt.status,
    score: attempt.score ?? 0,
    totalScore: 100,
    totalPoints: attempt.totalPoints,
    passed: attempt.passed ?? false,
    correctCount: attempt.correctCount ?? 0,
    wrongCount: attempt.wrongCount ?? 0,
    unansweredCount: attempt.unansweredCount ?? 0,
    startedAt: attempt.startedAt,
    completedAt: attempt.submittedAt,
    durationSeconds: attempt.durationSeconds ?? 0,
    remainingAttempts: Math.max(0, attempt.assignment.training.attemptLimit - attempt.attemptNumber),
    certificateEligible:
      attempt.assignment.training.hasCertificate &&
      (attempt.passed ?? false) &&
      (attempt.score ?? 0) >=
        (attempt.assignment.training.certificateMinimumScore ??
          attempt.assignment.training.passingScore),
    certificateUrl: certificate ? `/documents/${certificate.id}/preview` : null,
  };
}
