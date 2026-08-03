import { useEffect, useMemo, useState } from "react";
import { CheckCircle, ChevronLeft, ChevronRight, ClipboardList, Clock, Search } from "lucide-react";

import TestCard, { type TestCardModel } from "../components/TestCard";
import { apiRequest } from "../lib/api";
import type { TrainingAssignment } from "../types/api";

function toCardModel(assignment: TrainingAssignment): TestCardModel {
  const passedAttempt = [...assignment.attempts]
    .reverse()
    .find((attempt) => attempt.status === "PASSED");
  const latestFinishedAttempt = [...assignment.attempts]
    .reverse()
    .find((attempt) => attempt.status !== "IN_PROGRESS");
  const requiredContents = assignment.training.contents?.filter(
    (content) => content.isRequired
  ) ?? [];
  const completedContentIds = new Set(
    assignment.contentProgress
      .filter((progress) => progress.isCompleted)
      .map((progress) => progress.contentId)
  );
  const completionTargets = assignment.training.mustCompleteContent
    ? requiredContents
    : assignment.training.hasExam
      ? []
      : assignment.training.contents ?? [];
  const trainingCompleted = completionTargets.every((content) =>
    completedContentIds.has(content.id)
  );
  const finishedAttempts = assignment.attempts.filter(
    (attempt) => attempt.status !== "IN_PROGRESS"
  );
  const hasActiveAttempt = assignment.attempts.some(
    (attempt) => attempt.status === "IN_PROGRESS"
  );
  const canStartExam =
    assignment.training.hasExam &&
    trainingCompleted &&
    !passedAttempt &&
    (hasActiveAttempt || finishedAttempts.length < assignment.training.attemptLimit) &&
    assignment.status !== "EXPIRED" &&
    assignment.status !== "CANCELLED";
  const certificateReady = assignment.documents.some(
    (document) => document.type === "OSGB_CERTIFICATE"
  );

  const statusLabels: Record<TrainingAssignment["status"], string> = {
    ASSIGNED: "Başlamadı",
    IN_PROGRESS: "Devam Ediyor",
    COMPLETED: "Tamamlandı",
    FAILED: "Başarısız",
    EXPIRED: "Süresi Doldu",
    CANCELLED: "İptal Edildi",
  };

  return {
    id: assignment.id,
    title: assignment.training.title,
    dueDate: assignment.dueDate,
    assignedAt: assignment.assignedAt,
    status: statusLabels[assignment.status],
    trainingCompleted,
    examCompleted: Boolean(passedAttempt),
    hasExam: assignment.training.hasExam,
    canStartExam,
    overallCompleted:
      assignment.status === "COMPLETED" ||
      (assignment.training.hasExam ? Boolean(passedAttempt) : trainingCompleted),
    certificateReady,
    resultAttemptId: passedAttempt?.id ?? latestFinishedAttempt?.id ?? null,
  };
}

function EmployeeDashboard() {
  const [assignments, setAssignments] = useState<TrainingAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("dueDate");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [showAssignedTests, setShowAssignedTests] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function loadAssignments() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const data = await apiRequest<TrainingAssignment[]>(
          "/users/me/assignments",
          { signal: controller.signal }
        );
        setAssignments(data);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Atanmış eğitimler yüklenemedi."
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadAssignments();
    return () => controller.abort();
  }, []);

  const tests = useMemo(() => assignments.map(toCardModel), [assignments]);

  const sortedTests = useMemo(() => {
    const normalizedSearch = searchTerm.toLocaleLowerCase("tr");
    const filtered = tests.filter((test) => {
      const matchesSearch = test.title
        .toLocaleLowerCase("tr")
        .includes(normalizedSearch);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "completed" && test.overallCompleted) ||
        (statusFilter === "pending" &&
          !test.overallCompleted &&
          test.status !== "Başarısız" &&
          test.status !== "Süresi Doldu") ||
        (statusFilter === "failed" &&
          (test.status === "Başarısız" || test.status === "Süresi Doldu"));
      return matchesSearch && matchesStatus;
    });

    return [...filtered].sort((first, second) => {
      if (sortBy === "dueDate") {
        const firstDate = first.dueDate
          ? new Date(first.dueDate).getTime()
          : Number.MAX_SAFE_INTEGER;
        const secondDate = second.dueDate
          ? new Date(second.dueDate).getTime()
          : Number.MAX_SAFE_INTEGER;
        return firstDate - secondDate;
      }

      return (
        new Date(second.assignedAt).getTime() -
        new Date(first.assignedAt).getTime()
      );
    });
  }, [searchTerm, sortBy, statusFilter, tests]);

  const totalPages = Math.max(1, Math.ceil(sortedTests.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedTests = useMemo(
    () => sortedTests.slice((safePage - 1) * pageSize, safePage * pageSize),
    [pageSize, safePage, sortedTests]
  );

  const cards = [
    { label: "Toplam Test", value: tests.length, icon: ClipboardList },
    {
      label: "Bekleyen",
      value: tests.filter((test) => !test.overallCompleted).length,
      icon: Clock,
    },
    {
      label: "Tamamlanan",
      value: tests.filter((test) => test.overallCompleted).length,
      icon: CheckCircle,
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-gray-100 sm:text-2xl">
          <ClipboardList className="h-6 w-6 text-gray-700 dark:text-gray-300" />
          Artemis Test Module
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Size atanmış eğitim ve sınavları gerçek sistem kayıtları üzerinden takip edin.
        </p>
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[520px] grid-cols-3 gap-3 sm:min-w-0 sm:gap-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800 sm:p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-gray-50 p-2.5 dark:bg-gray-900/50">
                    <Icon className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {card.label}
                    </p>
                    <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      {card.value}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          {errorMessage}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <button
          type="button"
          onClick={() => setShowAssignedTests((current) => !current)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <div>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Atanmış Testler
            </h2>
            <p className="mt-1 text-xs text-gray-400">
              Eğitim içeriği, sınav ve sertifika durumunu görüntüleyin.
            </p>
          </div>
          <span className="text-sm font-semibold text-gray-500">
            {showAssignedTests ? "▲" : "▼"}
          </span>
        </button>

        {showAssignedTests && (
          <div className="border-t border-gray-200 p-4 dark:border-gray-700">
            <div className="grid gap-3 md:grid-cols-[1fr_160px_150px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Eğitim veya test ara..."
                  value={searchTerm}
                  onChange={(event) => {
                    setSearchTerm(event.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-lg border border-gray-200 bg-white px-9 py-2 text-sm text-gray-900 outline-none focus:border-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 outline-none focus:border-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              >
                <option value="all">Tüm durumlar</option>
                <option value="pending">Bekleyen</option>
                <option value="completed">Tamamlanan</option>
                <option value="failed">Başarısız / süresi dolmuş</option>
              </select>

              <select
                value={sortBy}
                onChange={(event) => {
                  setSortBy(event.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 outline-none focus:border-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              >
                <option value="dueDate">Son Tarih</option>
                <option value="newest">En Yeni</option>
              </select>

            </div>

            <div className="mt-4 space-y-3">
              {isLoading ? (
                <div className="py-8 text-center text-sm text-gray-400">
                  Eğitimler yükleniyor...
                </div>
              ) : sortedTests.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400">
                  Eşleşen atanmış eğitim bulunamadı.
                </div>
              ) : (
                pagedTests.map((test) => <TestCard key={test.id} test={test} />)
              )}
            </div>
            {!isLoading && sortedTests.length > 0 && (
              <div className="mt-4 flex flex-col gap-2 border-t border-gray-200 pt-4 text-xs text-gray-500 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  {(safePage - 1) * pageSize + 1}-
                  {Math.min(safePage * pageSize, sortedTests.length)} / {sortedTests.length} kayıt
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 font-semibold disabled:opacity-40 dark:border-gray-600"
                  >
                    <ChevronLeft className="h-4 w-4" /> Önceki
                  </button>
                  <span>{safePage} / {totalPages}</span>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 font-semibold disabled:opacity-40 dark:border-gray-600"
                  >
                    Sonraki <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default EmployeeDashboard;
