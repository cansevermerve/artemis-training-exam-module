import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { apiRequest, openProtectedDocument } from "../lib/api";
import type { AttemptResult } from "../types/api";

function ResultPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isAdminView = location.pathname.startsWith("/admin/");
  const { id: attemptId } = useParams<{ id: string }>();
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCertificateModal, setShowCertificateModal] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadResult() {
      if (!attemptId) {
        setError("Sınav sonucu kimliği bulunamadı.");
        setLoading(false);
        return;
      }

      try {
        const data = await apiRequest<AttemptResult>(
          `/exam-attempts/${attemptId}/result`,
          {},
          isAdminView ? "admin" : "user"
        );
        if (!cancelled) {
          setResult(data);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Sınav sonucu yüklenemedi."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadResult();
    return () => {
      cancelled = true;
    };
  }, [attemptId, isAdminView]);

  function handleCertificateClick() {
    if (!result?.certificateUrl) {
      setShowCertificateModal(true);
      return;
    }

    void openProtectedDocument(result.certificateUrl, isAdminView ? "admin" : "user").catch((requestError: unknown) => {
      setError(requestError instanceof Error ? requestError.message : "Sertifika açılamadı.");
    });
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 p-6 text-sm text-gray-600 dark:bg-gray-900 dark:text-gray-300">
        Sınav sonucu yükleniyor...
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 p-6 dark:bg-gray-900">
        <div className="w-full max-w-lg rounded-xl border border-red-200 bg-white p-6 text-center shadow-sm dark:border-red-900/50 dark:bg-gray-800">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Sonuç görüntülenemedi
          </h1>
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            {error ?? "Sınav sonucu bulunamadı."}
          </p>
          <button
            type="button"
            onClick={() => navigate(isAdminView ? "/admin/trainings" : "/", { replace: true })}
            className="mt-5 rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900"
          >
            Panele Dön
          </button>
        </div>
      </div>
    );
  }

  const statusLabel =
    result.status === "PASSED"
      ? "Başarılı"
      : result.status === "TIMED_OUT"
        ? "Süre Doldu"
        : "Başarısız";
  const statusClass = result.passed
    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
    : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400";
  const durationMinutes = Math.max(0, Math.ceil(result.durationSeconds / 60));

  return (
    <div className="min-h-screen bg-gray-100 p-3 dark:bg-gray-900 sm:p-6">
      <div className="mx-auto w-full max-w-5xl">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 sm:text-xl">
                {result.training.title} Sonucu
              </h1>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
                {result.attemptNumber}. sınav denemesi backend tarafından
                puanlandı.
              </p>
            </div>

            <span
              className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${statusClass}`}
            >
              {statusLabel}
            </span>
          </div>

          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/40 sm:p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Ad Soyad
                </p>
                <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {result.employee.name ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Görev
                </p>
                <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {result.employee.title ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Departman
                </p>
                <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {result.employee.department ?? "—"}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1.2fr_1fr]">
            <div className="flex items-center justify-center rounded-xl border border-gray-200 p-4 text-center dark:border-gray-700">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">
                  Sınav Puanı
                </p>
                <p className="mt-1 text-4xl font-bold text-gray-900 dark:text-gray-100 sm:text-5xl">
                  {result.score}
                  <span className="text-lg text-gray-400">
                    /{result.totalScore}
                  </span>
                </p>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Geçme notu: {result.training.passingScore}/{result.totalScore}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                ["Doğru", result.correctCount],
                ["Yanlış", result.wrongCount],
                ["Boş", result.unansweredCount],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="rounded-lg border border-gray-200 p-3 text-center dark:border-gray-700"
                >
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {label}
                  </p>
                  <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 text-xs text-gray-500 dark:text-gray-400 sm:grid-cols-2">
            <p>
              Tamamlanma:{" "}
              {result.completedAt
                ? new Date(result.completedAt).toLocaleString("tr-TR")
                : "—"}
            </p>
            <p className="sm:text-right">
              Tamamlama süresi: {durationMinutes} dakika
            </p>
          </div>

          {!result.passed && result.remainingAttempts > 0 && (
            <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
              Kalan deneme hakkı: {result.remainingAttempts}
            </p>
          )}

          {result.passed && result.training.hasCertificate && !result.certificateEligible && (
            <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
              Sertifika için gereken minimum puan: {result.training.certificateMinimumScore}.
            </p>
          )}

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => navigate(isAdminView ? "/admin/trainings" : "/", { replace: true })}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Panele Dön
            </button>

            {result.certificateEligible && (
              <button
                type="button"
                onClick={handleCertificateClick}
                className="w-full rounded-lg bg-gray-700 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-800"
              >
                Sertifikayı Görüntüle
              </button>
            )}
          </div>
        </div>
      </div>

      {showCertificateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="certificate-modal-title"
          onClick={() => setShowCertificateModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl dark:bg-gray-800"
            onClick={(event) => event.stopPropagation()}
          >
            <h2
              id="certificate-modal-title"
              className="text-lg font-semibold text-gray-900 dark:text-gray-100"
            >
              Sertifikanız henüz hazır değil
            </h2>
            <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
              Bu eğitim için OSGB sertifikası henüz sisteme yüklenmemiştir.
              Yüklendiğinde bu ekrandan görüntülenebilir.
            </p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setShowCertificateModal(false)}
                className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900"
              >
                Tamam
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ResultPage;
