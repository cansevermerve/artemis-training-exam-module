import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download } from "lucide-react";

import { downloadProtectedDocument } from "../../lib/api";

function AttendanceFormPage() {
  const navigate = useNavigate();
  const { id: trainingId } = useParams<{ id: string }>();
  const [templateType, setTemplateType] = useState<
    "ISG_BASIC" | "WORKING_AT_HEIGHT"
  >("ISG_BASIC");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    if (!trainingId) {
      setError("Eğitim kimliği bulunamadı.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await downloadProtectedDocument(
        `/pdfs/attendance?trainingId=${encodeURIComponent(trainingId)}&templateType=${templateType}`,
        `katilim-formu-${trainingId}.pdf`,
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
          PDF gerçek katılımcı ve sonuç kayıtlarından üretilir; oluşturulan dosya
          belge tablosuna da kaydedilir.
        </p>
        <select
          value={templateType}
          onChange={(event) =>
            setTemplateType(event.target.value as typeof templateType)
          }
          className="mt-5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        >
          <option value="ISG_BASIC">İSG Temel Eğitim</option>
          <option value="WORKING_AT_HEIGHT">Yüksekte Çalışma</option>
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
