import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle, ExternalLink, FileText, PlayCircle } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { useProtectedObjectUrl } from "../hooks/useProtectedObjectUrl";
import { apiRequest, openProtectedDocument } from "../lib/api";
import type { TrainingAssignment, TrainingContent } from "../types/api";

const configuredNonVideoMinimumViewSeconds = Number.parseInt(
  String(import.meta.env.VITE_NON_VIDEO_MINIMUM_VIEW_SECONDS ?? "10"),
  10
);
const NON_VIDEO_MINIMUM_VIEW_SECONDS = Number.isFinite(configuredNonVideoMinimumViewSeconds)
  ? Math.min(3600, Math.max(1, configuredNonVideoMinimumViewSeconds))
  : 10;

type ContentCardProps = {
  assignmentId: string;
  content: TrainingContent;
  completed: boolean;
  onUpdated: (assignment: TrainingAssignment) => void;
  onError: (message: string) => void;
};

function ContentCard({ assignmentId, content, completed, onUpdated, onError }: ContentCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const [nonVideoCanComplete, setNonVideoCanComplete] = useState(false);
  const { url: protectedUrl, error: protectedError } = useProtectedObjectUrl(
    isOpen && content.type === "VIDEO" ? content.fileUrl : null
  );
  const watchedSecondsRef = useRef(0);
  const lastPlayTickRef = useRef<number | null>(null);
  const lastSentAtRef = useRef(0);
  const maxPositionRef = useRef(0);

  async function updateProgress(payload: {
    isCompleted?: boolean;
    lastPositionSeconds?: number;
    watchedSeconds?: number;
  }) {
    setIsSaving(true);
    try {
      const updated = await apiRequest<TrainingAssignment>(
        `/assignments/${encodeURIComponent(assignmentId)}/contents/${encodeURIComponent(content.id)}/progress`,
        { method: "PUT", body: JSON.stringify(payload) }
      );
      onUpdated(updated);
    } catch (error) {
      onError(error instanceof Error ? error.message : "İçerik ilerlemesi kaydedilemedi.");
      throw error;
    } finally {
      setIsSaving(false);
    }
  }

  async function openContent() {
    onError("");

    if (content.type === "VIDEO") {
      if (!openedAt) {
        setOpenedAt(Date.now());
        await updateProgress({ isCompleted: false, lastPositionSeconds: 0, watchedSeconds: 0 }).catch(() => undefined);
      }
      setIsOpen(true);
      return;
    }

    try {
      if (content.fileUrl) {
        await openProtectedDocument(content.fileUrl);
      } else if (content.externalUrl) {
        const openedWindow = window.open(
          content.externalUrl,
          "_blank",
          "noopener,noreferrer"
        );
        if (!openedWindow) {
          throw new Error("İçerik penceresi tarayıcı tarafından engellendi.");
        }
      } else {
        throw new Error("İçerik dosyası veya bağlantısı bulunamadı.");
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : "İçerik açılamadı.");
      return;
    }

    if (!openedAt) {
      setOpenedAt(Date.now());
      window.setTimeout(
        () => setNonVideoCanComplete(true),
        NON_VIDEO_MINIMUM_VIEW_SECONDS * 1_000
      );
      await updateProgress({
        isCompleted: false,
        lastPositionSeconds: 0,
        watchedSeconds: 0,
      }).catch(() => undefined);
    }
  }

  function accumulateWatchTime() {
    const now = Date.now();
    if (lastPlayTickRef.current !== null) {
      watchedSecondsRef.current += Math.max(0, Math.floor((now - lastPlayTickRef.current) / 1000));
    }
    lastPlayTickRef.current = now;
  }

  async function handleVideoProgress(video: HTMLVideoElement, complete = false) {
    accumulateWatchTime();
    maxPositionRef.current = Math.max(maxPositionRef.current, video.currentTime);
    const duration = Math.floor(video.duration || content.durationSeconds || 0);
    const watched = complete ? Math.max(watchedSecondsRef.current, duration) : watchedSecondsRef.current;
    await updateProgress({
      isCompleted: complete,
      lastPositionSeconds: complete ? duration : Math.floor(video.currentTime),
      watchedSeconds: watched,
    }).catch(() => undefined);
  }

  return (
    <article className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{content.title}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {content.type} {content.isRequired ? "• Zorunlu" : "• Opsiyonel"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(content.fileUrl || content.externalUrl) && (
            <button type="button" onClick={() => void openContent()} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
              <ExternalLink className="h-4 w-4" />
              {content.type === "VIDEO" && isOpen ? "Video Açık" : "İçeriği Aç"}
            </button>
          )}
          {content.type !== "VIDEO" && (
            <button
              type="button"
              disabled={completed || isSaving || !nonVideoCanComplete}
              onClick={() => void updateProgress({ isCompleted: true })}
              title={!openedAt ? "Önce içeriği açın" : !nonVideoCanComplete ? "İçeriği incelemeye devam edin" : undefined}
              className="inline-flex items-center gap-2 rounded-lg bg-gray-800 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCircle className="h-4 w-4" />
              {completed ? "Tamamlandı" : isSaving ? "Kaydediliyor..." : "Tamamlandı Olarak İşaretle"}
            </button>
          )}
        </div>
      </div>

      {content.type === "VIDEO" && isOpen && (
        <div className="mt-4">
          {protectedUrl ? (
            <video
              controls
              preload="metadata"
              src={protectedUrl}
              className="max-h-[520px] w-full rounded-lg bg-black"
              onPlay={(event) => {
                event.currentTarget.playbackRate = 1;
                lastPlayTickRef.current = Date.now();
              }}
              onPause={(event) => {
                accumulateWatchTime();
                void handleVideoProgress(event.currentTarget);
                lastPlayTickRef.current = null;
              }}
              onRateChange={(event) => { event.currentTarget.playbackRate = 1; }}
              onSeeking={(event) => {
                const video = event.currentTarget;
                if (video.currentTime > maxPositionRef.current + 5) video.currentTime = maxPositionRef.current;
              }}
              onTimeUpdate={(event) => {
                const now = Date.now();
                maxPositionRef.current = Math.max(maxPositionRef.current, event.currentTarget.currentTime);
                if (now - lastSentAtRef.current >= 5_000) {
                  lastSentAtRef.current = now;
                  void handleVideoProgress(event.currentTarget);
                }
              }}
              onEnded={(event) => void handleVideoProgress(event.currentTarget, true)}
            />
          ) : (
            <p className="text-xs text-gray-500">Video hazırlanıyor...</p>
          )}
          {protectedError && <p className="mt-2 text-xs text-red-600">Video yüklenemedi: {protectedError}</p>}
          {completed && <p className="mt-2 text-xs font-medium text-emerald-600">Video tamamlandı.</p>}
        </div>
      )}
    </article>
  );
}

function TrainingPage() {
  const navigate = useNavigate();
  const { id: assignmentId } = useParams<{ id: string }>();
  const [assignment, setAssignment] = useState<TrainingAssignment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!assignmentId) return;
    const controller = new AbortController();
    void apiRequest<TrainingAssignment>(`/assignments/${encodeURIComponent(assignmentId)}`, { signal: controller.signal })
      .then(setAssignment)
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setErrorMessage(error instanceof Error ? error.message : "Eğitim yüklenemedi.");
      })
      .finally(() => setIsLoading(false));
    return () => controller.abort();
  }, [assignmentId]);

  const completedContentIds = useMemo(() => new Set(assignment?.contentProgress.filter((progress) => progress.isCompleted).map((progress) => progress.contentId) ?? []), [assignment]);

  if (!assignmentId) return <div className="min-h-screen bg-gray-100 p-8 dark:bg-gray-900"><div className="mx-auto max-w-xl rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">Atama ID&apos;si bulunamadı.</div></div>;
  if (isLoading) return <div className="min-h-screen bg-gray-100 p-8 text-center text-sm text-gray-500 dark:bg-gray-900 dark:text-gray-300">Eğitim yükleniyor...</div>;
  if (!assignment) return <div className="min-h-screen bg-gray-100 p-8 dark:bg-gray-900"><div className="mx-auto max-w-xl rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{errorMessage || "Eğitim ataması bulunamadı."}</div></div>;

  const { training } = assignment;
  const contents = training.contents ?? [];
  const completionTargets = training.mustCompleteContent
    ? contents.filter((content) => content.isRequired)
    : training.hasExam ? [] : contents;
  const contentCompleted = completionTargets.every((content) => completedContentIds.has(content.id));
  const passedAttempt = assignment.attempts.find((attempt) => attempt.status === "PASSED");
  const activeAttempt = assignment.attempts.find((attempt) => attempt.status === "IN_PROGRESS");
  const usedAttemptCount = assignment.attempts.filter((attempt) => attempt.status !== "IN_PROGRESS").length;
  const attemptAvailable = Boolean(activeAttempt) || usedAttemptCount < training.attemptLimit;

  return (
    <div className="min-h-screen bg-gray-100 p-4 dark:bg-gray-900 sm:p-8">
      <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">
        <div><h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 sm:text-2xl">{training.title}</h1><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{training.description || "Zorunlu içerikleri tamamladıktan sonra sınava erişebilirsiniz."}</p></div>
        {errorMessage && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">{errorMessage}</div>}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center gap-2"><PlayCircle className="h-5 w-5 text-gray-600 dark:text-gray-300" /><h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Eğitim İçerikleri</h2></div>
            {contents.length === 0 ? <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">Bu eğitim için ayrıca tamamlanması gereken dijital içerik bulunmuyor.</div> : contents.map((content) => <ContentCard key={content.id} assignmentId={assignment.id} content={content} completed={completedContentIds.has(content.id)} onUpdated={setAssignment} onError={setErrorMessage} />)}
          </div>
          <aside className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div><p className="text-xs text-gray-500 dark:text-gray-400">Süre</p><p className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">{training.durationMinutes} dakika</p></div>
            <div><p className="text-xs text-gray-500 dark:text-gray-400">Kategori</p><p className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">{training.category}</p></div>
            <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/50"><div className="flex items-center gap-2">{contentCompleted ? <CheckCircle className="h-5 w-5 text-emerald-600" /> : <FileText className="h-5 w-5 text-amber-600" />}<p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{contentCompleted ? "Eğitim içeriği tamamlandı" : "Zorunlu içerikler bekleniyor"}</p></div></div>
            <button type="button" disabled={!contentCompleted || Boolean(passedAttempt) || !training.hasExam || !attemptAvailable} onClick={() => navigate(`/test/${assignment.id}`)} className="w-full rounded-lg bg-gray-800 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-50">{!training.hasExam ? "Bu Eğitimde Sınav Yok" : passedAttempt ? "Sınav Başarıyla Tamamlandı" : !contentCompleted ? "Önce Eğitimi Tamamlayın" : !attemptAvailable ? "Deneme Hakkı Kalmadı" : activeAttempt ? "Sınava Devam Et" : "Sınava Başla"}</button>
            {passedAttempt && <button type="button" onClick={() => navigate(`/result/${passedAttempt.id}`)} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">Sonucu Görüntüle</button>}
          </aside>
        </div>
      </div>
    </div>
  );
}

export default TrainingPage;
