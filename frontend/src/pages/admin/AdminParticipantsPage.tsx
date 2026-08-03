import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileDown,
  FileSignature,
  FileSpreadsheet,
  FileText,
  PencilLine,
  RefreshCw,
  Save,
  Search,
  Upload,
  UserRound,
  UsersRound,
} from "lucide-react";

import { AdminResultCorrectionModal } from "../../components/admin/AdminResultCorrectionModal";
import { useUnsavedChangesWarning } from "../../hooks/useUnsavedChangesWarning";
import {
  adminApiRequest,
  downloadProtectedDocument,
  openProtectedDocument,
  uploadBinary,
} from "../../lib/api";
import type { AttemptSummary, DocumentSummary, Training, UserSummary } from "../../types/api";

type ParticipantAttempt = AttemptSummary & { documents?: DocumentSummary[] };
type ParticipantAssignment = {
  id: string;
  userId: string;
  status: string;
  assignedAt: string;
  dueDate: string | null;
  contentCompletedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  user: UserSummary & { isActive?: boolean };
  attempts: ParticipantAttempt[];
  documents: DocumentSummary[];
};
type ActiveUser = UserSummary & { role?: string | null; isActive: boolean };
type PaginatedUsers = {
  items: ActiveUser[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
type ParticipantStatusFilter =
  | "ALL"
  | "PASSED"
  | "FAILED"
  | "IN_PROGRESS"
  | "NOT_STARTED";
type CommonDocument = DocumentSummary & {
  documentDate?: string | null;
  mimeType?: string;
};

function latestAttempt(assignment: ParticipantAssignment) {
  return [...assignment.attempts].sort(
    (left, right) => right.attemptNumber - left.attemptNumber
  )[0];
}

function latestCompletedAttempt(assignment: ParticipantAssignment) {
  return [...assignment.attempts]
    .filter((attempt) => attempt.status !== "IN_PROGRESS")
    .sort((left, right) => right.attemptNumber - left.attemptNumber)[0];
}

function attemptLabel(status: ParticipantAttempt["status"]): string {
  if (status === "PASSED") return "Başarılı";
  if (status === "FAILED") return "Başarısız";
  if (status === "TIMED_OUT") return "Süre Doldu";
  return "Devam Ediyor";
}

function documentLabel(type: string): string {
  if (type === "ATTENDANCE_FORM") return "Katılım Formu";
  if (type === "SIGNED_ATTENDANCE_FORM") return "İmzalı Katılım Formu";
  return type;
}

function assignmentLabel(status: string): string {
  if (status === "ASSIGNED") return "Atandı";
  if (status === "IN_PROGRESS") return "Devam Ediyor";
  if (status === "COMPLETED") return "Tamamlandı";
  if (status === "FAILED") return "Başarısız";
  if (status === "EXPIRED") return "Süresi Doldu";
  if (status === "CANCELLED") return "İptal Edildi";
  return status;
}

function AdminParticipantsPage() {
  const navigate = useNavigate();
  const { id: trainingId } = useParams<{ id: string }>();
  const [training, setTraining] = useState<Training | null>(null);
  const [assignments, setAssignments] = useState<ParticipantAssignment[]>([]);
  const [archivedAssignments, setArchivedAssignments] = useState<ParticipantAssignment[]>([]);
  const [users, setUsers] = useState<ActiveUser[]>([]);
  const [commonDocuments, setCommonDocuments] = useState<CommonDocument[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [debouncedUserSearch, setDebouncedUserSearch] = useState("");
  const [userPage, setUserPage] = useState(1);
  const [userPageSize, setUserPageSize] = useState(20);
  const [userTotal, setUserTotal] = useState(0);
  const [userTotalPages, setUserTotalPages] = useState(1);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [participantSearch, setParticipantSearch] = useState("");
  const [participantStatus, setParticipantStatus] =
    useState<ParticipantStatusFilter>("ALL");
  const [participantPage, setParticipantPage] = useState(1);
  const [participantPageSize, setParticipantPageSize] = useState(10);
  const [dueDate, setDueDate] = useState("");
  const [signedAttendanceFile, setSignedAttendanceFile] = useState<File | null>(null);
  const [signedAttendanceDate, setSignedAttendanceDate] = useState("");
  const [attendanceInputKey, setAttendanceInputKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [documentBusy, setDocumentBusy] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState<string | null>(null);
  const [correctionAttemptId, setCorrectionAttemptId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadPage = useCallback(async () => {
    if (!trainingId) {
      setError("Eğitim kimliği bulunamadı.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [trainingData, assignmentData, documentData] = await Promise.all([
        adminApiRequest<Training>(`/trainings/${trainingId}`),
        adminApiRequest<ParticipantAssignment[]>(
          `/trainings/${trainingId}/assignments?includeCancelled=true`
        ),
        adminApiRequest<CommonDocument[]>(`/trainings/${trainingId}/documents`),
      ]);
      const activeAssignments = assignmentData.filter(
        (assignment) => !assignment.cancelledAt && assignment.status !== "CANCELLED"
      );
      const cancelledAssignments = assignmentData.filter(
        (assignment) => Boolean(assignment.cancelledAt) || assignment.status === "CANCELLED"
      );
      setTraining(trainingData);
      setAssignments(activeAssignments);
      setArchivedAssignments(cancelledAssignments);
      setCommonDocuments(documentData);
      setSelectedUserIds(activeAssignments.map((assignment) => assignment.userId));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Katılımcı ekranı yüklenemedi."
      );
    } finally {
      setLoading(false);
    }
  }, [trainingId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPage(), 0);
    return () => window.clearTimeout(timer);
  }, [loadPage]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedUserSearch(userSearch.trim());
      setUserPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [userSearch]);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const params = new URLSearchParams({
        page: String(userPage),
        pageSize: String(userPageSize),
      });
      if (debouncedUserSearch) params.set("q", debouncedUserSearch);
      const result = await adminApiRequest<PaginatedUsers>(
        `/users?${params.toString()}`
      );
      setUsers(result.items);
      setUserTotal(result.total);
      setUserTotalPages(result.totalPages);
      if (userPage > result.totalPages) setUserPage(result.totalPages);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Çalışan listesi yüklenemedi."
      );
    } finally {
      setLoadingUsers(false);
    }
  }, [debouncedUserSearch, userPage, userPageSize]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadUsers(), 0);
    return () => window.clearTimeout(timer);
  }, [loadUsers]);

  const summary = useMemo(
    () => ({
      passed: assignments.filter((assignment) =>
        assignment.attempts.some((attempt) => attempt.status === "PASSED")
      ).length,
      completedContent: assignments.filter(
        (assignment) => assignment.contentCompletedAt
      ).length,
    }),
    [assignments]
  );

  const assignedUserIds = useMemo(
    () => new Set(assignments.map((assignment) => assignment.userId)),
    [assignments]
  );
  const selectedUserIdSet = useMemo(
    () => new Set(selectedUserIds),
    [selectedUserIds]
  );
  const selectionChanges = useMemo(() => {
    const added = selectedUserIds.filter((id) => !assignedUserIds.has(id)).length;
    const removed = assignments.filter(
      (assignment) => !selectedUserIdSet.has(assignment.userId)
    ).length;
    return { added, removed };
  }, [assignedUserIds, assignments, selectedUserIdSet, selectedUserIds]);

  const currentCommonDocuments = useMemo(() => {
    const latestByType = new Map<string, CommonDocument>();
    for (const document of commonDocuments) {
      if (!latestByType.has(document.type)) latestByType.set(document.type, document);
    }
    return [...latestByType.values()];
  }, [commonDocuments]);

  const participantManagementEnabled = Boolean(training?.isActive && !training?.isDraft);

  const filteredAssignments = useMemo(() => {
    const term = participantSearch.trim().toLocaleLowerCase("tr-TR");
    return assignments.filter((assignment) => {
      const attempt = latestAttempt(assignment);
      const matchesSearch =
        !term ||
        `${assignment.user.name ?? ""} ${assignment.user.email ?? ""} ${
          assignment.user.department ?? ""
        } ${assignment.user.title ?? ""}`
          .toLocaleLowerCase("tr-TR")
          .includes(term);
      const matchesStatus =
        participantStatus === "ALL" ||
        (participantStatus === "PASSED" &&
          assignment.attempts.some((item) => item.status === "PASSED")) ||
        (participantStatus === "FAILED" &&
          (assignment.status === "FAILED" ||
            attempt?.status === "FAILED" ||
            attempt?.status === "TIMED_OUT")) ||
        (participantStatus === "IN_PROGRESS" &&
          (assignment.status === "IN_PROGRESS" || attempt?.status === "IN_PROGRESS")) ||
        (participantStatus === "NOT_STARTED" &&
          assignment.attempts.length === 0 &&
          !assignment.contentCompletedAt);
      return matchesSearch && matchesStatus;
    });
  }, [assignments, participantSearch, participantStatus]);

  const participantTotalPages = Math.max(
    1,
    Math.ceil(filteredAssignments.length / participantPageSize)
  );
  const safeParticipantPage = Math.min(participantPage, participantTotalPages);
  const pagedAssignments = useMemo(
    () =>
      filteredAssignments.slice(
        (safeParticipantPage - 1) * participantPageSize,
        safeParticipantPage * participantPageSize
      ),
    [filteredAssignments, participantPageSize, safeParticipantPage]
  );

  const hasUnsavedChanges =
    !busy &&
    !documentBusy &&
    (selectionChanges.added > 0 ||
      selectionChanges.removed > 0 ||
      Boolean(dueDate) ||
      Boolean(signedAttendanceFile) ||
      Boolean(signedAttendanceDate));
  useUnsavedChangesWarning(hasUnsavedChanges);

  function confirmDiscardChanges(): boolean {
    return (
      !hasUnsavedChanges ||
      window.confirm(
        "Kaydedilmemiş katılımcı veya belge değişiklikleri var. Değişiklikleri silmek istiyor musunuz?"
      )
    );
  }

  function toggleUser(userId: string) {
    setSelectedUserIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId]
    );
  }

  async function saveParticipants() {
    if (!trainingId) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await adminApiRequest<ParticipantAssignment[]>(
        `/trainings/${trainingId}/assignments`,
        {
          method: "PUT",
          body: JSON.stringify({
            userIds: selectedUserIds,
            dueDate: dueDate || undefined,
          }),
        }
      );
      setDueDate("");
      await loadPage();
      setMessage("Katılımcı ekleme ve çıkarma işlemleri kaydedildi.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Katılımcılar güncellenemedi."
      );
    } finally {
      setBusy(false);
    }
  }

  async function uploadSignedAttendance() {
    if (!trainingId || !signedAttendanceFile) {
      setError("İmzalı katılım formu dosyasını seçin.");
      return;
    }
    const allowedMimeTypes = new Set([
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/webp",
    ]);
    if (
      !allowedMimeTypes.has(signedAttendanceFile.type) ||
      signedAttendanceFile.size > 25 * 1024 * 1024
    ) {
      setError(
        "İmzalı katılım formu PDF, PNG, JPEG veya WebP olmalı ve 25 MB sınırını aşmamalıdır."
      );
      return;
    }

    setDocumentBusy(true);
    setError(null);
    setMessage(null);
    try {
      await uploadBinary(
        `/trainings/${trainingId}/documents/signed-attendance`,
        signedAttendanceFile,
        {
          "x-document-title": encodeURIComponent(
            `${training?.title ?? "Eğitim"} İmzalı Katılım Formu`
          ),
          ...(signedAttendanceDate
            ? { "x-document-date": signedAttendanceDate }
            : {}),
        },
        "admin"
      );
      setSignedAttendanceFile(null);
      setSignedAttendanceDate("");
      setAttendanceInputKey((current) => current + 1);
      setMessage(
        `İmzalı katılım formu yalnızca “${training?.title ?? "bu eğitim"}” ortak belgelerine kaydedildi.`
      );
      setCommonDocuments(
        await adminApiRequest<CommonDocument[]>(
          `/trainings/${trainingId}/documents`
        )
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "İmzalı katılım formu yüklenemedi."
      );
    } finally {
      setDocumentBusy(false);
    }
  }

  async function downloadFile(endpoint: string, fallbackName: string, key: string) {
    setDownloadBusy(key);
    setError(null);
    try {
      await downloadProtectedDocument(endpoint, fallbackName, "admin");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Dosya indirilemedi."
      );
    } finally {
      setDownloadBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 dark:bg-gray-900 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <button
              type="button"
              onClick={() => navigate("/admin/trainings")}
              className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-300"
            >
              <ArrowLeft className="h-4 w-4" /> Eğitimlere Dön
            </button>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {training?.title ?? "Eğitim"} — Katılımcılar ve Belgeler
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Bu sayfadaki tüm kayıtlar yalnızca seçili eğitime aittir.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { if (confirmDiscardChanges()) void loadPage(); }}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          >
            <RefreshCw className="h-4 w-4" /> Yenile
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}
        {message && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300">
            {message}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["Katılımcı", assignments.length],
            ["İçeriği Tamamlayan", summary.completedContent],
            ["Başarılı", summary.passed],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
            >
              <p className="text-xs text-gray-500">{label}</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
                {value}
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100">
                <CheckSquare className="h-5 w-5" /> Katılımcıları Yönet
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Kutuyu işaretleyerek eğitime ekleyin; işareti kaldırarak eğitimden çıkarın.
              </p>
            </div>
            <div className="text-xs text-gray-500">
              {selectionChanges.added > 0 && (
                <span className="mr-3 text-emerald-700">+{selectionChanges.added} eklenecek</span>
              )}
              {selectionChanges.removed > 0 && (
                <span className="text-red-600">−{selectionChanges.removed} çıkarılacak</span>
              )}
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_240px]">
            <div>
              <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_130px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    value={userSearch}
                    onChange={(event) => setUserSearch(event.target.value)}
                    placeholder="Ad, e-posta, departman veya unvan ara"
                    className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  />
                </div>
                <select
                  value={userPageSize}
                  onChange={(event) => {
                    setUserPageSize(Number(event.target.value));
                    setUserPage(1);
                  }}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  aria-label="Sayfa başına çalışan"
                >
                  <option value={10}>10 kişi</option>
                  <option value={20}>20 kişi</option>
                  <option value={50}>50 kişi</option>
                </select>
              </div>
              <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
                {loadingUsers ? (
                  <p className="p-6 text-center text-sm text-gray-500">Çalışanlar yükleniyor...</p>
                ) : (
                  users.map((user) => {
                    const checked = selectedUserIdSet.has(user.id);
                    return (
                      <label
                        key={user.id}
                        className="flex cursor-pointer items-center gap-3 border-b border-gray-100 px-3 py-3 last:border-b-0 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900/40"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleUser(user.id)}
                          disabled={!participantManagementEnabled}
                          className="h-4 w-4 rounded border-gray-300 disabled:opacity-50"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                            {user.name ?? user.email ?? user.id}
                          </span>
                          <span className="block truncate text-xs text-gray-500">
                            {[user.department, user.title, user.email]
                              .filter(Boolean)
                              .join(" · ") || "Çalışan bilgisi bulunmuyor"}
                          </span>
                        </span>
                        {assignedUserIds.has(user.id) && (
                          <span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                            Kayıtlı
                          </span>
                        )}
                      </label>
                    );
                  })
                )}
                {!loadingUsers && users.length === 0 && (
                  <p className="p-6 text-center text-sm text-gray-500">Çalışan bulunamadı.</p>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-gray-500">
                <span>{userTotal} aktif çalışan</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={userPage <= 1 || loadingUsers}
                    onClick={() => setUserPage((current) => Math.max(1, current - 1))}
                    className="rounded-lg border border-gray-300 p-1.5 disabled:opacity-40 dark:border-gray-600"
                    title="Önceki çalışan sayfası"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span>{userPage} / {userTotalPages}</span>
                  <button
                    type="button"
                    disabled={userPage >= userTotalPages || loadingUsers}
                    onClick={() =>
                      setUserPage((current) => Math.min(userTotalPages, current + 1))
                    }
                    className="rounded-lg border border-gray-300 p-1.5 disabled:opacity-40 dark:border-gray-600"
                    title="Sonraki çalışan sayfası"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
                  Yeni eklenenler için son tarih
                </label>
                <input
                  type="datetime-local"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                />
              </div>
              <button
                type="button"
                disabled={busy || loading || !participantManagementEnabled}
                onClick={() => void saveParticipants()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gray-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {busy ? "Kaydediliyor..." : "Katılımcıları Kaydet"}
              </button>
              <p className="text-xs leading-5 text-gray-500">
                {participantManagementEnabled
                  ? "Geçmiş sınav veya belge kaydı bulunan kişiler silinmez; denetim izi korunarak eğitimden çıkarılır."
                  : "Katılımcı eklemek veya çıkarmak için eğitim yayınlanmış ve aktif olmalıdır."}
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-200 p-5 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <UsersRound className="h-5 w-5" />
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">Katılımcılar</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  Kişiye tıklayınca yalnızca bu eğitime ait sonucu, cevapları, imzalı sınavı ve sertifikası açılır.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-[1fr_180px_130px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={participantSearch}
                  onChange={(event) => {
                  setParticipantSearch(event.target.value);
                  setParticipantPage(1);
                }}
                  placeholder="Katılımcı adı, e-posta, departman veya unvan ara"
                  className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                />
              </div>
              <select
                value={participantStatus}
                onChange={(event) => {
                  setParticipantStatus(event.target.value as ParticipantStatusFilter);
                  setParticipantPage(1);
                }}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              >
                <option value="ALL">Tüm durumlar</option>
                <option value="PASSED">Başarılı</option>
                <option value="FAILED">Başarısız</option>
                <option value="IN_PROGRESS">Devam ediyor</option>
                <option value="NOT_STARTED">Başlamadı</option>
              </select>
              <select
                value={participantPageSize}
                onChange={(event) => {
                  setParticipantPageSize(Number(event.target.value));
                  setParticipantPage(1);
                }}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                aria-label="Sayfa başına katılımcı"
              >
                <option value={10}>10 kayıt</option>
                <option value={25}>25 kayıt</option>
                <option value={50}>50 kayıt</option>
              </select>
            </div>
          </div>
          {loading ? (
            <p className="p-8 text-center text-sm text-gray-500">Yükleniyor...</p>
          ) : filteredAssignments.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-500">
              Eşleşen katılımcı bulunmuyor.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-4 py-3">Çalışan</th>
                    <th className="px-4 py-3">İçerik</th>
                    <th className="px-4 py-3">Son Deneme</th>
                    <th className="px-4 py-3">Durum</th>
                    <th className="px-4 py-3 text-right">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {pagedAssignments.map((assignment) => {
                    const attempt = latestAttempt(assignment);
                    const completedAttempt = latestCompletedAttempt(assignment);
                    const personalFilePath = `/admin/trainings/${trainingId}/participants/${assignment.userId}`;
                    return (
                      <tr
                        key={assignment.id}
                        onClick={() => navigate(personalFilePath)}
                        className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900/30"
                      >
                        <td className="px-4 py-4">
                          <p className="font-semibold text-gray-900 dark:text-gray-100">
                            {assignment.user.name ?? "İsimsiz çalışan"}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            {assignment.user.email ?? assignment.userId}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                              assignment.contentCompletedAt
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {assignment.contentCompletedAt ? "Tamamlandı" : "Bekliyor"}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-gray-700 dark:text-gray-300">
                          {attempt ? (
                            <>
                              <p>{attemptLabel(attempt.status)}</p>
                              <p className="text-xs text-gray-500">
                                {attempt.score === null ? "Puan yok" : `${attempt.score}/100`}
                              </p>
                            </>
                          ) : (
                            "Girilmedi"
                          )}
                        </td>
                        <td className="px-4 py-4 text-xs text-gray-600 dark:text-gray-300">
                          {assignmentLabel(assignment.status)}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            {completedAttempt && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (confirmDiscardChanges()) {
                                    setCorrectionAttemptId(completedAttempt.id);
                                  }
                                }}
                                className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200"
                              >
                                <PencilLine className="h-4 w-4" /> Sonuç Düzelt
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                navigate(personalFilePath);
                              }}
                              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 dark:border-gray-600 dark:text-gray-200"
                            >
                              <UserRound className="h-4 w-4" /> Dosyayı Aç
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {filteredAssignments.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-gray-200 px-4 py-3 text-xs text-gray-500 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between">
              <span>
                {(safeParticipantPage - 1) * participantPageSize + 1}-
                {Math.min(safeParticipantPage * participantPageSize, filteredAssignments.length)} / {filteredAssignments.length} katılımcı
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safeParticipantPage <= 1}
                  onClick={() => setParticipantPage((current) => Math.max(1, current - 1))}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 font-semibold disabled:opacity-40 dark:border-gray-600"
                >
                  <ChevronLeft className="h-4 w-4" /> Önceki
                </button>
                <span>{safeParticipantPage} / {participantTotalPages}</span>
                <button
                  type="button"
                  disabled={safeParticipantPage >= participantTotalPages}
                  onClick={() =>
                    setParticipantPage((current) =>
                      Math.min(participantTotalPages, current + 1)
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 font-semibold disabled:opacity-40 dark:border-gray-600"
                >
                  Sonraki <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
          {archivedAssignments.length > 0 && (
            <details className="border-t border-gray-200 bg-gray-50/70 dark:border-gray-700 dark:bg-gray-900/30">
              <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">
                Eğitimden çıkarılan katılımcılar ({archivedAssignments.length})
              </summary>
              <div className="overflow-x-auto border-t border-gray-200 dark:border-gray-700">
                <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {archivedAssignments.map((assignment) => {
                      const personalFilePath = `/admin/trainings/${trainingId}/participants/${assignment.userId}`;
                      return (
                        <tr key={assignment.id} className="bg-white dark:bg-gray-800">
                          <td className="px-5 py-3">
                            <p className="font-medium text-gray-800 dark:text-gray-100">
                              {assignment.user.name ?? "İsimsiz çalışan"}
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                              {assignment.cancellationReason ?? "Eğitimden çıkarıldı"}
                            </p>
                          </td>
                          <td className="px-5 py-3 text-xs text-gray-500">
                            {assignment.cancelledAt
                              ? new Date(assignment.cancelledAt).toLocaleString("tr-TR")
                              : "—"}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => navigate(personalFilePath)}
                              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 dark:border-gray-600 dark:text-gray-200"
                            >
                              <UserRound className="h-4 w-4" /> Arşiv Dosyasını Aç
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100">
              <FileSignature className="h-5 w-5" /> Ortak Belgeler
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Buradaki katılım formu bütün katılımcıların imzaladığı tek belgedir ve yalnızca bu eğitime bağlıdır.
            </p>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
              <h3 className="font-medium text-gray-900 dark:text-gray-100">Katılım Formu</h3>
              <p className="mt-1 text-xs text-gray-500">
                Mevcut katılımcılarla resmî formu oluşturun ve imzaya çıkarın.
              </p>
              <button
                type="button"
                disabled={!training?.hasAttendanceForm}
                onClick={() => navigate(`/admin/trainings/${trainingId}/attendance-form`)}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200"
              >
                <FileText className="h-4 w-4" /> Formu Oluştur
              </button>
            </div>

            <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
              <h3 className="font-medium text-gray-900 dark:text-gray-100">
                İmzalı Katılım Formu
              </h3>
              <p className="mt-1 text-xs text-gray-500">
                Aynı formu her çalışan için ayrı ayrı değil, burada yalnızca bir kez yükleyin.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <input
                  key={attendanceInputKey}
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/webp"
                  onChange={(event) =>
                    setSignedAttendanceFile(event.target.files?.[0] ?? null)
                  }
                  disabled={!training?.hasAttendanceForm}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                />
                <input
                  type="date"
                  value={signedAttendanceDate}
                  onChange={(event) => setSignedAttendanceDate(event.target.value)}
                  disabled={!training?.hasAttendanceForm}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                />
              </div>
              <button
                type="button"
                disabled={documentBusy || !signedAttendanceFile || !training?.hasAttendanceForm}
                onClick={() => void uploadSignedAttendance()}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                {documentBusy ? "Yükleniyor..." : "İmzalı Formu Yükle"}
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
            {currentCommonDocuments.length === 0 ? (
              <p className="p-6 text-center text-sm text-gray-500">
                Bu eğitim için katılım formu belgesi bulunmuyor.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                  <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-900/50">
                    <tr>
                      <th className="px-4 py-3">Belge</th>
                      <th className="px-4 py-3">Tür</th>
                      <th className="px-4 py-3">Tarih</th>
                      <th className="px-4 py-3 text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {currentCommonDocuments.map((document) => (
                      <tr key={document.id}>
                        <td className="px-4 py-4">
                          <p className="font-medium text-gray-900 dark:text-gray-100">
                            {document.title}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            {document.originalName}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-xs text-gray-600 dark:text-gray-300">
                          {documentLabel(document.type)}
                        </td>
                        <td className="px-4 py-4 text-xs text-gray-600 dark:text-gray-300">
                          {new Date(
                            document.documentDate ?? document.createdAt
                          ).toLocaleDateString("tr-TR")}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                void openProtectedDocument(
                                  `/documents/${document.id}/preview`,
                                  "admin"
                                ).catch((requestError: unknown) =>
                                  setError(
                                    requestError instanceof Error
                                      ? requestError.message
                                      : "Belge açılamadı."
                                  )
                                )
                              }
                              className="rounded-lg border border-gray-300 p-2 text-gray-600 dark:border-gray-600 dark:text-gray-300"
                              title="Görüntüle"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              disabled={downloadBusy === document.id}
                              onClick={() =>
                                void downloadFile(
                                  `/documents/${document.id}/download`,
                                  document.originalName,
                                  document.id
                                )
                              }
                              className="rounded-lg border border-gray-300 p-2 text-gray-600 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300"
                              title="İndir"
                            >
                              <Download className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100">
            <FileDown className="h-5 w-5" /> Dışa Aktar
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Çıktılar yalnızca “{training?.title ?? "bu eğitim"}” katılımcılarını içerir.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                void downloadFile(
                  `/exports/trainings/${trainingId}/participants.pdf`,
                  `${training?.title ?? "egitim"}-katilimcilar.pdf`,
                  "participants-pdf"
                )
              }
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 dark:border-gray-600 dark:text-gray-200"
            >
              <FileText className="h-4 w-4" /> Katılımcı Listesi PDF
            </button>
            <button
              type="button"
              onClick={() =>
                void downloadFile(
                  `/exports/trainings/${trainingId}/participants.xls`,
                  `${training?.title ?? "egitim"}-katilimcilar.xls`,
                  "participants-xls"
                )
              }
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 dark:border-gray-600 dark:text-gray-200"
            >
              <FileSpreadsheet className="h-4 w-4" /> Katılımcı Listesi Excel
            </button>
            {training?.hasExam && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    void downloadFile(
                      `/exports/trainings/${trainingId}/results.pdf`,
                      `${training.title}-sonuclar.pdf`,
                      "results-pdf"
                    )
                  }
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 dark:border-gray-600 dark:text-gray-200"
                >
                  <FileText className="h-4 w-4" /> Sonuçlar PDF
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void downloadFile(
                      `/pdf/training/${trainingId}/exam`,
                      `${training.title}-sinav.pdf`,
                      "exam-pdf"
                    )
                  }
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 dark:border-gray-600 dark:text-gray-200"
                >
                  <Download className="h-4 w-4" /> Sınav PDF
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      {correctionAttemptId && (
        <AdminResultCorrectionModal
          attemptId={correctionAttemptId}
          onClose={() => setCorrectionAttemptId(null)}
          onSaved={(successMessage) => {
            setCorrectionAttemptId(null);
            setMessage(successMessage);
            setError(null);
            void loadPage();
          }}
        />
      )}
    </div>
  );
}

export default AdminParticipantsPage;
