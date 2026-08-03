import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, History, Save, X } from "lucide-react";

import { ProtectedAssetImage } from "../ProtectedAssetImage";
import { adminApiRequest } from "../../lib/api";
import type { UserSummary } from "../../types/api";

type AttemptStatus = "PASSED" | "FAILED" | "TIMED_OUT";

type ReviewOption = {
  id: string;
  text: string | null;
  imageUrl: string | null;
  order: number;
  isCorrect: boolean;
};

type ReviewQuestion = {
  id: string;
  text: string;
  type: "SINGLE" | "MULTIPLE";
  points: number;
  order: number;
  imageUrl: string | null;
  selectedOptionIds: string[];
  options: ReviewOption[];
};

type ResultAudit = {
  id: string;
  reason: string;
  previousStatus: AttemptStatus;
  newStatus: AttemptStatus;
  previousScore: number | null;
  newScore: number;
  previousPassed: boolean | null;
  newPassed: boolean;
  previousCorrectCount: number | null;
  newCorrectCount: number;
  previousWrongCount: number | null;
  newWrongCount: number;
  previousUnansweredCount: number | null;
  newUnansweredCount: number;
  createdAt: string;
  editedBy: Pick<UserSummary, "id" | "name" | "email">;
};

type AdminAttemptReview = {
  attemptId: string;
  assignmentId: string;
  attemptNumber: number;
  status: AttemptStatus;
  score: number;
  passed: boolean;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  submittedAt: string | null;
  employee: UserSummary;
  training: {
    id: string;
    title: string;
    passingScore: number;
  };
  questions: ReviewQuestion[];
  audits: ResultAudit[];
};

type SelectedAnswers = Record<string, string[]>;

type Props = {
  attemptId: string;
  onClose: () => void;
  onSaved: (message: string) => void;
};

function statusLabel(status: AttemptStatus): string {
  if (status === "PASSED") return "Başarılı";
  if (status === "FAILED") return "Başarısız";
  return "Süre Doldu";
}

function initialSelections(review: AdminAttemptReview): SelectedAnswers {
  return Object.fromEntries(
    review.questions.map((question) => [
      question.id,
      [...question.selectedOptionIds],
    ])
  );
}

function selectionsEqual(first: SelectedAnswers, second: SelectedAnswers): boolean {
  const questionIds = new Set([...Object.keys(first), ...Object.keys(second)]);
  return [...questionIds].every((questionId) => {
    const left = [...(first[questionId] ?? [])].sort();
    const right = [...(second[questionId] ?? [])].sort();
    return left.length === right.length && left.every((value, index) => value === right[index]);
  });
}

export function AdminResultCorrectionModal({ attemptId, onClose, onSaved }: Props) {
  const [review, setReview] = useState<AdminAttemptReview | null>(null);
  const [answers, setAnswers] = useState<SelectedAnswers>({});
  const [originalAnswers, setOriginalAnswers] = useState<SelectedAnswers>({});
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadReview() {
      setLoading(true);
      setError(null);
      try {
        const response = await adminApiRequest<AdminAttemptReview>(
          `/exam-attempts/${attemptId}/admin-review`
        );
        if (cancelled) return;
        const selections = initialSelections(response);
        setReview(response);
        setAnswers(selections);
        setOriginalAnswers(selections);
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Sınav sonucu yüklenemedi."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadReview();
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  const changed = useMemo(
    () => !selectionsEqual(originalAnswers, answers),
    [answers, originalAnswers]
  );

  function toggleOption(question: ReviewQuestion, optionId: string) {
    setAnswers((current) => {
      const selected = current[question.id] ?? [];
      if (question.type === "SINGLE") {
        return {
          ...current,
          [question.id]: selected.includes(optionId) ? [] : [optionId],
        };
      }
      return {
        ...current,
        [question.id]: selected.includes(optionId)
          ? selected.filter((id) => id !== optionId)
          : [...selected, optionId],
      };
    });
  }

  function requestClose() {
    if (saving) return;
    if ((changed || reason.trim()) && !window.confirm(
      "Kaydedilmemiş sonuç düzeltmeleri var. Pencereyi kapatmak istiyor musunuz?"
    )) {
      return;
    }
    onClose();
  }

  async function saveCorrection() {
    if (!review) return;
    if (!changed) {
      setError("Kaydetmeden önce en az bir cevabı değiştirin.");
      return;
    }
    if (reason.trim().length < 10) {
      setError("Düzeltme nedeni en az 10 karakter olmalıdır.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const updated = await adminApiRequest<AdminAttemptReview>(
        `/exam-attempts/${attemptId}/admin-correction`,
        {
          method: "PUT",
          body: JSON.stringify({
            reason: reason.trim(),
            answers: review.questions.map((question) => ({
              questionId: question.id,
              selectedOptionIds: answers[question.id] ?? [],
            })),
          }),
        }
      );
      onSaved(
        `${updated.employee.name ?? "Katılımcı"} için ${updated.attemptNumber}. deneme sonucu düzeltildi ve ${updated.score}/100 olarak yeniden hesaplandı.`
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Sınav sonucu düzeltilemedi."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="result-correction-title"
    >
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-800">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 p-4 dark:border-gray-700 sm:p-5">
          <div>
            <h2
              id="result-correction-title"
              className="text-lg font-semibold text-gray-900 dark:text-gray-100"
            >
              Sınav Sonucunu Düzelt
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Cevaplar değiştirildiğinde puan ve başarı durumu backend tarafından yeniden hesaplanır.
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={saving}
            className="rounded-lg border border-gray-300 p-2 text-gray-600 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300"
            aria-label="Pencereyi kapat"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-4 sm:p-5">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
              {error}
            </div>
          )}

          {loading ? (
            <p className="py-12 text-center text-sm text-gray-500">Sonuç yükleniyor...</p>
          ) : review ? (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-700 sm:col-span-2">
                  <p className="text-xs text-gray-500">Katılımcı</p>
                  <p className="mt-1 font-semibold text-gray-900 dark:text-gray-100">
                    {review.employee.name ?? review.employee.email ?? review.employee.id}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">{review.training.title}</p>
                </div>
                {[
                  ["Deneme", `${review.attemptNumber}. deneme`],
                  ["Mevcut Puan", `${review.score}/100`],
                  ["Durum", statusLabel(review.status)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className="mt-1 font-semibold text-gray-900 dark:text-gray-100">{value}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-4">
                {review.questions.map((question) => {
                  const selectedIds = new Set(answers[question.id] ?? []);
                  const hasImageOptions = question.options.some((option) => Boolean(option.imageUrl));
                  return (
                    <section
                      key={question.id}
                      className="rounded-xl border border-gray-200 p-4 dark:border-gray-700"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                          {question.order}. {question.text}
                        </h3>
                        <span className="shrink-0 text-xs text-gray-500">{question.points} puan</span>
                      </div>
                      <ProtectedAssetImage
                        endpoint={question.imageUrl}
                        actor="admin"
                        alt={`${question.order}. soru görseli`}
                        className="mt-3 max-h-64 max-w-full rounded-lg object-contain"
                      />
                      <div
                        className={
                          hasImageOptions
                            ? "mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
                            : "mt-4 space-y-2"
                        }
                      >
                        {question.options.map((option) => {
                          const selected = selectedIds.has(option.id);
                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => toggleOption(question, option.id)}
                              className={`relative w-full rounded-xl border p-3 text-left transition ${
                                selected
                                  ? "border-gray-900 bg-gray-50 ring-2 ring-gray-900/10 dark:border-gray-100 dark:bg-gray-900/50"
                                  : "border-gray-200 hover:border-gray-400 dark:border-gray-700"
                              }`}
                            >
                              <span className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                                <span
                                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs ${
                                    selected
                                      ? "border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900"
                                      : "border-gray-300"
                                  }`}
                                >
                                  {String.fromCharCode(64 + option.order)}
                                </span>
                                {option.text || (option.imageUrl ? "Görsel şık" : "Boş şık")}
                              </span>
                              <ProtectedAssetImage
                                endpoint={option.imageUrl}
                                actor="admin"
                                alt={`${String.fromCharCode(64 + option.order)} şıkkı görseli`}
                                className="mx-auto mt-3 h-28 w-full rounded-lg object-contain"
                              />
                              {option.isCorrect && (
                                <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Doğru şık
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Düzeltme nedeni <span className="text-red-600">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={1000}
                  rows={4}
                  placeholder="Örneğin: İmzalı sınav kâğıdıyla karşılaştırıldığında B şıkkının işaretli olduğu doğrulandı."
                  className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                />
                <p className="mt-1 text-right text-xs text-gray-500">{reason.trim().length}/1000</p>
              </div>

              <details className="rounded-xl border border-gray-200 dark:border-gray-700">
                <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-800 dark:text-gray-100">
                  <History className="h-4 w-4" /> Düzeltme Geçmişi ({review.audits.length})
                </summary>
                <div className="divide-y divide-gray-100 border-t border-gray-200 dark:divide-gray-700 dark:border-gray-700">
                  {review.audits.length === 0 ? (
                    <p className="p-4 text-sm text-gray-500">Bu sonuç daha önce düzeltilmemiş.</p>
                  ) : (
                    review.audits.map((audit) => (
                      <div key={audit.id} className="p-4 text-sm">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <p className="font-semibold text-gray-900 dark:text-gray-100">
                            {audit.previousScore ?? "—"}/100 → {audit.newScore}/100
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(audit.createdAt).toLocaleString("tr-TR")}
                          </p>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                          {audit.editedBy.name ?? audit.editedBy.email ?? audit.editedBy.id} · {statusLabel(audit.previousStatus)} → {statusLabel(audit.newStatus)}
                        </p>
                        <p className="mt-2 text-gray-700 dark:text-gray-300">{audit.reason}</p>
                      </div>
                    ))
                  )}
                </div>
              </details>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-gray-200 p-4 dark:border-gray-700 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={() => void saveCorrection()}
            disabled={loading || saving || !review || !changed || reason.trim().length < 10}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
          >
            <Save className="h-4 w-4" />
            {saving ? "Yeniden Hesaplanıyor..." : "Düzeltmeyi Kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}
