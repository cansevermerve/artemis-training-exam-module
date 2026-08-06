import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileQuestion,
} from "lucide-react";

import { ProtectedAssetImage } from "../../components/ProtectedAssetImage";
import {
  adminApiRequest,
  downloadProtectedDocument,
} from "../../lib/api";
import type { Training } from "../../types/api";

type PreviewOption = {
  id: string;
  text: string | null;
  imageUrl: string | null;
  order: number;
  isCorrect?: boolean;
};

type PreviewQuestion = {
  id: string;
  text: string;
  explanation?: string | null;
  type: "SINGLE" | "MULTIPLE";
  points: number;
  order: number;
  imageUrl: string | null;
  options: PreviewOption[];
};

type PreviewTraining = Training & {
  questions?: PreviewQuestion[];
};

function ExamPreviewPage() {
  const navigate = useNavigate();
  const { id: trainingId } = useParams<{ id: string }>();
  const [training, setTraining] = useState<PreviewTraining | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadBusy, setDownloadBusy] = useState(false);

  useEffect(() => {
    if (!trainingId) {
      setError("Eğitim kimliği bulunamadı.");
      setLoading(false);
      return;
    }

    let active = true;
    void adminApiRequest<PreviewTraining>(
      `/trainings/${encodeURIComponent(trainingId)}`
    )
      .then((result) => {
        if (!active) return;
        setTraining(result);
      })
      .catch((requestError) => {
        if (!active) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Sınav önizlemesi yüklenemedi."
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [trainingId]);

  async function downloadExamPdf() {
    if (!trainingId || !training) return;
    setDownloadBusy(true);
    setError(null);
    try {
      await downloadProtectedDocument(
        `/pdf/training/${encodeURIComponent(trainingId)}/exam`,
        `${training.title}-sinav.pdf`,
        "admin"
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Sınav PDF'i indirilemedi."
      );
    } finally {
      setDownloadBusy(false);
    }
  }

  const questions = [...(training?.questions ?? [])].sort(
    (left, right) => left.order - right.order
  );

  return (
    <div className="min-h-screen bg-gray-100 p-4 dark:bg-gray-900 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <button
              type="button"
              onClick={() => navigate("/admin/trainings")}
              className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" /> Eğitimlere Dön
            </button>
            <h1 className="mt-3 flex items-center gap-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">
              <FileQuestion className="h-7 w-7" /> Sınav Önizlemesi
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Kaydedilen soru ve şıklar, katılımcıya gösterilecek sırayla görüntülenir.
            </p>
          </div>
          {training?.hasExam && (
            <button
              type="button"
              disabled={downloadBusy}
              onClick={() => void downloadExamPdf()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {downloadBusy ? "Hazırlanıyor..." : "Sınav PDF'ini İndir"}
            </button>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            Önizleme hazırlanıyor...
          </div>
        ) : training ? (
          <>
            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {training.category}
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">
                {training.title}
              </h2>
              {training.description && (
                <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
                  {training.description}
                </p>
              )}
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
                  <p className="text-xs text-gray-400">Sınav süresi</p>
                  <p className="mt-1 font-semibold text-gray-800 dark:text-gray-200">
                    {training.examDurationMinutes} dakika
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
                  <p className="text-xs text-gray-400">Geçme puanı</p>
                  <p className="mt-1 font-semibold text-gray-800 dark:text-gray-200">
                    {training.passingScore}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
                  <p className="text-xs text-gray-400">Soru sayısı</p>
                  <p className="mt-1 font-semibold text-gray-800 dark:text-gray-200">
                    {questions.length}
                  </p>
                </div>
              </div>
            </section>

            {!training.hasExam ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
                Bu eğitim için sınav özelliği etkin değil.
              </div>
            ) : questions.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                Bu sınav için henüz soru kaydedilmemiş.
              </div>
            ) : (
              <section className="space-y-4">
                {questions.map((question, questionIndex) => {
                  const options = [...question.options].sort(
                    (left, right) => left.order - right.order
                  );
                  const allOptionsVisual =
                    options.length >= 2 && options.every((option) => Boolean(option.imageUrl));
                  return (
                    <article
                      key={question.id}
                      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                            Soru {questionIndex + 1}
                          </p>
                          <h3 className="mt-2 text-base font-semibold leading-6 text-gray-900 dark:text-gray-100">
                            {question.text || "Soru metni girilmemiş"}
                          </h3>
                        </div>
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-200">
                          {question.type === "MULTIPLE"
                            ? "Birden fazla doğru cevap"
                            : "Tek doğru cevap"}
                        </span>
                      </div>

                      <ProtectedAssetImage
                        endpoint={question.imageUrl}
                        actor="admin"
                        alt={`Soru ${questionIndex + 1} görseli`}
                        className="mt-4 max-h-72 w-full object-contain"
                      />

                      {allOptionsVisual ? (
                        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
                          {options.map((option, optionIndex) => (
                            <div key={option.id} className="flex min-w-0 flex-col items-center">
                              <ProtectedAssetImage
                                endpoint={option.imageUrl}
                                actor="admin"
                                alt={`Soru ${questionIndex + 1}, şık ${optionIndex + 1} görseli`}
                                className="h-32 w-full object-contain"
                              />
                              <div className="mt-2 inline-flex items-center gap-1.5 text-base font-semibold text-gray-900 dark:text-gray-100">
                                <span>{String.fromCharCode(65 + optionIndex)})</span>
                                {option.isCorrect && (
                                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-4 space-y-2">
                          {options.map((option, optionIndex) => (
                            <div key={option.id} className="flex items-start gap-2 text-base text-gray-900 dark:text-gray-100">
                              <span className="font-semibold">{String.fromCharCode(65 + optionIndex)})</span>
                              <span className="flex-1">{option.text || ""}</span>
                              {option.isCorrect && (
                                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                                  <CheckCircle2 className="h-4 w-4" /> Doğru
                                </span>
                              )}
                              {option.imageUrl && (
                                <ProtectedAssetImage
                                  endpoint={option.imageUrl}
                                  actor="admin"
                                  alt={`Soru ${questionIndex + 1}, şık ${optionIndex + 1} görseli`}
                                  className="max-h-32 max-w-40 object-contain"
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {question.explanation && (
                        <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-200">
                          <span className="font-semibold">Açıklama:</span>{" "}
                          {question.explanation}
                        </div>
                      )}
                    </article>
                  );
                })}
              </section>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

export default ExamPreviewPage;
