import { useNavigate } from "react-router-dom";
import {
  Calendar,
  CheckCircle,
  FileText,
  GraduationCap,
  PlayCircle,
} from "lucide-react";

export type TestCardModel = {
  id: string;
  title: string;
  dueDate: string | null;
  assignedAt: string;
  status: string;
  trainingCompleted: boolean;
  examCompleted: boolean;
  hasExam: boolean;
  canStartExam: boolean;
  overallCompleted: boolean;
  certificateReady: boolean;
  resultAttemptId: string | null;
};

type TestCardProps = {
  test: TestCardModel;
};

function TestCard({ test }: TestCardProps) {
  const navigate = useNavigate();

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700/30">
      <div className="space-y-4">
        <div>
          <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
            {test.title}
          </h3>

          <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <Calendar className="h-4 w-4 shrink-0" />
            <span>
              Son Tarih:{" "}
              {test.dueDate
                ? new Date(test.dueDate).toLocaleDateString("tr-TR")
                : "Belirtilmedi"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <button
            type="button"
            onClick={() => navigate(`/training/${test.id}`)}
            className="rounded-xl border border-gray-200 bg-white p-3 text-left transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
          >
            <div className="flex items-center gap-2">
              <PlayCircle className="h-4 w-4 text-gray-600 dark:text-gray-300" />
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                Eğitim
              </p>
            </div>
            <p className="mt-2 text-xs text-gray-400">
              {test.trainingCompleted ? "Tamamlandı" : "İçeriği görüntüle"}
            </p>
          </button>

          <button
            type="button"
            disabled={!test.canStartExam}
            onClick={() => navigate(`/test/${test.id}`)}
            className="rounded-xl border border-gray-200 bg-white p-3 text-left transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
          >
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-gray-600 dark:text-gray-300" />
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                Sınav
              </p>
            </div>
            <p className="mt-2 text-xs text-gray-400">
              {!test.hasExam
                ? "Bu eğitimde sınav yok"
                : !test.trainingCompleted
                  ? "Önce eğitimi tamamlayın"
                  : test.examCompleted
                    ? "Başarıyla tamamlandı"
                    : test.canStartExam
                      ? "Sınava başla"
                      : "Deneme hakkı bulunmuyor"}
            </p>
          </button>

          <button
            type="button"
            disabled={!test.resultAttemptId}
            onClick={() =>
              test.resultAttemptId && navigate(`/result/${test.resultAttemptId}`)
            }
            className="rounded-xl border border-gray-200 bg-white p-3 text-left transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
          >
            <div className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-gray-600 dark:text-gray-300" />
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                {test.examCompleted ? "Sonuç / Sertifika" : "Sonuç"}
              </p>
            </div>
            <p className="mt-2 text-xs text-gray-400">
              {test.certificateReady
                ? "Sertifika hazır"
                : test.examCompleted
                  ? "Sertifika hazırlanıyor"
                  : test.resultAttemptId
                    ? "Sonucu görüntüle"
                    : "Sınavdan sonra açılır"}
            </p>
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            ["Eğitim", test.trainingCompleted],
            ["Sınav", test.examCompleted],
            ...(test.examCompleted ? [["Sertifika", test.certificateReady]] : []),
          ].map(([label, completed]) => (
            <span
              key={String(label)}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${
                completed
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
              }`}
            >
              {completed && <CheckCircle className="h-3 w-3" />}
              {label}
            </span>
          ))}

          <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
            {test.status}
          </span>
        </div>
      </div>
    </div>
  );
}

export default TestCard;
