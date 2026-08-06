import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Eye,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";

import {
  adminApiRequest,
  downloadProtectedDocument,
  openProtectedDocument,
} from "../../lib/api";
import type { Training } from "../../types/api";

type AdminTraining = Training & {
  createdById?: string;
  createdAt?: string;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  showCorrectAnswers?: boolean;
};

type TrainingStatusFilter = "ALL" | "ACTIVE" | "INACTIVE" | "DRAFT";

type PaginatedTrainings = {
  items: AdminTraining[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

function getStatus(training: AdminTraining) {
  if (training.isDraft) {
    return { label: "Taslak", className: "bg-amber-50 text-amber-700" };
  }
  if (training.isActive) {
    return { label: "Aktif", className: "bg-emerald-50 text-emerald-700" };
  }
  return { label: "Pasif", className: "bg-gray-100 text-gray-600" };
}

function AdminTestPage() {
  const navigate = useNavigate();
  const [trainings, setTrainings] = useState<AdminTraining[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TrainingStatusFilter>("ALL");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const loadTrainings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        status: statusFilter,
      });
      if (debouncedQuery) params.set("q", debouncedQuery);
      const result = await adminApiRequest<PaginatedTrainings>(
        `/trainings?${params.toString()}`
      );
      setTrainings(result.items);
      setTotal(result.total);
      setTotalPages(result.totalPages);
      if (result.page !== page) setPage(result.page);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Eğitim listesi yüklenemedi."
      );
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, page, pageSize, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadTrainings(), 0);
    return () => window.clearTimeout(timer);
  }, [loadTrainings]);

  async function toggleTraining(training: AdminTraining) {
    setBusyId(training.id);
    setError(null);
    try {
      await adminApiRequest<AdminTraining>(`/trainings/${training.id}`, {
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
            hasAttendanceForm: training.hasAttendanceForm,
          },
          exam: training.hasExam
            ? {
                passingScore: training.passingScore,
                attemptLimit: training.attemptLimit,
                durationMinutes: training.examDurationMinutes,
                shuffleQuestions: Boolean(training.shuffleQuestions),
                shuffleOptions: Boolean(training.shuffleOptions),
                showCorrectAnswersAfterExam: Boolean(training.showCorrectAnswers),
              }
            : null,
        }),
      });
      await loadTrainings();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Eğitimin durumu güncellenemedi."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function deleteTraining(training: AdminTraining) {
    if (!window.confirm(`“${training.title}” eğitimini silmek istiyor musunuz?`)) {
      return;
    }
    setBusyId(training.id);
    setError(null);
    try {
      await adminApiRequest(`/trainings/${training.id}`, { method: "DELETE" });
      const nextPage = trainings.length === 1 && page > 1 ? page - 1 : page;
      if (nextPage !== page) setPage(nextPage);
      else await loadTrainings();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Eğitim silinemedi."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function download(endpoint: string, fallbackName: string) {
    setError(null);
    try {
      await downloadProtectedDocument(endpoint, fallbackName, "admin");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Dosya indirilemedi."
      );
    }
  }

  async function preview(endpoint: string) {
    setError(null);
    try {
      await openProtectedDocument(endpoint, "admin");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Önizleme açılamadı."
      );
    }
  }

  const firstItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, total);

  return (
    <div className="min-h-screen bg-gray-100 p-4 dark:bg-gray-900 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">
              <ClipboardList className="h-7 w-7" /> Eğitim ve Sınavlar
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Eğitim kayıtlarını görüntüleyebilir, durumlarını yönetebilir ve ilgili işlemlere erişebilirsiniz.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void loadTrainings()}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
            >
              <RefreshCw className="h-4 w-4" /> Yenile
            </button>
            <button
              type="button"
              onClick={() => navigate("/admin/trainings/create")}
              className="inline-flex items-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900"
            >
              <Plus className="h-4 w-4" /> Yeni Eğitim
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="grid gap-3 md:grid-cols-[1fr_180px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Eğitim adı, kategori veya açıklama ara"
                className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-4 text-sm outline-none focus:border-gray-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as TrainingStatusFilter);
                setPage(1);
              }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-gray-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="ALL">Tüm durumlar</option>
              <option value="ACTIVE">Aktif</option>
              <option value="INACTIVE">Pasif</option>
              <option value="DRAFT">Taslak</option>
            </select>
          </div>
        </div>

        <div className="overflow-visible rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          {loading ? (
            <p className="p-8 text-center text-sm text-gray-500">Yükleniyor...</p>
          ) : trainings.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-500">
              Eşleşen eğitim bulunamadı.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-4 py-3">Eğitim</th>
                    <th className="px-4 py-3">Durum</th>
                    <th className="px-4 py-3">Katılımcı</th>
                    <th className="px-4 py-3">Akış</th>
                    <th className="px-4 py-3 text-right">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {trainings.map((training) => {
                    const status = getStatus(training);
                    const busy = busyId === training.id;
                    return (
                      <tr key={training.id} className="align-top">
                        <td className="px-4 py-4">
                          <p className="font-semibold text-gray-900 dark:text-gray-100">
                            {training.title}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            {training.category} · {training.durationMinutes} dk
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void toggleTraining(training)}
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${status.className} disabled:opacity-50`}
                          >
                            {busy ? "İşleniyor" : status.label}
                          </button>
                        </td>
                        <td className="px-4 py-4 text-gray-700 dark:text-gray-300">
                          {training._count?.assignments ?? 0}
                        </td>
                        <td className="px-4 py-4 text-xs text-gray-500">
                          {training.hasTrainingContent ? "İçerik" : "İçeriksiz"}
                          {training.hasExam ? " + Sınav" : ""}
                        </td>
                        <td className="relative px-4 py-4 text-right">
                          <details className="relative inline-block text-left">
                            <summary className="cursor-pointer list-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
                              İşlemler
                            </summary>
                            <div className="absolute right-0 z-30 mt-1 w-56 rounded-lg border border-gray-200 bg-white p-1 text-left shadow-lg dark:border-gray-700 dark:bg-gray-800">
                              <button type="button" onClick={() => navigate(`/admin/trainings/${training.id}/edit`)} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700">Eğitimi Düzenle</button>
                              <button type="button" onClick={() => navigate(`/admin/trainings/${training.id}/participants`)} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700">Katılımcıları Yönet</button>
                              <details className="group">
                                <summary className="flex cursor-pointer list-none items-center justify-between rounded px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700">
                                  <span>Katılımcıları İndir</span>
                                  <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
                                </summary>
                                <div className="ml-3 border-l border-gray-200 pl-2 dark:border-gray-700">
                                  <button type="button" onClick={() => void preview(`/exports/trainings/${training.id}/participants.pdf`)} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700"><Eye className="h-3.5 w-3.5" /> PDF'yi önizle</button>
                                  <button type="button" onClick={() => void download(`/exports/trainings/${training.id}/participants.pdf`, `${training.title}-katilimcilar.pdf`)} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700">PDF olarak indir</button>
                                  <button type="button" onClick={() => void download(`/exports/trainings/${training.id}/participants.xls`, `${training.title}-katilimcilar.xls`)} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700">Excel olarak indir</button>
                                </div>
                              </details>
                              {training.hasExam && (
                                <>
                                  <details className="group">
                                    <summary className="flex cursor-pointer list-none items-center justify-between rounded px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700">
                                      <span>Sonuçları İndir</span>
                                      <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
                                    </summary>
                                    <div className="ml-3 border-l border-gray-200 pl-2 dark:border-gray-700">
                                      <button type="button" onClick={() => void preview(`/exports/trainings/${training.id}/results.pdf`)} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700"><Eye className="h-3.5 w-3.5" /> PDF'yi önizle</button>
                                      <button type="button" onClick={() => void download(`/exports/trainings/${training.id}/results.pdf`, `${training.title}-sonuclar.pdf`)} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700">PDF olarak indir</button>
                                      <button type="button" onClick={() => void download(`/exports/trainings/${training.id}/results.xls`, `${training.title}-sonuclar.xls`)} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700">Excel olarak indir</button>
                                    </div>
                                  </details>
                                  <button type="button" onClick={() => navigate(`/admin/trainings/${training.id}/exam-preview`)} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700"><Eye className="h-3.5 w-3.5" /> Sınavı Önizle</button>
                                  <button type="button" onClick={() => void download(`/pdf/training/${training.id}/exam`, `${training.title}-sinav.pdf`)} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700">Sınavı İndir</button>
                                </>
                              )}
                              {training.hasAttendanceForm && (
                                <button type="button" onClick={() => navigate(`/admin/trainings/${training.id}/attendance-form`)} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700">Katılım Formu</button>
                              )}
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

          <div className="flex flex-col gap-3 border-t border-gray-200 px-4 py-3 text-sm text-gray-500 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between">
            <span>
              {total === 0 ? "0 kayıt" : `${firstItem}-${lastItem} / ${total} kayıt`}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-40 dark:border-gray-600 dark:text-gray-200"
              >
                <ChevronLeft className="h-4 w-4" /> Önceki
              </button>
              <span className="min-w-20 text-center text-xs font-medium">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-40 dark:border-gray-600 dark:text-gray-200"
              >
                Sonraki <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminTestPage;
