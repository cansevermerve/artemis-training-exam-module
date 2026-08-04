import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download } from "lucide-react";

import { adminApiRequest, downloadProtectedDocument } from "../../lib/api";

interface TrainingSummary {
  title: string;
  category?: string | null;
}

function AttendanceFormPage() {
  const navigate = useNavigate();
  const { id: trainingId } = useParams<{ id: string }>();
  const [templateType, setTemplateType] = useState<
    "ISG_BASIC" | "WORKING_AT_HEIGHT"
  >("ISG_BASIC");
  const [trainingTitle, setTrainingTitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!trainingId) return;

    let active = true;
    void adminApiRequest<TrainingSummary>(
      `/trainings/${encodeURIComponent(trainingId)}`
    )
      .then((training) => {
        if (!active) return;
        setTrainingTitle(training.title);
        const templateHint = `${training.title} ${training.category ?? ""}`
          .toLocaleLowerCase("tr-TR");
        if (templateHint.includes("yüksekte")) {
          setTemplateType("WORKING_AT_HEIGHT");
        }
      })
      .catch((requestError) => {
        if (!active) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Eğitim bilgisi yüklenemedi."
        );
      });

    return () => {
      active = false;
    };
  }, [trainingId]);

  async function download() {
    if (!trainingId) {
      setError("Eğitim kimliği bulunamadı.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const fallbackName =
        templateType === "ISG_BASIC"
          ? `isg-katilim-formu-${trainingId}.pdf`
          : `yuksekte-calisma-katilim-formu-${trainingId}.pdf`;
      await downloadProtectedDocument(
        `/pdfs/attendance?trainingId=${encodeURIComponent(trainingId)}&templateType=${templateType}`,
        fallbackName,
        "admin"
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "PDF indirilemedi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6 dark:bg-gray-900">
      <div className="mx-auto max-w-xl rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <button
          type="button"
          onClick={() => navigate(`/admin/trainings/${trainingId}/participants`)}
          className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300"
        >
          <ArrowLeft className="h-4 w-4" /> Katılımcılar Sayfasına Dön
        </button>
        <h1 className="mt-5 text-xl font-semibold text-gray-900 dark:text-gray-100">
          Katılım Formu Oluştur
        </h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          PDF seçili eğitimin adı, tarihi, süresi, yeri, eğitim şekli, gerçek
          katılımcıları ve sonuçlarıyla doldurulur; kaşe ve imza alanları boş
          bırakılır.
        </p>
        {trainingTitle && (
          <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900">
            <span className="font-semibold text-gray-700 dark:text-gray-200">
              Eğitim:
            </span>{" "}
            <span className="text-gray-600 dark:text-gray-300">
              {trainingTitle}
            </span>
          </div>
        )}
        <label
          htmlFor="attendance-template-type"
          className="mt-5 block text-sm font-medium text-gray-700 dark:text-gray-200"
        >
          Katılım Formu Şablonu
        </label>
        <select
          id="attendance-template-type"
          value={templateType}
          onChange={(event) =>
            setTemplateType(event.target.value as typeof templateType)
          }
          className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        >
          <option value="ISG_BASIC">İSG Temel Eğitim Katılım Tutanağı</option>
          <option value="WORKING_AT_HEIGHT">
            Yüksekte Çalışma Eğitim Katılım Tutanağı
          </option>
        </select>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button
          type="button"
          disabled={loading}
          onClick={() => void download()}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gray-800 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {loading ? "Oluşturuluyor..." : "PDF Oluştur ve İndir"}
        </button>
      </div>
    </div>
  );
}

export default AttendanceFormPage;
