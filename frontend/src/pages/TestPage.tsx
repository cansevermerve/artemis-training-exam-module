import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { ProtectedAssetImage } from "../components/ProtectedAssetImage";
import { useProtectedObjectUrl } from "../hooks/useProtectedObjectUrl";
import { apiRequest } from "../lib/api";
import type { ExamAttempt } from "../types/api";

function formatRemainingTime(totalSeconds: number): string {
  const minutes = Math.floor(Math.max(0, totalSeconds) / 60);
  const seconds = Math.max(0, totalSeconds) % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function TestPage() {
  const navigate = useNavigate();
  const { id: assignmentId } = useParams<{ id: string }>();
  const [attempt, setAttempt] = useState<ExamAttempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savingQuestionIds, setSavingQuestionIds] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState("");
  const [showFinishModal, setShowFinishModal] = useState(false);
  const pendingSaves = useRef(new Set<Promise<unknown>>());
  const autoSubmittedAttemptId = useRef<string | null>(null);

  useEffect(() => {
    if (!assignmentId) return;
    let cancelled = false;
    async function startExam() {
      try {
        const data = await apiRequest<ExamAttempt>("/exam-attempts", {
          method: "POST",
          body: JSON.stringify({ assignmentId }),
        });
        if (cancelled) return;
        setAttempt(data);
        setAnswers(Object.fromEntries(data.questions.map((question) => [question.id, question.selectedOptionIds ?? []])));
        const expiry = data.expiresAt
          ? new Date(data.expiresAt).getTime()
          : Date.now() + data.training.examDurationMinutes * 60_000;
        setRemainingSeconds(Math.max(0, Math.floor((expiry - Date.now()) / 1000)));
      } catch (error) {
        if (!cancelled) setErrorMessage(error instanceof Error ? error.message : "Sınav başlatılamadı.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void startExam();
    return () => { cancelled = true; };
  }, [assignmentId]);

  useEffect(() => {
    if (!attempt) return;
    const expiryTimestamp = attempt.expiresAt
      ? new Date(attempt.expiresAt).getTime()
      : new Date(attempt.startedAt).getTime() + attempt.training.examDurationMinutes * 60_000;

    function syncRemainingTime() {
      setRemainingSeconds(Math.max(0, Math.ceil((expiryTimestamp - Date.now()) / 1000)));
    }

    syncRemainingTime();
    const timer = window.setInterval(syncRemainingTime, 500);
    return () => window.clearInterval(timer);
  }, [attempt]);

  const currentQuestion = attempt?.questions[currentQuestionIndex];
  const hasImageOptions = currentQuestion?.options.some((option) => Boolean(option.imageUrl)) ?? false;
  const { url: protectedQuestionImage, error: imageError } = useProtectedObjectUrl(currentQuestion?.imageUrl);
  const unansweredQuestions = useMemo(
    () => attempt?.questions.filter((question) => !(answers[question.id]?.length > 0)) ?? [],
    [answers, attempt]
  );

  function saveAnswer(questionId: string, selectedOptionIds: string[]) {
    if (!attempt) return;
    const previous = answers[questionId] ?? [];
    setAnswers((current) => ({ ...current, [questionId]: selectedOptionIds }));
    setSavingQuestionIds((current) => new Set(current).add(questionId));
    setErrorMessage("");
    const request = apiRequest(
      `/exam-answers/${encodeURIComponent(attempt.id)}/questions/${encodeURIComponent(questionId)}`,
      { method: "PUT", body: JSON.stringify({ selectedOptionIds }) }
    ).catch((error: unknown) => {
      setAnswers((current) => ({ ...current, [questionId]: previous }));
      setErrorMessage(error instanceof Error ? error.message : "Cevap kaydedilemedi.");
      throw error;
    }).finally(() => {
      pendingSaves.current.delete(request);
      setSavingQuestionIds((current) => {
        const next = new Set(current);
        next.delete(questionId);
        return next;
      });
    });
    pendingSaves.current.add(request);
  }

  function selectOption(optionId: string) {
    if (!currentQuestion || remainingSeconds === 0) return;
    const currentSelection = answers[currentQuestion.id] ?? [];
    const nextSelection = currentQuestion.type === "SINGLE"
      ? [optionId]
      : currentSelection.includes(optionId)
        ? currentSelection.filter((id) => id !== optionId)
        : [...currentSelection, optionId];
    saveAnswer(currentQuestion.id, nextSelection);
  }

  async function submitExam(fromTimeout = false) {
    if (!attempt || isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage("");
    try {
      await Promise.allSettled([...pendingSaves.current]);
      await apiRequest(`/exam-attempts/${encodeURIComponent(attempt.id)}/submit`, {
        method: "PUT",
        body: JSON.stringify({
          answers: attempt.questions.map((question) => ({
            questionId: question.id,
            selectedOptionIds: answers[question.id] ?? [],
          })),
        }),
      });
      navigate(`/result/${attempt.id}`, { replace: true });
    } catch (error) {
      setShowFinishModal(false);
      setErrorMessage(error instanceof Error ? error.message : fromTimeout ? "Sınav süre sonunda gönderilemedi." : "Sınav gönderilemedi.");
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    if (!attempt || isLoading || remainingSeconds !== 0 || autoSubmittedAttemptId.current === attempt.id) return;
    autoSubmittedAttemptId.current = attempt.id;
    void submitExam(true);
  // submitExam intentionally reads the final local answer snapshot when the timer reaches zero.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, isLoading, remainingSeconds]);

  if (!assignmentId) return <div className="min-h-screen bg-gray-100 p-8 dark:bg-gray-900"><div className="mx-auto max-w-xl rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">Atama ID&apos;si bulunamadı.</div></div>;
  if (isLoading) return <div className="min-h-screen bg-gray-100 p-8 text-center text-sm text-gray-500 dark:bg-gray-900 dark:text-gray-300">Sınav başlatılıyor ve kurallar kontrol ediliyor...</div>;
  if (!attempt || !currentQuestion) return <div className="min-h-screen bg-gray-100 p-8 dark:bg-gray-900"><div className="mx-auto max-w-xl rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">{errorMessage || "Sınav yüklenemedi."}</div></div>;

  return (
    <div className="min-h-screen bg-gray-100 p-3 dark:bg-gray-900 sm:p-6">
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <header className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{attempt.training.title}</h1>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{attempt.attemptNumber}. deneme • Kalan hak: {attempt.remainingAttempts}</p>
            </div>
            <div className="flex items-center justify-center gap-2">
              <button type="button" aria-label="Önceki soru" disabled={currentQuestionIndex === 0} onClick={() => setCurrentQuestionIndex((index) => index - 1)} className="rounded-lg border border-gray-300 p-2 text-gray-600 disabled:opacity-40 dark:border-gray-600 dark:text-gray-300"><ChevronLeft className="h-4 w-4" /></button>
              <div className="inline-flex min-w-28 items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white dark:bg-gray-100 dark:text-gray-900"><Clock3 className="h-4 w-4" />{formatRemainingTime(remainingSeconds)}</div>
              <button type="button" aria-label="Sonraki soru" disabled={currentQuestionIndex === attempt.questions.length - 1} onClick={() => setCurrentQuestionIndex((index) => index + 1)} className="rounded-lg border border-gray-300 p-2 text-gray-600 disabled:opacity-40 dark:border-gray-600 dark:text-gray-300"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        </header>

        {errorMessage && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">{errorMessage}</div>}

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Soru {currentQuestionIndex + 1} / {attempt.questions.length}</p>
            <div className="flex items-center gap-2">
              <select value={currentQuestionIndex} onChange={(event) => setCurrentQuestionIndex(Number(event.target.value))} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200">
                {attempt.questions.map((question, index) => <option key={question.id} value={index}>{index + 1}. Soru {answers[question.id]?.length ? "✓" : ""}</option>)}
              </select>
              <button type="button" disabled={isSubmitting || savingQuestionIds.size > 0} onClick={() => setShowFinishModal(true)} className="rounded-lg bg-gray-800 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-900 disabled:opacity-50">Testi Bitir</button>
            </div>
          </div>

          <h2 className="mt-5 text-base font-semibold leading-7 text-gray-900 dark:text-gray-100 sm:text-lg">{currentQuestion.text}</h2>
          {protectedQuestionImage && <img src={protectedQuestionImage} alt="Soru görseli" className="mt-4 max-h-80 rounded-lg object-contain" />}
          {imageError && <p className="mt-3 text-xs text-red-600">Soru görseli yüklenemedi: {imageError}</p>}

          <div className={hasImageOptions ? "mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" : "mt-6 space-y-3"}>
            {currentQuestion.options.map((option, index) => {
              const isSelected = (answers[currentQuestion.id] ?? []).includes(option.id);
              const optionLetter = String.fromCharCode(65 + index);
              const optionDisabled = savingQuestionIds.has(currentQuestion.id) || remainingSeconds === 0 || isSubmitting;

              if (hasImageOptions) {
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={optionDisabled}
                    onClick={() => selectOption(option.id)}
                    className={`flex h-full min-h-44 w-full flex-col rounded-xl border p-3 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${isSelected ? "border-gray-800 bg-gray-800 text-white shadow-sm dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900" : "border-gray-200 bg-white text-gray-800 hover:border-gray-400 hover:shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"}`}
                  >
                    <span className="flex min-w-0 items-start gap-2">
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${isSelected ? "border-white bg-white text-gray-900 dark:border-gray-800 dark:bg-gray-800 dark:text-white" : "border-gray-300 dark:border-gray-600"}`}>
                        {optionLetter}
                      </span>
                      {option.text && <span className="min-w-0 flex-1 leading-5">{option.text}</span>}
                    </span>

                    {option.imageUrl && (
                      <span className={`mt-3 flex min-h-28 w-full flex-1 items-center justify-center rounded-lg p-2 ${isSelected ? "bg-white/95 dark:bg-white" : "bg-gray-50 dark:bg-gray-900/60"}`}>
                        <ProtectedAssetImage
                          endpoint={option.imageUrl}
                          alt={`${optionLetter} şıkkı görseli`}
                          className="max-h-36 w-full object-contain"
                          errorClassName="text-xs text-red-600 dark:text-red-400"
                        />
                      </span>
                    )}
                  </button>
                );
              }

              return (
                <button key={option.id} type="button" disabled={optionDisabled} onClick={() => selectOption(option.id)} className={`flex w-full items-center justify-between rounded-xl border p-4 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${isSelected ? "border-gray-800 bg-gray-800 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900" : "border-gray-200 bg-white text-gray-800 hover:border-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"}`}>
                  <span className="flex min-w-0 items-start gap-3">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${isSelected ? "border-white bg-white text-gray-900 dark:border-gray-800 dark:bg-gray-800 dark:text-white" : "border-gray-300 dark:border-gray-600"}`}>{optionLetter}</span>
                    <span className="min-w-0 flex-1">
                      {option.text && <span className="block">{option.text}</span>}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {showFinishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg dark:bg-gray-800">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Testi bitirmek istediğinize emin misiniz?</h2>
            {unansweredQuestions.length > 0 && <p className="mt-3 text-sm text-red-600 dark:text-red-400">Boş bıraktığınız sorular: {unansweredQuestions.map((question) => attempt.questions.findIndex((item) => item.id === question.id) + 1).join(", ")}</p>}
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">Puan ve başarı durumu yalnızca backend tarafından hesaplanacaktır.</p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" disabled={isSubmitting} onClick={() => setShowFinishModal(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 dark:border-gray-600 dark:text-gray-300">Vazgeç</button>
              <button type="button" disabled={isSubmitting || savingQuestionIds.size > 0} onClick={() => void submitExam()} className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-50">{isSubmitting ? "Gönderiliyor..." : "Evet, Bitir"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TestPage;
