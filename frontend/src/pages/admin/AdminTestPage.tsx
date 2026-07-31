import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList, Plus, RefreshCw } from "lucide-react";

import { adminApiRequest, downloadProtectedDocument } from "../../lib/api";
import type { Training } from "../../types/api";

type AdminTraining = Training & {
  createdById?: string;
  createdAt?: string;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  showCorrectAnswers?: boolean;
};

function getStatus(training: AdminTraining) {
  if (training.isDraft) return { label: "Taslak", className: "bg-amber-50 text-amber-700" };
  if (training.isActive) return { label: "Aktif", className: "bg-emerald-50 text-emerald-700" };
  return { label: "Pasif", className: "bg-gray-100 text-gray-600" };
}

function AdminTestPage() {
  const navigate = useNavigate();
  const [trainings, setTrainings] = useState<AdminTraining[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const loadTrainings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setTrainings(await adminApiRequest<AdminTraining[]>("/trainings")); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Eğitim listesi yüklenemedi."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadTrainings(), 0);
    return () => window.clearTimeout(timer);
  }, [loadTrainings]);

  const visibleTrainings = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("tr-TR");
    return normalized
      ? trainings.filter((training) => `${training.title} ${training.category}`.toLocaleLowerCase("tr-TR").includes(normalized))
      : trainings;
  }, [query, trainings]);

  async function toggleTraining(training: AdminTraining) {
    setBusyId(training.id);
    setError(null);
    try {
      const updated = await adminApiRequest<AdminTraining>(`/trainings/${training.id}`, {
        method: "PUT",
        body: JSON.stringify({
          status: "published",
          title: training.title,
          description: training.description,
          category: training.category,
          trainingKind: training.trainingKind,
          trainingFormat: training.trainingFormat,
          trainingDate: training.trainingDate,
          startTime: training.startTime,
          durationMinutes: training.durationMinutes,
          location: training.location,
          isActive: training.isDraft ? true : !training.isActive,
          flow: {
            hasTrainingContent: training.hasTrainingContent,
            mustCompleteContent: training.mustCompleteContent,
            hasExam: training.hasExam,
            hasCertificate: training.hasCertificate,
            hasAttendanceForm: training.hasAttendanceForm,
          },
          exam: training.hasExam ? {
            passingScore: training.passingScore,
            attemptLimit: training.attemptLimit,
            durationMinutes: training.examDurationMinutes,
            shuffleQuestions: Boolean(training.shuffleQuestions),
            shuffleOptions: Boolean(training.shuffleOptions),
            showCorrectAnswersAfterExam: Boolean(training.showCorrectAnswers),
          } : null,
          certificate: training.hasCertificate ? { minimumScore: training.certificateMinimumScore ?? training.passingScore } : null,
        }),
      });
      setTrainings((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Eğitimin durumu güncellenemedi.");
    } finally { setBusyId(null); }
  }

  async function deleteTraining(training: AdminTraining) {
    if (!window.confirm(`“${training.title}” eğitimini silmek istiyor musunuz?`)) return;
    setBusyId(training.id);
    setError(null);
    try {
      await adminApiRequest(`/trainings/${training.id}`, { method: "DELETE" });
      setTrainings((current) => current.filter((item) => item.id !== training.id));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Eğitim silinemedi.");
    } finally { setBusyId(null); }
  }

  async function download(endpoint: string, fallbackName: string) {
    setError(null);
    try { await downloadProtectedDocument(endpoint, fallbackName, "admin"); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Dosya indirilemedi."); }
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 dark:bg-gray-900 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h1 className="flex items-center gap-2 text-2xl font-semibold text-gray-900 dark:text-gray-100"><ClipboardList className="h-7 w-7" /> Eğitim ve Sınavlar</h1><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Eğitimler doğrudan backend API üzerinden listelenir ve yönetilir.</p></div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void loadTrainings()} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"><RefreshCw className="h-4 w-4" /> Yenile</button>
            <button type="button" onClick={() => navigate("/admin/trainings/create")} className="inline-flex items-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900"><Plus className="h-4 w-4" /> Yeni Eğitim</button>
          </div>
        </div>
        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">{error}</div>}
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Eğitim adı veya kategori ara" className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-gray-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" /></div>
        <div className="overflow-visible rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          {loading ? <p className="p-8 text-center text-sm text-gray-500">Yükleniyor...</p> : visibleTrainings.length === 0 ? <p className="p-8 text-center text-sm text-gray-500">Eşleşen eğitim bulunamadı.</p> : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-900/50"><tr><th className="px-4 py-3">Eğitim</th><th className="px-4 py-3">Durum</th><th className="px-4 py-3">Katılımcı</th><th className="px-4 py-3">Akış</th><th className="px-4 py-3 text-right">İşlemler</th></tr></thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {visibleTrainings.map((training) => {
                    const status = getStatus(training);
                    const busy = busyId === training.id;
                    return (
                      <tr key={training.id} className="align-top">
                        <td className="px-4 py-4"><p className="font-semibold text-gray-900 dark:text-gray-100">{training.title}</p><p className="mt-1 text-xs text-gray-500">{training.category} · {training.durationMinutes} dk</p></td>
                        <td className="px-4 py-4"><button type="button" disabled={busy} onClick={() => void toggleTraining(training)} className={`rounded-full px-3 py-1 text-xs font-semibold ${status.className} disabled:opacity-50`}>{busy ? "İşleniyor" : status.label}</button></td>
                        <td className="px-4 py-4 text-gray-700 dark:text-gray-300">{training._count?.assignments ?? 0}</td>
                        <td className="px-4 py-4 text-xs text-gray-500">{training.hasTrainingContent ? "İçerik" : "İçeriksiz"}{training.hasExam ? " + Sınav" : ""}{training.hasCertificate ? " + Sertifika" : ""}</td>
                        <td className="relative px-4 py-4 text-right">
                          <details className="relative inline-block text-left">
                            <summary className="cursor-pointer list-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">İşlemler</summary>
                            <div className="absolute right-0 z-30 mt-1 w-56 rounded-lg border border-gray-200 bg-white p-1 text-left shadow-lg dark:border-gray-700 dark:bg-gray-800">
                              <button type="button" onClick={() => navigate(`/admin/trainings/${training.id}/edit`)} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700">Eğitimi Düzenle</button>
                              <button type="button" onClick={() => navigate(`/admin/trainings/${training.id}/participants`)} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700">Katılımcıları Yönet</button>
                              <button type="button" onClick={() => void download(`/exports/trainings/${training.id}/participants.pdf`, `${training.title}-katilimcilar.pdf`)} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700">Katılımcı Listesi PDF</button>
                              <button type="button" onClick={() => void download(`/exports/trainings/${training.id}/participants.xls`, `${training.title}-katilimcilar.xls`)} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700">Katılımcı Listesi Excel</button>
                              {training.hasExam && <><button type="button" onClick={() => void download(`/exports/trainings/${training.id}/results.pdf`, `${training.title}-sonuclar.pdf`)} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700">Sonuçlar PDF</button><button type="button" onClick={() => void download(`/pdf/training/${training.id}/exam`, `${training.title}-sinav.pdf`)} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700">Sınav PDF</button></>}
                              {training.hasAttendanceForm && <button type="button" onClick={() => navigate(`/admin/trainings/${training.id}/attendance-form`)} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700">Katılım Formu</button>}
                              <button type="button" disabled={busy} onClick={() => void deleteTraining(training)} className="block w-full rounded px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950/30">Eğitimi Sil</button>
                            </div>
                          </details>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminTestPage;
