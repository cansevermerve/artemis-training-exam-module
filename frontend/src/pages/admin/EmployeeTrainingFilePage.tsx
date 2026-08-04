import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Award,
  Download,
  Eye,
  FileArchive,
  FileCheck2,
  RefreshCw,
  Upload,
  UserRound,
} from "lucide-react";

import { ProtectedAssetImage } from "../../components/ProtectedAssetImage";
import {
  adminApiRequest,
  downloadProtectedDocument,
  openProtectedDocument,
  uploadBinary,
} from "../../lib/api";
import type { UserSummary } from "../../types/api";

type FileAttempt = {
  id: string;
  attemptNumber: number;
  status: "IN_PROGRESS" | "PASSED" | "FAILED" | "TIMED_OUT";
  score: number | null;
  passed: boolean | null;
  startedAt: string;
  submittedAt: string | null;
  correctCount: number | null;
  wrongCount: number | null;
  unansweredCount: number | null;
  answers: Array<{
    id: string;
    isCorrect: boolean | null;
    earnedPoints: number;
    answeredAt: string | null;
    selectedOptions: Array<{ optionId: string }>;
    question: {
      id: string;
      text: string;
      points: number;
      order: number;
      options: Array<{
        id: string;
        text: string | null;
        imageUrl: string | null;
        order: number;
        isCorrect: boolean;
      }>;
    };
  }>;
};

type PersonalDocument = {
  id: string;
  employeeId: string | null;
  trainingId: string;
  assignmentId: string | null;
  attemptId: string | null;
  type: "PARTICIPANT_ANSWER" | "SIGNED_EXAM" | "OSGB_CERTIFICATE" | "OTHER";
  status: string;
  title: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  documentDate: string | null;
  isGenerated: boolean;
  createdAt: string;
};

type ParticipantTrainingFile = {
  employee: UserSummary;
  training: {
    id: string;
    title: string;
    category: string;
    hasExam: boolean;
    passingScore: number;
  };
  assignment: {
    id: string;
    trainingId: string;
    userId: string;
    status: string;
    assignedAt: string;
    dueDate: string | null;
    contentCompletedAt: string | null;
    completedAt: string | null;
    cancelledAt: string | null;
    cancellationReason: string | null;
    attempts: FileAttempt[];
  };
  documents: PersonalDocument[];
};

type UploadType = "SIGNED_EXAM" | "OSGB_CERTIFICATE" | "OTHER";

function attemptLabel(status: FileAttempt["status"]): string {
  if (status === "PASSED") return "Başarılı";
  if (status === "FAILED") return "Başarısız";
  if (status === "TIMED_OUT") return "Süre Doldu";
  return "Devam Ediyor";
}

function documentLabel(type: PersonalDocument["type"]): string {
  if (type === "PARTICIPANT_ANSWER") return "Sınav Cevapları PDF";
  if (type === "SIGNED_EXAM") return "İmzalı Sınav";
  if (type === "OSGB_CERTIFICATE") return "OSGB Sertifikası";
  return "Diğer Çalışan Belgesi";
}

type AnswerDisplayOption = FileAttempt["answers"][number]["question"]["options"][number];

function AnswerOptionItems({
  options,
  emptyLabel,
}: {
  options: AnswerDisplayOption[];
  emptyLabel: string;
}) {
  if (options.length === 0) {
    return <span>{emptyLabel}</span>;
  }

  return (
    <span className="mt-1 block space-y-2">
      {options.map((option) => (
        <span
          key={option.id}
          className="block rounded-lg border border-gray-200 p-2 dark:border-gray-700"
        >
          <span className="block">
            {String.fromCharCode(64 + option.order)}.{" "}
            {option.text || (option.imageUrl ? "Görsel şık" : "Metin bulunmuyor")}
          </span>
          <ProtectedAssetImage
            endpoint={option.imageUrl}
            actor="admin"
            alt={`${String.fromCharCode(64 + option.order)} şıkkı görseli`}
            className="mt-2 max-h-40 max-w-full rounded-md object-contain"
          />
        </span>
      ))}
    </span>
  );
}

function EmployeeTrainingFilePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const certificateUploadRequested = searchParams.get("upload") === "certificate";
  const { id: trainingId, employeeId } = useParams<{
    id: string;
    employeeId: string;
  }>();
  const [data, setData] = useState<ParticipantTrainingFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [uploadType, setUploadType] = useState<UploadType>("SIGNED_EXAM");
  const [selectedAttemptId, setSelectedAttemptId] = useState("");
  const [documentDate, setDocumentDate] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);

  const loadFile = useCallback(async () => {
    if (!trainingId || !employeeId) {
      setError("Eğitim veya çalışan kimliği bulunamadı.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await adminApiRequest<ParticipantTrainingFile>(
        `/trainings/${trainingId}/participants/${employeeId}/file`
      );
      setData(response);
      const passedAttempt = response.assignment.attempts.find(
        (attempt) => attempt.status === "PASSED" && attempt.passed === true
      );
      setUploadType((current) => {
        if (!response.training.hasExam) return "OTHER";
        if (certificateUploadRequested && passedAttempt) return "OSGB_CERTIFICATE";
        return current;
      });
      setSelectedAttemptId((current) => {
        if (certificateUploadRequested && passedAttempt) return passedAttempt.id;
        if (current && response.assignment.attempts.some((attempt) => attempt.id === current)) {
          return current;
        }
        return response.assignment.attempts.find(
          (attempt) => attempt.status !== "IN_PROGRESS"
        )?.id ?? "";
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Katılımcının eğitim dosyası yüklenemedi."
      );
    } finally {
      setLoading(false);
    }
  }, [certificateUploadRequested, employeeId, trainingId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadFile(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadFile]);

  const completedAttempts = useMemo(
    () =>
      data?.assignment.attempts.filter(
        (attempt) => attempt.status !== "IN_PROGRESS"
      ) ?? [],
    [data]
  );


  const eligibleCertificateAttempts = useMemo(
    () =>
      completedAttempts.filter(
        (attempt) =>
          attempt.status === "PASSED" && attempt.passed === true
      ),
    [completedAttempts]
  );

  const latestAttempt = data?.assignment.attempts[0];
  const certificate = data?.documents.find(
    (document) => document.type === "OSGB_CERTIFICATE"
  );
  const signedExamCount =
    data?.documents.filter((document) => document.type === "SIGNED_EXAM").length ?? 0;
  const isArchived = Boolean(data?.assignment.cancelledAt);

  function changeUploadType(nextType: UploadType) {
    setUploadType(nextType);
    if (nextType === "OSGB_CERTIFICATE") {
      setSelectedAttemptId(eligibleCertificateAttempts[0]?.id ?? "");
    } else if (nextType === "SIGNED_EXAM") {
      setSelectedAttemptId(completedAttempts[0]?.id ?? "");
    } else {
      setSelectedAttemptId("");
    }
  }

  async function uploadDocument() {
    if (!data || !employeeId || !selectedFile) {
      setError("Yüklenecek dosyayı seçin.");
      return;
    }
    if (data.assignment.cancelledAt) {
      setError("Eğitimden çıkarılmış katılımcının arşiv dosyasına yeni belge yüklenemez.");
      return;
    }

    const allowedMimeTypes = new Set([
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/webp",
    ]);
    if (
      !allowedMimeTypes.has(selectedFile.type) ||
      selectedFile.size > 25 * 1024 * 1024
    ) {
      setError(
        "Belge PDF, PNG, JPEG veya WebP olmalı ve 25 MB sınırını aşmamalıdır."
      );
      return;
    }

    const selectedAttempt = data.assignment.attempts.find(
      (attempt) => attempt.id === selectedAttemptId
    );
    if (uploadType === "SIGNED_EXAM" && !selectedAttempt) {
      setError("İmzalı sınavın bağlanacağı tamamlanmış denemeyi seçin.");
      return;
    }
    if (
      uploadType === "OSGB_CERTIFICATE" &&
      (!selectedAttempt ||
        !eligibleCertificateAttempts.some((attempt) => attempt.id === selectedAttempt.id))
    ) {
      setError(
        "OSGB sertifikası yalnızca başarılı bir sınav denemesine yüklenebilir."
      );
      return;
    }
    if (uploadType === "OSGB_CERTIFICATE" && selectedFile.type !== "application/pdf") {
      setError("OSGB sertifikası PDF olmalıdır.");
      return;
    }

    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      const endpoint =
        uploadType === "OSGB_CERTIFICATE"
          ? `/employees/${employeeId}/osgb-certificates`
          : `/employees/${employeeId}/documents`;
      const headers: Record<string, string> = {
        "x-training-id": data.training.id,
        "x-assignment-id": data.assignment.id,
        "x-document-type": uploadType,
        "x-document-title": encodeURIComponent(
          `${data.training.title} - ${documentLabel(uploadType)}`
        ),
      };
      if (selectedAttemptId) headers["x-attempt-id"] = selectedAttemptId;
      if (documentDate) headers["x-document-date"] = documentDate;

      await uploadBinary(endpoint, selectedFile, headers, "admin");
      setSelectedFile(null);
      setDocumentDate("");
      setFileInputKey((current) => current + 1);
      setMessage(
        `${documentLabel(uploadType)} yalnızca ${data.employee.name ?? "çalışan"} / ${data.training.title} dosyasına kaydedildi.`
      );
      await loadFile();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Belge yüklenemedi."
      );
    } finally {
      setUploading(false);
    }
  }

  async function downloadAnswers(attempt: FileAttempt) {
    if (!data) return;
    setDownloadBusy(attempt.id);
    setError(null);
    try {
      await downloadProtectedDocument(
        `/pdf/attempt/${attempt.id}/participant-answers`,
        `${data.employee.name ?? "katilimci"}-${data.training.title}-cevaplar.pdf`,
        "admin"
      );
      await loadFile();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Sınav cevapları PDF'i indirilemedi."
      );
    } finally {
      setDownloadBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 text-sm text-gray-500 dark:bg-gray-900">
        Katılımcı eğitim dosyası yükleniyor...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 dark:bg-gray-900 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <button
              type="button"
              onClick={() => navigate(`/admin/trainings/${trainingId}/participants`)}
              className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300"
            >
              <ArrowLeft className="h-4 w-4" /> Katılımcılar Sayfasına Dön
            </button>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">
              <UserRound className="h-7 w-7" /> {data?.employee.name ?? "Katılımcı"}
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {data?.training.title ?? "Eğitim"} — kişisel eğitim ve sınav dosyası
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadFile()}
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
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900/20 dark:bg-emerald-900/20 dark:text-emerald-300">
            {message}
          </div>
        )}
        {data?.assignment.cancelledAt && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
            Bu kayıt eğitimden çıkarılmış katılımcının salt okunur arşiv dosyasıdır.
            {data.assignment.cancellationReason
              ? ` ${data.assignment.cancellationReason}`
              : ""}
          </div>
        )}

        {!data ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800">
            Katılımcı bu eğitimde bulunamadı.
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                    {data.employee.name ?? "İsimsiz çalışan"}
                  </h2>
                  <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                    <p><span className="text-gray-500">E-posta:</span> {data.employee.email ?? "—"}</p>
                    <p><span className="text-gray-500">Görev:</span> {data.employee.title ?? "—"}</p>
                    <p><span className="text-gray-500">Departman:</span> {data.employee.department ?? "—"}</p>
                  </div>
                </div>
                <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm dark:bg-gray-900/50">
                  <p className="font-medium text-gray-900 dark:text-gray-100">{data.training.title}</p>
                  <p className="mt-1 text-xs text-gray-500">{data.training.category}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              {[
                ["İçerik", data.assignment.contentCompletedAt ? "Tamamlandı" : "Bekliyor"],
                ["Deneme", data.assignment.attempts.length],
                ["Son Puan", latestAttempt?.score ?? "—"],
                ...(eligibleCertificateAttempts.length > 0
                  ? [["Sertifika", certificate ? "Yüklendi" : "Yüklenmedi"]]
                  : []),
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
                >
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <h2 className="flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100">
                <Upload className="h-4 w-4" /> Kişiye Özel Belge Yükle
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {isArchived
                  ? "Arşiv kaydı görüntülenebilir ve indirilebilir; yeni belge eklenemez."
                  : `Belge otomatik olarak ${data.employee.name ?? "katılımcı"} ve ${data.training.title} kaydına bağlanır. Ortak katılım formu burada yüklenmez.`}
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                <select
                  value={uploadType}
                  onChange={(event) => changeUploadType(event.target.value as UploadType)}
                  disabled={isArchived}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                >
                  {data.training.hasExam && <option value="SIGNED_EXAM">İmzalı Sınav</option>}
                  {eligibleCertificateAttempts.length > 0 && <option value="OSGB_CERTIFICATE">OSGB Sertifikası</option>}
                  <option value="OTHER">Diğer Kişisel Belge</option>
                </select>
                <select
                  value={selectedAttemptId}
                  onChange={(event) => setSelectedAttemptId(event.target.value)}
                  disabled={isArchived || completedAttempts.length === 0}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                >
                  <option value="">{uploadType === "OTHER" ? "Deneme seçimi isteğe bağlı" : "Sınav denemesi seçin"}</option>
                  {(uploadType === "OSGB_CERTIFICATE"
                    ? eligibleCertificateAttempts
                    : completedAttempts
                  ).map((attempt) => (
                    <option key={attempt.id} value={attempt.id}>
                      {attempt.attemptNumber}. deneme — {attemptLabel(attempt.status)} — {attempt.score ?? "—"} puan
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={documentDate}
                  onChange={(event) => setDocumentDate(event.target.value)}
                  disabled={isArchived}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                />
                <input
                  key={fileInputKey}
                  type="file"
                  accept={
                    uploadType === "OSGB_CERTIFICATE"
                      ? "application/pdf"
                      : "application/pdf,image/png,image/jpeg,image/webp"
                  }
                  onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                  disabled={isArchived}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                />
              </div>
              <button
                type="button"
                disabled={isArchived || uploading || !selectedFile}
                onClick={() => void uploadDocument()}
                className="mt-4 rounded-lg bg-gray-800 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {uploading ? "Yükleniyor..." : "Belgeyi Kaydet"}
              </button>
            </div>

            {data.training.hasExam && (
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <h2 className="flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100">
                <FileCheck2 className="h-5 w-5" /> Sınav Sonuçları ve Cevapları
              </h2>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {data.assignment.attempts.map((attempt) => (
                  <div key={attempt.id} className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">
                          {attempt.attemptNumber}. Sınav Denemesi
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {new Date(attempt.startedAt).toLocaleString("tr-TR")}
                        </p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${attempt.status === "PASSED" ? "bg-emerald-50 text-emerald-700" : attempt.status === "IN_PROGRESS" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>
                        {attemptLabel(attempt.status)}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-300 sm:grid-cols-4">
                      <p>Puan: {attempt.score ?? "—"}</p>
                      <p>Doğru: {attempt.correctCount ?? "—"}</p>
                      <p>Yanlış: {attempt.wrongCount ?? "—"}</p>
                      <p>Boş: {attempt.unansweredCount ?? "—"}</p>
                    </div>
                    {attempt.status !== "IN_PROGRESS" && (
                      <>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(`/admin/results/${attempt.id}`)}
                          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 dark:border-gray-600 dark:text-gray-200"
                        >
                          <Eye className="h-4 w-4" /> Sonuç Sayfasını Aç
                        </button>
                        <button
                          type="button"
                          disabled={downloadBusy === attempt.id}
                          onClick={() => void downloadAnswers(attempt)}
                          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200"
                        >
                          <Download className="h-4 w-4" /> Cevap PDF'i
                        </button>
                      </div>
                      <details className="mt-4 rounded-lg border border-gray-200 dark:border-gray-700">
                        <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                          Sınav cevaplarını aç ({attempt.answers.length} soru)
                        </summary>
                        <div className="divide-y divide-gray-100 border-t border-gray-200 dark:divide-gray-700 dark:border-gray-700">
                          {attempt.answers.map((answer) => {
                            const selectedIds = new Set(
                              answer.selectedOptions.map((option) => option.optionId)
                            );
                            const selectedOptions = answer.question.options.filter(
                              (option) => selectedIds.has(option.id)
                            );
                            const correctOptions = answer.question.options.filter(
                              (option) => option.isCorrect
                            );
                            return (
                              <div key={answer.id} className="p-3 text-sm">
                                <div className="flex items-start justify-between gap-3">
                                  <p className="font-medium text-gray-900 dark:text-gray-100">
                                    {answer.question.order}. {answer.question.text}
                                  </p>
                                  <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${answer.isCorrect ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                                    {answer.isCorrect ? "Doğru" : selectedOptions.length ? "Yanlış" : "Boş"}
                                  </span>
                                </div>
                                <div className="mt-2 text-xs text-gray-600 dark:text-gray-300">
                                  <span className="font-medium">Verilen cevap:</span>
                                  <AnswerOptionItems
                                    options={selectedOptions}
                                    emptyLabel="Cevap verilmedi"
                                  />
                                </div>
                                <div className="mt-2 text-xs text-gray-600 dark:text-gray-300">
                                  <span className="font-medium">Doğru cevap:</span>
                                  <AnswerOptionItems
                                    options={correctOptions}
                                    emptyLabel="Doğru cevap kaydı bulunamadı"
                                  />
                                </div>
                                <p className="mt-2 text-xs text-gray-500">
                                  Kazanılan puan: {answer.earnedPoints}/{answer.question.points}
                                </p>
                              </div>
                            );
                          })}
                          {attempt.answers.length === 0 && (
                            <p className="p-3 text-sm text-gray-500">Cevap kaydı bulunmuyor.</p>
                          )}
                        </div>
                      </details>
                      </>
                    )}
                  </div>
                ))}
                {data.assignment.attempts.length === 0 && (
                  <p className="text-sm text-gray-500">Henüz sınav denemesi bulunmuyor.</p>
                )}
              </div>
            </div>
            )}

            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-center gap-2 border-b border-gray-200 p-5 dark:border-gray-700">
                <FileArchive className="h-5 w-5" />
                <div>
                  <h2 className="font-semibold text-gray-900 dark:text-gray-100">Kişisel Belgeler</h2>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Yalnızca {data.training.title} için imzalı sınav, cevap PDF'i ve sertifika kayıtları.
                  </p>
                </div>
              </div>
              {data.documents.length === 0 ? (
                <p className="p-8 text-center text-sm text-gray-500">Bu eğitim için kişisel belge bulunmuyor.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                    <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-900/50">
                      <tr>
                        <th className="px-4 py-3">Belge</th>
                        <th className="px-4 py-3">Tür</th>
                        <th className="px-4 py-3">Deneme</th>
                        <th className="px-4 py-3">Tarih</th>
                        <th className="px-4 py-3 text-right">İşlem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {data.documents.map((document) => {
                        const attempt = data.assignment.attempts.find(
                          (item) => item.id === document.attemptId
                        );
                        return (
                          <tr key={document.id}>
                            <td className="px-4 py-4">
                              <p className="font-medium text-gray-900 dark:text-gray-100">{document.title}</p>
                              <p className="mt-1 text-xs text-gray-500">{document.originalName}</p>
                            </td>
                            <td className="px-4 py-4 text-xs text-gray-600 dark:text-gray-300">
                              <span className="inline-flex items-center gap-1">
                                {document.type === "OSGB_CERTIFICATE" && <Award className="h-3.5 w-3.5" />}
                                {documentLabel(document.type)}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-xs text-gray-600 dark:text-gray-300">
                              {attempt ? `${attempt.attemptNumber}. deneme` : "—"}
                            </td>
                            <td className="px-4 py-4 text-xs text-gray-600 dark:text-gray-300">
                              {new Date(document.documentDate ?? document.createdAt).toLocaleDateString("tr-TR")}
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => void openProtectedDocument(`/documents/${document.id}/preview`, "admin").catch((requestError: unknown) => setError(requestError instanceof Error ? requestError.message : "Belge açılamadı."))}
                                  className="rounded-lg border border-gray-300 p-2 text-gray-600 dark:border-gray-600 dark:text-gray-300"
                                  title="Görüntüle"
                                >
                                  <Eye className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void downloadProtectedDocument(`/documents/${document.id}/download`, document.originalName, "admin").catch((requestError: unknown) => setError(requestError instanceof Error ? requestError.message : "Belge indirilemedi."))}
                                  className="rounded-lg border border-gray-300 p-2 text-gray-600 dark:border-gray-600 dark:text-gray-300"
                                  title="İndir"
                                >
                                  <Download className="h-4 w-4" />
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
            </div>

            <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200">
              Bu dosyada başka eğitimlerin belgeleri gösterilmez. İmzalı katılım formu ise kişisel belge olmadığı için bu ekranda yer almaz.
              {signedExamCount > 0 ? ` Bu eğitim için ${signedExamCount} imzalı sınav kaydı bulunmaktadır.` : ""}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default EmployeeTrainingFilePage;
