import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ProtectedAssetImage } from "../../components/ProtectedAssetImage";
import {
  Field,
  FileUploadField,
  SectionCard,
  SwitchRow,
  inputClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from "../../components/admin/TrainingFormPrimitives";
import { useUnsavedChangesWarning } from "../../hooks/useUnsavedChangesWarning";
import { adminApiRequest } from "../../lib/api";
import { getVideoDurationSeconds, uploadTrainingAsset } from "../../services/training-admin.service";
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  Copy,
  Eye,
  FileText,
  Image as ImageIcon,
  ListChecks,
  Plus,
  Save,
  Trash2,
  Upload,
  Users,
  Video,
  X,
} from "lucide-react";

type QuestionType = "single" | "multiple";

type TrainingKind = "Zorunlu" | "Opsiyonel";

type TrainingFormat = "Yüz Yüze" | "Uzaktan" | "Hibrit";

type SaveMode = "draft" | "save" | "save-and-assign";

type Question = {
  id: string;
  text: string;
  explanation: string;
  type: QuestionType;
  points: number;
  options: string[];
  optionImageFiles: Array<File | null>;
  optionImageUrls: Array<string | null>;
  correctOptionIndexes: number[];
  imageFile: File | null;
  imageUrl?: string | null;
  isOpen: boolean;
};

type TrainingApiOption = {
  id: string;
  text: string | null;
  imageUrl: string | null;
  order: number;
  isCorrect: boolean;
};

type TrainingApiQuestion = {
  id: string;
  order: number;
  text: string | null;
  explanation: string | null;
  type: "SINGLE" | "MULTIPLE";
  points: number | null;
  options: TrainingApiOption[];
  imageUrl: string | null;
};

type TrainingApiRecord = {
  id: string;
  title: string | null;
  description: string | null;
  category: string | null;
  trainingKind: string | null;
  trainingFormat: string | null;
  trainingDate: string | null;
  startTime: string | null;
  durationMinutes: number | null;
  location: string | null;
  isDraft: boolean;
  isActive: boolean;
  hasTrainingContent: boolean;
  mustCompleteContent: boolean;
  hasExam: boolean;
  hasAttendanceForm: boolean;
  passingScore: number | null;
  attemptLimit: number | null;
  examDurationMinutes: number | null;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showCorrectAnswers: boolean;
  questions: TrainingApiQuestion[];
  contents?: TrainingApiContent[];
  coverImageUrl?: string | null;
};

type TrainingAssignmentForRecalculation = {
  attempts: Array<{ status: string; submittedAt?: string | null }>;
};

function correctAnswerMapFromForm(questions: Question[]): Record<string, number[]> {
  return Object.fromEntries(questions.map((question) => [question.id, [...question.correctOptionIndexes].sort()]));
}

type TrainingApiContent = {
  id: string;
  type: "VIDEO" | "PDF" | "IMAGE" | "LINK";
  title: string;
  fileUrl: string | null;
  externalUrl?: string | null;
  order: number;
  isRequired: boolean;
  durationSeconds?: number | null;
};

type ValidationIssue = {
  id: string;
  message: string;
  questionId?: string;
};

function configuredUploadLimit(name: string, fallback: number): number {
  const parsed = Number.parseInt(String(import.meta.env[name] ?? fallback), 10);
  return Number.isFinite(parsed) ? Math.min(2048, Math.max(1, parsed)) : fallback;
}

const DOCUMENT_UPLOAD_LIMIT_MB = configuredUploadLimit("VITE_DOCUMENT_UPLOAD_LIMIT_MB", 25);
const TRAINING_ASSET_LIMIT_MB = configuredUploadLimit("VITE_TRAINING_ASSET_UPLOAD_LIMIT_MB", 250);

function fileValidationMessage(
  file: File | null,
  label: string,
  acceptedMimeTypes: readonly string[],
  maximumMegabytes: number
): string | null {
  if (!file) return null;
  if (file.size <= 0) return `${label} boş bir dosya olamaz.`;
  if (file.size > maximumMegabytes * 1024 * 1024) {
    return `${label} en fazla ${maximumMegabytes} MB olabilir.`;
  }
  if (!acceptedMimeTypes.includes(file.type.toLowerCase())) {
    return `${label} desteklenmeyen bir dosya formatında.`;
  }
  return null;
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 9)}`;
}

function createQuestion(): Question {
  return {
    id: createId("question"),
    text: "",
    explanation: "",
    type: "single",
    points: 10,
    options: ["", ""],
    optionImageFiles: [null, null],
    optionImageUrls: [null, null],
    correctOptionIndexes: [],
    imageFile: null,
    imageUrl: null,
    isOpen: true,
  };
}

function optionHasContent(question: Question, optionIndex: number): boolean {
  return Boolean(
    question.options[optionIndex]?.trim() ||
    question.optionImageFiles[optionIndex] ||
    question.optionImageUrls[optionIndex]
  );
}

function isBlankQuestion(question: Question): boolean {
  return (
    !question.text.trim() &&
    !question.explanation.trim() &&
    question.options.every((option) => !option.trim()) &&
    question.optionImageFiles.every((file) => !file) &&
    question.optionImageUrls.every((url) => !url) &&
    question.correctOptionIndexes.length === 0 &&
    !question.imageFile &&
    !question.imageUrl
  );
}

function isPersistableQuestion(question: Question): boolean {
  const optionContentFlags = question.options.map((_, index) =>
    optionHasContent(question, index)
  );
  const normalizedTexts = question.options
    .map((option) => option.trim().toLocaleLowerCase("tr-TR"))
    .filter(Boolean);
  const correctIndexesAreValid = question.correctOptionIndexes.every(
    (index) => optionContentFlags[index]
  );
  const correctCountIsValid =
    question.type === "single"
      ? question.correctOptionIndexes.length === 1
      : question.correctOptionIndexes.length >= 1;

  return (
    Boolean(question.text.trim()) &&
    Number.isFinite(question.points) &&
    question.points > 0 &&
    optionContentFlags.length >= 2 &&
    optionContentFlags.every(Boolean) &&
    new Set(normalizedTexts).size === normalizedTexts.length &&
    correctIndexesAreValid &&
    correctCountIsValid
  );
}

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

function clampNumber(
  value: string,
  min: number,
  max: number,
  fallback: number
) {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsedValue));
}

function computeEndTime(
  startTime: string,
  durationHours: number,
  durationMinutes: number
) {
  if (!startTime) {
    return "--:--";
  }

  const [hoursPart, minutesPart] = startTime.split(":").map(Number);

  if (
    !Number.isFinite(hoursPart) ||
    !Number.isFinite(minutesPart) ||
    hoursPart < 0 ||
    hoursPart > 23 ||
    minutesPart < 0 ||
    minutesPart > 59
  ) {
    return "--:--";
  }

  const totalStartMinutes = hoursPart * 60 + minutesPart;
  const addedMinutes = durationHours * 60 + durationMinutes;
  const totalMinutes = (totalStartMinutes + addedMinutes) % 1440;

  return `${pad(Math.floor(totalMinutes / 60))}:${pad(
    totalMinutes % 60
  )}`;
}
function CreateTestPage() {
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const recoverySaveError = (routerLocation.state as { saveError?: string } | null)?.saveError ?? "";
  const { id } = useParams<{ id: string }>();

  const isEditMode = Boolean(id);


  // Eğitim bilgileri
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");

  const [trainingKind, setTrainingKind] =
    useState<TrainingKind>("Zorunlu");

  const [trainingFormat, setTrainingFormat] =
    useState<TrainingFormat>("Yüz Yüze");

  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");

  const [durationHours, setDurationHours] =
    useState(1);

  const [durationMinutes, setDurationMinutes] =
    useState(0);

  const [location, setLocation] = useState("");
  const [isActive, setIsActive] = useState(false);

  // Eğitim akışı
  const [hasTrainingContent, setHasTrainingContent] =
    useState(true);

  const [mustCompleteContent, setMustCompleteContent] =
    useState(true);

  const [hasExam, setHasExam] =
    useState(true);


  const [hasAttendanceForm, setHasAttendanceForm] =
    useState(true);

  // Eğitim dosyaları
  const [coverImage, setCoverImage] =
    useState<File | null>(null);

  const [videoFile, setVideoFile] =
    useState<File | null>(null);

  const [documentFile, setDocumentFile] =
    useState<File | null>(null);

  const [existingContentCount, setExistingContentCount] = useState(0);
  const [existingContents, setExistingContents] = useState<TrainingApiContent[]>([]);

  // Sınav ayarları
  const [passingScore, setPassingScore] =
    useState(70);

  const [attemptLimit, setAttemptLimit] =
    useState(1);

  const [examDurationMinutes, setExamDurationMinutes] =
    useState(30);

  const [shuffleQuestions, setShuffleQuestions] =
    useState(false);

  const [shuffleOptions, setShuffleOptions] =
    useState(false);

  const [
    showCorrectAnswersAfterExam,
    setShowCorrectAnswersAfterExam,
  ] = useState(false);


  // Sorular
  const [questions, setQuestions] =
    useState<Question[]>([
      createQuestion(),
    ]);

  // Form durumu
  const [
    validationIssues,
    setValidationIssues,
  ] = useState<ValidationIssue[]>([]);

  const [
    saveStatus,
    setSaveStatus,
  ] = useState<
    "idle" | "draft" | "success"
  >("idle");

  const [
    isPreviewOpen,
    setIsPreviewOpen,
  ] = useState(false);

  const [isLoadingTraining, setIsLoadingTraining] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [requestError, setRequestError] = useState(recoverySaveError);
  const [formReady, setFormReady] = useState(!id);
  const [baselineSnapshot, setBaselineSnapshot] = useState("");

  const formSnapshot = JSON.stringify({
    title,
    description,
    category,
    trainingKind,
    trainingFormat,
    date,
    startTime,
    durationHours,
    durationMinutes,
    location,
    isActive,
    hasTrainingContent,
    mustCompleteContent,
    hasExam,
    hasAttendanceForm,
    passingScore,
    attemptLimit,
    examDurationMinutes,
    shuffleQuestions,
    shuffleOptions,
    showCorrectAnswersAfterExam,
    coverImage: coverImage
      ? [coverImage.name, coverImage.size, coverImage.lastModified]
      : null,
    videoFile: videoFile
      ? [videoFile.name, videoFile.size, videoFile.lastModified]
      : null,
    documentFile: documentFile
      ? [documentFile.name, documentFile.size, documentFile.lastModified]
      : null,
    questions: questions.map((question) => ({
      text: question.text,
      explanation: question.explanation,
      type: question.type,
      points: question.points,
      options: question.options,
      optionImageUrls: question.optionImageUrls,
      correctOptionIndexes: question.correctOptionIndexes,
      imageUrl: question.imageUrl ?? null,
      imageFile: question.imageFile
        ? [
            question.imageFile.name,
            question.imageFile.size,
            question.imageFile.lastModified,
          ]
        : null,
      optionImageFiles: question.optionImageFiles.map((file) =>
        file ? [file.name, file.size, file.lastModified] : null
      ),
    })),
  });

  useEffect(() => {
    if (!formReady || isLoadingTraining || baselineSnapshot) return;
    const timer = window.setTimeout(() => setBaselineSnapshot(formSnapshot), 0);
    return () => window.clearTimeout(timer);
  }, [baselineSnapshot, formReady, formSnapshot, isLoadingTraining]);

  const hasUnsavedChanges =
    formReady &&
    !isSaving &&
    Boolean(baselineSnapshot) &&
    baselineSnapshot !== formSnapshot;

  useUnsavedChangesWarning(hasUnsavedChanges);

  useEffect(() => {
    if (!recoverySaveError) return;
    navigate(routerLocation.pathname, { replace: true, state: null });
  }, [navigate, recoverySaveError, routerLocation.pathname]);

  useEffect(() => {
    if (!id) {
      return;
    }

    const controller = new AbortController();

    async function loadTraining() {
      setBaselineSnapshot("");
      setFormReady(false);
      setIsLoadingTraining(true);

      try {
        const training = await adminApiRequest<TrainingApiRecord>(
          `/trainings/${id}`,
          { signal: controller.signal }
        );

        setTitle(training.title ?? "");
        setDescription(training.description ?? "");
        setCategory(training.category ?? "");
        setTrainingKind(
          training.trainingKind === "Opsiyonel" ? "Opsiyonel" : "Zorunlu"
        );
        setTrainingFormat(
          training.trainingFormat === "Uzaktan"
            ? "Uzaktan"
            : training.trainingFormat === "Hibrit"
              ? "Hibrit"
              : "Yüz Yüze"
        );
        setDate(training.trainingDate?.slice(0, 10) ?? "");
        setStartTime(training.startTime ?? "");
        setDurationHours(Math.floor((training.durationMinutes ?? 0) / 60));
        setDurationMinutes((training.durationMinutes ?? 0) % 60);
        setLocation(training.location ?? "");
        setIsActive(Boolean(training.isActive));
        setHasTrainingContent(Boolean(training.hasTrainingContent));
        setMustCompleteContent(Boolean(training.mustCompleteContent));
        setHasExam(Boolean(training.hasExam));
        setHasAttendanceForm(Boolean(training.hasAttendanceForm));
        setPassingScore(training.passingScore ?? 70);
        setAttemptLimit(training.attemptLimit ?? 1);
        setExamDurationMinutes(training.examDurationMinutes ?? 30);
        setShuffleQuestions(Boolean(training.shuffleQuestions));
        setShuffleOptions(Boolean(training.shuffleOptions));
        setShowCorrectAnswersAfterExam(Boolean(training.showCorrectAnswers));
        setExistingContentCount(training.contents?.length ?? 0);
        setExistingContents(training.contents ?? []);

        const loadedQuestions: Question[] = Array.isArray(training.questions)
          ? training.questions.map((question): Question => ({
              id: question.id,
              text: question.text ?? "",
              explanation: question.explanation ?? "",
              type: question.type === "MULTIPLE" ? "multiple" : "single",
              points: question.points ?? 10,
              options: Array.isArray(question.options)
                ? question.options.map((option) => option.text ?? "")
                : ["", ""],
              optionImageFiles: Array.isArray(question.options)
                ? question.options.map(() => null)
                : [null, null],
              optionImageUrls: Array.isArray(question.options)
                ? question.options.map((option) => option.imageUrl ?? null)
                : [null, null],
              correctOptionIndexes: Array.isArray(question.options)
                ? question.options.reduce(
                    (indexes: number[], option, optionIndex: number) => {
                      if (option.isCorrect) indexes.push(optionIndex);
                      return indexes;
                    },
                    []
                  )
                : [],
              imageFile: null,
              imageUrl: question.imageUrl,
              isOpen: false,
            }))
          : [];
        setQuestions(
          loadedQuestions.length > 0
            ? loadedQuestions.map((question: Question, index: number) => ({
                ...question,
                isOpen: index === 0,
              }))
            : [createQuestion()]
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setRequestError(
          error instanceof Error
            ? error.message
            : "Eğitim yüklenirken beklenmeyen bir hata oluştu."
        );
      } finally {
        setIsLoadingTraining(false);
        setFormReady(true);
      }
    }

    void loadTraining();

    return () => controller.abort();
  }, [id]);

  // Hesaplanan bitiş saati
  const computedEndTime = useMemo(
    () =>
      computeEndTime(
        startTime,
        durationHours,
        durationMinutes
      ),
    [
      startTime,
      durationHours,
      durationMinutes,
    ]
  );

  // Toplam sınav puanı
  const totalExamScore = useMemo(
    () =>
      questions.reduce(
        (total, question) =>
          total + question.points,
        0
      ),
    [questions]
  );

  function updateQuestion<K extends keyof Question>(
    questionId: string,
    field: K,
    value: Question[K]
  ) {
    setQuestions((currentQuestions) =>
      currentQuestions.map((question) =>
        question.id === questionId
          ? {
              ...question,
              [field]: value,
            }
          : question
      )
    );
  }


  function addQuestion() {
    setQuestions((currentQuestions) => [
      ...currentQuestions.map((question) => ({
        ...question,
        isOpen: false,
      })),
      createQuestion(),
    ]);
  }

  function duplicateQuestion(questionId: string) {
    setQuestions((currentQuestions) => {
      const sourceIndex =
        currentQuestions.findIndex(
          (question) =>
            question.id === questionId
        );

      if (sourceIndex === -1) {
        return currentQuestions;
      }

      const sourceQuestion =
        currentQuestions[sourceIndex];

      const copiedQuestion: Question = {
        ...sourceQuestion,
        id: createId("question"),
        options: [
          ...sourceQuestion.options,
        ],
        optionImageFiles: [...sourceQuestion.optionImageFiles],
        optionImageUrls: [...sourceQuestion.optionImageUrls],
        correctOptionIndexes: [
          ...sourceQuestion.correctOptionIndexes,
        ],
        isOpen: true,
      };

      const nextQuestions =
        currentQuestions.map(
          (question) => ({
            ...question,
            isOpen: false,
          })
        );

      nextQuestions.splice(
        sourceIndex + 1,
        0,
        copiedQuestion
      );

      return nextQuestions;
    });

  }

  function removeQuestion(
    questionId: string
  ) {
    setQuestions((currentQuestions) => {
      if (
        currentQuestions.length <= 1
      ) {
        return currentQuestions;
      }

      return currentQuestions.filter(
        (question) =>
          question.id !== questionId
      );
    });
  }

  function moveQuestion(
    questionId: string,
    direction: "up" | "down"
  ) {
    setQuestions((currentQuestions) => {
      const currentIndex =
        currentQuestions.findIndex(
          (question) =>
            question.id === questionId
        );

      const targetIndex =
        direction === "up"
          ? currentIndex - 1
          : currentIndex + 1;

      if (
        currentIndex === -1 ||
        targetIndex < 0 ||
        targetIndex >=
          currentQuestions.length
      ) {
        return currentQuestions;
      }

      const nextQuestions = [
        ...currentQuestions,
      ];

      [
        nextQuestions[currentIndex],
        nextQuestions[targetIndex],
      ] = [
        nextQuestions[targetIndex],
        nextQuestions[currentIndex],
      ];

      return nextQuestions;
    });
  }

  function toggleQuestionOpen(
    questionId: string
  ) {
    setQuestions((currentQuestions) =>
      currentQuestions.map((question) =>
        question.id === questionId
          ? {
              ...question,
              isOpen:
                !question.isOpen,
            }
          : question
      )
    );
  }
    function changeQuestionType(
    questionId: string,
    type: QuestionType
  ) {
    setQuestions((currentQuestions) =>
      currentQuestions.map((question) =>
        question.id === questionId
          ? {
              ...question,
              type,
              correctOptionIndexes:
                type === "single"
                  ? question.correctOptionIndexes.slice(
                      0,
                      1
                    )
                  : question.correctOptionIndexes,
            }
          : question
      )
    );
  }

  function addOption(
    questionId: string
  ) {
    setQuestions((currentQuestions) =>
      currentQuestions.map((question) =>
        question.id === questionId
          ? {
              ...question,
              options: [
                ...question.options,
                "",
              ],
              optionImageFiles: [...question.optionImageFiles, null],
              optionImageUrls: [...question.optionImageUrls, null],
            }
          : question
      )
    );
  }

  function removeOption(
    questionId: string,
    optionIndex: number
  ) {
    setQuestions((currentQuestions) =>
      currentQuestions.map((question) => {
        if (
          question.id !== questionId ||
          question.options.length <= 2
        ) {
          return question;
        }

        const nextOptions =
          question.options.filter(
            (_, index) =>
              index !== optionIndex
          );
        const nextOptionImageFiles = question.optionImageFiles.filter(
          (_, index) => index !== optionIndex
        );
        const nextOptionImageUrls = question.optionImageUrls.filter(
          (_, index) => index !== optionIndex
        );

        const nextCorrectIndexes =
          question.correctOptionIndexes
            .filter(
              (index) =>
                index !== optionIndex
            )
            .map((index) =>
              index > optionIndex
                ? index - 1
                : index
            );

        return {
          ...question,
          options: nextOptions,
          optionImageFiles: nextOptionImageFiles,
          optionImageUrls: nextOptionImageUrls,
          correctOptionIndexes:
            nextCorrectIndexes,
        };
      })
    );
  }

  function toggleCorrectOption(
    question: Question,
    optionIndex: number
  ) {
    if (!optionHasContent(question, optionIndex)) {
      return;
    }

    if (
      question.type === "single"
    ) {
      updateQuestion(
        question.id,
        "correctOptionIndexes",
        [optionIndex]
      );

      return;
    }

    const isSelected =
      question.correctOptionIndexes.includes(
        optionIndex
      );

    updateQuestion(
      question.id,
      "correctOptionIndexes",
      isSelected
        ? question.correctOptionIndexes.filter(
            (index) =>
              index !== optionIndex
          )
        : [
            ...question.correctOptionIndexes,
            optionIndex,
          ].sort((a, b) => a - b)
    );
  }

  function selectedFileIssues(): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const append = (id: string, message: string | null, questionId?: string) => {
      if (message) issues.push({ id, message, questionId });
    };

    append(
      "content",
      fileValidationMessage(
        coverImage,
        "Kapak görseli",
        ["image/png", "image/jpeg", "image/webp"],
        DOCUMENT_UPLOAD_LIMIT_MB
      )
    );
    append(
      "content",
      fileValidationMessage(
        videoFile,
        "Eğitim videosu",
        ["video/mp4", "video/webm", "video/ogg", "application/ogg"],
        TRAINING_ASSET_LIMIT_MB
      )
    );
    append(
      "content",
      fileValidationMessage(
        documentFile,
        "Eğitim dokümanı",
        ["application/pdf"],
        TRAINING_ASSET_LIMIT_MB
      )
    );
    questions.forEach((question, index) => {
      append(
        question.id,
        fileValidationMessage(
          question.imageFile,
          `Soru ${index + 1} görseli`,
          ["image/png", "image/jpeg"],
          DOCUMENT_UPLOAD_LIMIT_MB
        ),
        question.id
      );
      question.optionImageFiles.forEach((file, optionIndex) => {
        append(
          `${question.id}-option-${optionIndex}`,
          fileValidationMessage(
            file,
            `Soru ${index + 1}, şık ${optionIndex + 1} görseli`,
            ["image/png", "image/jpeg"],
            DOCUMENT_UPLOAD_LIMIT_MB
          ),
          question.id
        );
      });
    });
    return issues;
  }

  function validateForm(saveMode: SaveMode) {
    if (saveMode === "draft") {
      const draftIssues: ValidationIssue[] = [];
      if (!title.trim()) {
        draftIssues.push({ id: "title", message: "Taslak kaydetmek için eğitim adı girin." });
      }
      questions.forEach((question, questionIndex) => {
        if (!isBlankQuestion(question) && !isPersistableQuestion(question)) {
          draftIssues.push({
            id: question.id,
            questionId: question.id,
            message: `Soru ${questionIndex + 1} yarım bırakılmış. Soruyu tamamlayın veya boşaltın.`,
          });
        }
      });
      draftIssues.push(...selectedFileIssues());
      return draftIssues;
    }

    const issues: ValidationIssue[] = selectedFileIssues();

    if (!title.trim()) {
      issues.push({ id: "title", message: "Eğitim adı zorunludur." });
    }

    if (!category.trim()) {
      issues.push({ id: "category", message: "Kategori zorunludur." });
    }

    if (!date) {
      issues.push({ id: "date", message: "Eğitim tarihi seçilmelidir." });
    }

    if (!startTime) {
      issues.push({
        id: "startTime",
        message: "Başlangıç saati seçilmelidir.",
      });
    }

    if (durationHours === 0 && durationMinutes === 0) {
      issues.push({
        id: "duration",
        message: "Eğitim süresi 0 olamaz.",
      });
    }

    if (!location.trim()) {
      issues.push({
        id: "location",
        message: "Eğitim yeri veya erişim bilgisi zorunludur.",
      });
    }

    if (
      hasTrainingContent &&
      mustCompleteContent &&
      existingContentCount === 0 &&
      !videoFile &&
      !documentFile
    ) {
      issues.push({
        id: "content",
        message:
          "İçerik tamamlama zorunluysa en az bir video veya doküman yüklenmelidir.",
      });
    }

    if (hasExam) {
      if (passingScore < 0 || passingScore > 100) {
        issues.push({
          id: "passingScore",
          message: "Geçme puanı 0 ile 100 arasında olmalıdır.",
        });
      }

      if (attemptLimit < 1 || !Number.isInteger(attemptLimit)) {
        issues.push({
          id: "attemptLimit",
          message: "Deneme hakkı en az 1 olan tam sayı olmalıdır.",
        });
      }

      if (examDurationMinutes < 1) {
        issues.push({
          id: "examDuration",
          message: "Sınav süresi en az 1 dakika olmalıdır.",
        });
      }

      if (questions.length === 0) {
        issues.push({
          id: "questions",
          message: "En az bir sınav sorusu eklenmelidir.",
        });
      }

      questions.forEach((question, questionIndex) => {
        const questionLabel = `Soru ${questionIndex + 1}`;

        if (!question.text.trim()) {
          issues.push({
            id: `${question.id}-text`,
            questionId: question.id,
            message: `${questionLabel}: soru metni boş olamaz.`,
          });
        }

        if (!Number.isFinite(question.points) || question.points <= 0) {
          issues.push({
            id: `${question.id}-points`,
            questionId: question.id,
            message: `${questionLabel}: puan 0'dan büyük olmalıdır.`,
          });
        }

        const optionContentFlags = question.options.map((_, optionIndex) =>
          optionHasContent(question, optionIndex)
        );
        const normalizedOptions = question.options
          .map((option) => option.trim().toLocaleLowerCase("tr-TR"))
          .filter(Boolean);

        if (optionContentFlags.length < 2 || optionContentFlags.filter(Boolean).length < 2) {
          issues.push({
            id: `${question.id}-options`,
            questionId: question.id,
            message: `${questionLabel}: en az 2 şıkta metin veya görsel bulunmalıdır.`,
          });
        }

        if (optionContentFlags.some((hasContent) => !hasContent)) {
          issues.push({
            id: `${question.id}-options`,
            questionId: question.id,
            message: `${questionLabel}: her şıkta metin veya görsel bulunmalıdır.`,
          });
        }

        if (new Set(normalizedOptions).size !== normalizedOptions.length) {
          issues.push({
            id: `${question.id}-duplicate-options`,
            questionId: question.id,
            message: `${questionLabel}: aynı metin şıkkı birden fazla kullanılamaz.`,
          });
        }

        if (question.correctOptionIndexes.length === 0) {
          issues.push({
            id: `${question.id}-correct`,
            questionId: question.id,
            message: `${questionLabel}: en az bir doğru şık işaretlenmelidir.`,
          });
        }

        if (
          question.type === "single" &&
          question.correctOptionIndexes.length !== 1
        ) {
          issues.push({
            id: `${question.id}-single-correct`,
            questionId: question.id,
            message: `${questionLabel}: tek doğru cevaplı soruda yalnızca bir doğru şık olmalıdır.`,
          });
        }

        const hasEmptyCorrectOption = question.correctOptionIndexes.some(
          (optionIndex) => !optionHasContent(question, optionIndex)
        );

        if (hasEmptyCorrectOption) {
          issues.push({
            id: `${question.id}-empty-correct`,
            questionId: question.id,
            message: `${questionLabel}: metin veya görsel içermeyen şık doğru cevap olarak seçilemez.`,
          });
        }
      });

      if (totalExamScore <= 0) {
        issues.push({
          id: "totalScore",
          message: "Sınav toplam puanı 0'dan büyük olmalıdır.",
        });
      }
    }


    return issues;
  }

    function focusFirstIssue(
    issues: ValidationIssue[]
  ) {
    const firstIssue = issues[0];

    if (firstIssue?.questionId) {
      setQuestions(
        (currentQuestions) =>
          currentQuestions.map(
            (question) => ({
              ...question,
              isOpen:
                question.id ===
                firstIssue.questionId,
            })
          )
      );
    }

    window.setTimeout(() => {
      document
        .getElementById(
          firstIssue?.id ?? ""
        )
        ?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
    }, 0);
  }

  function buildPayload(
    status: "draft" | "published",
    includeQuestions = true
  ) {
    const persistedQuestions =
      status === "draft"
        ? questions.filter((question) => isPersistableQuestion(question))
        : questions;
    const payload: Record<string, unknown> = {
      status,
      title: title.trim(),
      description: description.trim() || null,
      category: category.trim(),
      trainingKind,
      trainingFormat,
      date,
      startTime,
      durationHours,
      durationMinutes,
      location: location.trim() || null,
      isActive: status === "published" ? isActive : false,
      flow: {
        hasTrainingContent,
        mustCompleteContent: hasTrainingContent ? mustCompleteContent : false,
        hasExam,
        hasAttendanceForm,
      },
      exam: hasExam
        ? {
            passingScore,
            attemptLimit,
            durationMinutes: examDurationMinutes,
            shuffleQuestions,
            shuffleOptions,
            showCorrectAnswersAfterExam,
            ...(includeQuestions
              ? {
                  questions: persistedQuestions.map((question) => {
                    const questionIndex = questions.indexOf(question);
                    return {
                    id: question.id,
                    order: questionIndex + 1,
                    text: question.text.trim(),
                    explanation: question.explanation.trim() || null,
                    type: question.type,
                    points: question.points,
                    imageUrl: question.imageUrl ?? null,
                    options: question.options.map((option, optionIndex) => ({
                      text: option.trim() || null,
                      imageUrl: question.optionImageUrls[optionIndex] ?? null,
                      order: optionIndex + 1,
                      isCorrect: question.correctOptionIndexes.includes(optionIndex),
                    })),
                  };
                  }),
                }
              : {}),
          }
        : null,
    };

    // Kapatılan akışların eski ilişkilerini kontrollü biçimde temizle.
    if (!hasTrainingContent) payload.contents = [];
    if (!hasExam) payload.questions = [];
    return payload;
  }

  async function uploadContentFiles(
    trainingId: string,
    currentContents: TrainingApiContent[]
  ): Promise<TrainingApiContent[]> {
    if (!hasTrainingContent) return currentContents;

    const contents = [...currentContents];
    let nextOrder = Math.max(0, ...contents.map((content) => content.order)) + 1;

    async function uploadContent(file: File, type: "VIDEO" | "PDF") {
      const existing = contents.find((content) => content.type === type);
      const order = existing?.order ?? nextOrder++;
      const durationSeconds = type === "VIDEO" ? await getVideoDurationSeconds(file) : null;
      const uploaded = await uploadTrainingAsset(trainingId, "content", file, {
        "x-document-title": encodeURIComponent(
          `${title.trim()} ${type === "VIDEO" ? "Eğitim Videosu" : "Eğitim Dokümanı"}`
        ),
        "x-content-order": String(order),
        "x-content-required": String(mustCompleteContent),
        ...(existing ? { "x-content-id": existing.id } : {}),
        ...(durationSeconds ? { "x-duration-seconds": String(durationSeconds) } : {}),
      });

      const replacement: TrainingApiContent = {
        id: uploaded.entity.id,
        type,
        title: type === "VIDEO" ? "Eğitim Videosu" : "Eğitim Dokümanı",
        fileUrl: uploaded.url,
        externalUrl: null,
        order,
        isRequired: mustCompleteContent,
        durationSeconds,
      };
      const existingIndex = contents.findIndex((content) => content.id === existing?.id);
      if (existingIndex >= 0) contents[existingIndex] = replacement;
      else contents.push(replacement);
    }

    if (videoFile) await uploadContent(videoFile, "VIDEO");
    if (documentFile) await uploadContent(documentFile, "PDF");
    return contents.sort((left, right) => left.order - right.order);
  }

  async function uploadVisualAssets(training: TrainingApiRecord): Promise<void> {
    if (coverImage) {
      await uploadTrainingAsset(training.id, "cover", coverImage, {
        "x-document-title": encodeURIComponent(`${title.trim()} Kapak Görseli`),
      });
    }

    for (const [index, question] of questions.entries()) {
      if (!question.imageFile) continue;
      const persistedQuestion = training.questions.find(
        (item) => item.order === index + 1
      );
      if (!persistedQuestion) {
        throw new Error(`${index + 1}. soru kaydedildikten sonra bulunamadı.`);
      }
      await uploadTrainingAsset(training.id, "question-image", question.imageFile, {
        "x-question-id": persistedQuestion.id,
        "x-document-title": encodeURIComponent(`${title.trim()} - Soru ${index + 1} Görseli`),
      });
    }

    for (const [questionIndex, question] of questions.entries()) {
      const persistedQuestion = training.questions.find(
        (item) => item.order === questionIndex + 1
      );
      if (!persistedQuestion) {
        throw new Error(`${questionIndex + 1}. soru kaydedildikten sonra bulunamadı.`);
      }

      for (const [optionIndex, optionImageFile] of question.optionImageFiles.entries()) {
        if (!optionImageFile) continue;
        const persistedOption = persistedQuestion.options.find(
          (option) => option.order === optionIndex + 1
        );
        if (!persistedOption) {
          throw new Error(
            `${questionIndex + 1}. sorunun ${optionIndex + 1}. şıkkı kaydedildikten sonra bulunamadı.`
          );
        }
        await uploadTrainingAsset(training.id, "option-image", optionImageFile, {
          "x-question-id": persistedQuestion.id,
          "x-option-id": persistedOption.id,
          "x-document-title": encodeURIComponent(
            `${title.trim()} - Soru ${questionIndex + 1} Şık ${String.fromCharCode(65 + optionIndex)} Görseli`
          ),
        });
      }
    }
  }

  async function handleSave(saveMode: SaveMode) {
    const issues = validateForm(saveMode);
    if (issues.length > 0) {
      setValidationIssues(issues);
      setSaveStatus("idle");
      focusFirstIssue(issues);
      return;
    }

    const requestedStatus = saveMode === "draft" ? "draft" : "published";
    let recalculateResults = false;

    if (isEditMode && id) {
      const currentTraining = await adminApiRequest<TrainingApiRecord>(`/trainings/${encodeURIComponent(id)}`);
      const after = correctAnswerMapFromForm(questions);
      const answerKeyChanged = questions.some((question) => {
        const apiQuestion = currentTraining.questions.find((item) => item.id === question.id);
        if (!apiQuestion) return false;
        const oldCorrectIndexes = apiQuestion.options
          .map((option, index) => (option.isCorrect ? index : -1))
          .filter((index) => index >= 0);
        return oldCorrectIndexes.join("|") !== (after[question.id] ?? []).join("|");
      });

      if (answerKeyChanged) {
        const assignmentRows = await adminApiRequest<TrainingAssignmentForRecalculation[]>(
          `/trainings/${encodeURIComponent(id)}/assignments?includeCancelled=true`
        );
        const affectedCount = assignmentRows.reduce(
          (sum, assignment) => sum + assignment.attempts.filter((attempt) => attempt.status !== "IN_PROGRESS" && Boolean(attempt.submittedAt)).length,
          0
        );
        if (affectedCount > 0) {
          const approved = window.confirm(
            `Doğru cevap değişikliği ${affectedCount} tamamlanmış sınav sonucunu yeniden değerlendirecektir. Puanlar, başarı durumları ve sertifika uygunlukları değişebilir. Devam etmek istiyor musunuz?`
          );
          if (!approved) return;
          recalculateResults = true;
        }
      }
    }

    setValidationIssues([]);
    setRequestError("");
    setIsSaving(true);
    let recoveryTrainingId = id ?? "";

    try {
      let savedTraining: TrainingApiRecord;
      let savedTrainingId = id ?? "";
      let workingContents = existingContents;

      if (isEditMode) {
        if (!savedTrainingId) throw new Error("Düzenlenecek eğitim kimliği bulunamadı.");

        // Mevcut eğitimde içerik dosyaları önce bağlanır. Yeni soru/şık görselleri
        // gerçek soru ve şık ID'leri gerektirdiğinden, görsel varsa kayıt önce
        // güvenli taslak olarak güncellenir; upload tamamlanınca yeniden yayınlanır.
        workingContents = await uploadContentFiles(savedTrainingId, workingContents);
        const hasPendingQuestionAssets = questions.some(
          (question) =>
            Boolean(question.imageFile) ||
            question.optionImageFiles.some((file) => Boolean(file))
        );
        const initialStatus =
          requestedStatus === "published" && hasPendingQuestionAssets
            ? "draft"
            : requestedStatus;
        savedTraining = await adminApiRequest<TrainingApiRecord>(
          `/trainings/${encodeURIComponent(savedTrainingId)}`,
          {
            method: "PUT",
            body: JSON.stringify({ ...buildPayload(initialStatus, true), recalculateResults }),
          }
        );
      } else {
        // Yeni kayıtta ID ve gerçek soru ID'leri alınmadan binary dosya bağlanamaz.
        // Bu nedenle önce güvenli taslak, sonra dosyalar, en son yayınlama yapılır.
        savedTraining = await adminApiRequest<TrainingApiRecord>("/trainings", {
          method: "POST",
          body: JSON.stringify(buildPayload("draft", true)),
        });
        savedTrainingId = savedTraining.id;
        recoveryTrainingId = savedTrainingId;
        workingContents = await uploadContentFiles(savedTrainingId, savedTraining.contents ?? []);
      }

      await uploadVisualAssets(savedTraining);

      if (requestedStatus === "published" && savedTraining.isDraft) {
        savedTraining = await adminApiRequest<TrainingApiRecord>(
          `/trainings/${encodeURIComponent(savedTrainingId)}`,
          {
            method: "PUT",
            // Soru, şık ve içerik varlıkları artık DB'de gerçek ID/URL'leriyle
            // bulunduğundan ikinci çağrı yalnızca yayını ve ayarları etkinleştirir.
            body: JSON.stringify({ ...buildPayload("published", false), recalculateResults }),
          }
        );
      } else {
        savedTraining = await adminApiRequest<TrainingApiRecord>(
          `/trainings/${encodeURIComponent(savedTrainingId)}`
        );
      }

      setExistingContents(savedTraining.contents ?? workingContents);
      setExistingContentCount((savedTraining.contents ?? workingContents).length);
      setCoverImage(null);
      setVideoFile(null);
      setDocumentFile(null);
      setQuestions((current) =>
        current.map((question, index) => {
          const savedQuestion = savedTraining.questions[index];
          const savedOptions = savedQuestion?.options ?? [];
          return {
            ...question,
            id: savedQuestion?.id ?? question.id,
            imageFile: null,
            imageUrl: savedQuestion?.imageUrl ?? question.imageUrl ?? null,
            optionImageFiles: question.options.map(() => null),
            optionImageUrls: question.options.map(
              (_, optionIndex) =>
                savedOptions[optionIndex]?.imageUrl ??
                question.optionImageUrls[optionIndex] ??
                null
            ),
          };
        })
      );
      setBaselineSnapshot("");
      setSaveStatus(saveMode === "draft" ? "draft" : "success");

      if (saveMode === "save-and-assign") {
        navigate(`/admin/trainings/${savedTrainingId}/participants`);
        return;
      }

      if (saveMode === "draft" && !isEditMode) {
        navigate(`/admin/trainings/${savedTrainingId}/edit`, { replace: true });
        return;
      }

      if (saveMode === "save") {
        window.setTimeout(() => navigate("/admin/trainings"), 700);
      }
    } catch (error) {
      setSaveStatus("idle");
      const message =
        error instanceof Error
          ? error.message
          : "Kaydetme sırasında beklenmeyen bir hata oluştu.";
      if (!isEditMode && recoveryTrainingId) {
        navigate(`/admin/trainings/${recoveryTrainingId}/edit`, {
          replace: true,
          state: { saveError: `${message} Taslak korundu; aynı kayıt üzerinden devam edebilirsiniz.` },
        });
      } else {
        setRequestError(message);
      }
    } finally {
      setIsSaving(false);
    }
  }

  function openQuestionFromIssue(
    questionId?: string
  ) {
    if (!questionId) {
      return;
    }

    setQuestions(
      (currentQuestions) =>
        currentQuestions.map(
          (question) => ({
            ...question,
            isOpen:
              question.id ===
              questionId,
          })
        )
    );

    window.setTimeout(() => {
      document
        .getElementById(
          questionId
        )
        ?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
    }, 0);
  }
    return (
    <div className="space-y-4 pb-8 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-gray-100 sm:text-2xl">
            <ClipboardList className="h-7 w-7 text-gray-700 dark:text-gray-300" />

            {isEditMode
              ? "Eğitim ve Sınavı Düzenle"
              : "Eğitim ve Sınav Oluştur"}
          </h1>

          <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
            {isEditMode
              ? "Mevcut eğitimin içerik, sınav, başarı ve belge ayarlarını güncelleyin."
              : "Eğitim içeriğini, zorunlu tamamlama akışını ve sınavı tek ekrandan hazırlayın. Katılımcı seçimi kayıttan sonraki ayrı adımda yapılır."}
          </p>
          {hasUnsavedChanges && (
            <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertCircle className="h-3.5 w-3.5" /> Kaydedilmemiş değişiklikler
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() =>
            navigate("/admin/trainings")
          }
          className={secondaryButtonClassName}
        >
          <ArrowLeft className="h-4 w-4" />

          Listeye Dön
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex min-w-max items-center gap-2 text-xs font-medium">
          {[
            {
              icon: ClipboardList,
              label: "1. Eğitim",
            },
            {
              icon: Video,
              label: "2. İçerik",
            },
            {
              icon: ListChecks,
              label: "3. Sınav",
            },
            {
              icon: Users,
              label: "4. Atama",
            },
          ].map(
            (
              {
                icon: Icon,
                label,
              },
              index
            ) => (
              <div
                key={label}
                className="flex items-center gap-2"
              >
                <div
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 ${
                    index < 3
                      ? "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                      : "border border-dashed border-gray-300 text-gray-400 dark:border-gray-600"
                  }`}
                >
                  <Icon className="h-4 w-4" />

                  {label}
                </div>

                {index < 3 && (
                  <ArrowRight className="h-4 w-4 text-gray-300" />
                )}
              </div>
            )
          )}
        </div>
      </div>

      {isLoadingTraining && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-medium text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300">
          Eğitim bilgileri yükleniyor...
        </div>
      )}

      {requestError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
          {requestError}
        </div>
      )}

      {validationIssues.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-900/20">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />

            <div className="min-w-0">
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                {isSaving
            ? "Kaydediliyor..."
            : isEditMode
              ? "Değişiklikleri Kaydet"
              : "Kaydet"}meden önce aşağıdaki alanları kontrol edin:
              </p>

              <ul className="mt-2 space-y-1 text-xs text-red-600 dark:text-red-400">
                {validationIssues.map(
                  (issue) => (
                    <li key={issue.id}>
                      <button
                        type="button"
                        onClick={() =>
                          openQuestionFromIssue(
                            issue.questionId
                          )
                        }
                        className={`text-left ${
                          issue.questionId
                            ? "underline decoration-dotted underline-offset-2"
                            : ""
                        }`}
                      >
                        • {issue.message}
                      </button>
                    </li>
                  )
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {saveStatus !== "idle" && (
        <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-700 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />

          {saveStatus === "draft"
            ? "Eğitim taslak olarak kaydedildi."
            : "Eğitim başarıyla kaydedildi."}
        </div>
      )}
      <SectionCard
        title="Eğitim Bilgileri"
        description="Çalışanların eğitim listesinde göreceği temel bilgiler."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field
            label="Eğitim adı"
            required
          >
            <input
              id="title"
              value={title}
              onChange={(event) =>
                setTitle(
                  event.target.value
                )
              }
              className={
                inputClassName
              }
              placeholder="Örn. İSG Temel Eğitimi"
              maxLength={160}
            />
          </Field>

          <Field
            label="Kategori"
            required
          >
            <input
              id="category"
              value={category}
              onChange={(event) =>
                setCategory(
                  event.target.value
                )
              }
              className={
                inputClassName
              }
              placeholder="Örn. İş Sağlığı ve Güvenliği"
              maxLength={100}
            />
          </Field>

          <Field
            label="Açıklama"
            className="md:col-span-2"
          >
            <textarea
              value={description}
              onChange={(event) =>
                setDescription(
                  event.target.value
                )
              }
              className={`${inputClassName} min-h-24 resize-y`}
              placeholder="Eğitimin amacı, kapsamı ve çalışanlara iletilecek kısa açıklama"
              maxLength={1000}
            />
          </Field>

          <Field label="Eğitim türü">
            <select
              value={trainingKind}
              onChange={(event) =>
                setTrainingKind(
                  event.target
                    .value as TrainingKind
                )
              }
              className={
                inputClassName
              }
            >
              <option value="Zorunlu">
                Zorunlu
              </option>

              <option value="Opsiyonel">
                Opsiyonel
              </option>
            </select>
          </Field>

          <Field label="Eğitim şekli">
            <select
              value={trainingFormat}
              onChange={(event) =>
                setTrainingFormat(
                  event.target
                    .value as TrainingFormat
                )
              }
              className={
                inputClassName
              }
            >
              <option value="Yüz Yüze">
                Yüz Yüze
              </option>

              <option value="Uzaktan">
                Uzaktan
              </option>

              <option value="Hibrit">
                Hibrit
              </option>
            </select>
          </Field>

          <Field
            label="Eğitim tarihi"
            required
          >
            <input
              id="date"
              type="date"
              value={date}
              onChange={(event) =>
                setDate(
                  event.target.value
                )
              }
              className={
                inputClassName
              }
            />
          </Field>

          <Field
            label="Başlangıç saati"
            required
          >
            <input
              id="startTime"
              type="time"
              value={startTime}
              onChange={(event) =>
                setStartTime(
                  event.target.value
                )
              }
              className={
                inputClassName
              }
            />
          </Field>

          <Field label="Eğitim süresi (saat)">
            <input
              type="number"
              min={0}
              max={23}
              value={durationHours}
              onChange={(event) =>
                setDurationHours(
                  clampNumber(
                    event.target.value,
                    0,
                    23,
                    durationHours
                  )
                )
              }
              className={
                inputClassName
              }
            />
          </Field>

          <Field label="Eğitim süresi (dakika)">
            <input
              type="number"
              min={0}
              value={durationMinutes}
              onChange={(event) =>
                setDurationMinutes(
                  clampNumber(
                    event.target.value,
                    0,
                    100000,
                    durationMinutes
                  )
                )
              }
              className={
                inputClassName
              }
            />
          </Field>

          <div
            id="duration"
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-200 md:col-span-2"
          >
            <Clock3 className="h-4 w-4 text-gray-400" />

            Otomatik hesaplanan bitiş saati:

            <span className="font-semibold">
              {computedEndTime}
            </span>
          </div>

          <Field
            label={
              trainingFormat ===
              "Uzaktan"
                ? "Erişim bilgisi"
                : "Eğitim yeri / erişim bilgisi"
            }
            className="md:col-span-2"
            required
          >
            <input
              id="location"
              value={location}
              onChange={(event) =>
                setLocation(
                  event.target.value
                )
              }
              className={
                inputClassName
              }
              placeholder={
                trainingFormat ===
                "Uzaktan"
                  ? "Örn. Kurumsal eğitim bağlantısı veya çevrim içi toplantı adresi"
                  : "Örn. Toplantı Salonu A"
              }
              maxLength={250}
            />
          </Field>

          <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700 md:col-span-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Eğitim Durumu
                </p>

                <p className="mt-1 text-xs leading-5 text-gray-400">
                  Katılımcılar pasif eğitimlere de önceden atanabilir.
                  Eğitim aktif edilene kadar sınav çalışanlara açılmaz.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setIsActive(
                    (current) =>
                      !current
                  )
                }
                aria-pressed={isActive}
                className={`flex w-32 items-center rounded-full p-1 text-xs font-semibold transition ${
                  isActive
                    ? "justify-end bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "justify-start bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                }`}
              >
                <span className="rounded-full bg-white px-3 py-1 shadow-sm dark:bg-gray-900">
                  {isActive
                    ? "Aktif"
                    : "Pasif"}
                </span>
              </button>
            </div>
          </div>
        </div>
      </SectionCard>
      <SectionCard
        title="Akış ve Modül Ayarları"
        description="Zorunlu eğitim içeriklerini, sınav erişimini ve katılımcı ilerlemesini tek akış üzerinden yönetin."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SwitchRow
            label="Eğitim İçeriği"
            description="Video veya doküman eğitim akışında çalışanlara gösterilir."
            checked={hasTrainingContent}
            onChange={() => {
              const nextValue = !hasTrainingContent;

              setHasTrainingContent(nextValue);

              if (!nextValue) {
                setMustCompleteContent(false);
              }
            }}
          />

          <SwitchRow
            label="İçeriği Tamamlama Zorunlu"
            description="Açıksa çalışan içeriği tamamlamadan sınava başlayamaz."
            checked={mustCompleteContent}
            onChange={() =>
              setMustCompleteContent(
                (current) => !current
              )
            }
            disabled={
              !hasTrainingContent ||
              !hasExam
            }
          />

          <SwitchRow
            label="Sınav"
            description="Kapalıysa bu eğitim için test uygulanmaz."
            checked={hasExam}
            onChange={() => {
              const nextValue = !hasExam;

              setHasExam(nextValue);

              if (!nextValue) {
                setMustCompleteContent(false);
              }
            }}
          />


          <SwitchRow
            label="Katılım Formu"
            description="Katılımcı listesi ve imza alanı için boş/dolu katılım formu üretilebilir."
            checked={hasAttendanceForm}
            onChange={() =>
              setHasAttendanceForm(
                (current) => !current
              )
            }
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Eğitim Dosyaları"
        description="Yüklenen içerikler çalışan ekranında eğitim sırasına göre sunulur."
      >
        <div
          id="content"
          className="grid grid-cols-1 gap-4 md:grid-cols-2"
        >
          <FileUploadField
            label="Kapak Görseli Yükle"
            icon={Upload}
            accept="image/png,image/jpeg,image/webp"
            file={coverImage}
            onSelect={setCoverImage}
            hint="Önerilen oran: 16:9. PNG, JPG veya WEBP."
          />

          {hasTrainingContent && (
            <>
              <FileUploadField
                label="Eğitim Videosu Yükle"
                icon={Video}
                accept="video/mp4,video/webm,video/ogg,application/ogg"
                file={videoFile}
                onSelect={setVideoFile}
                hint="Çalışan video tamamlanmadan sınava geçemez seçeneği desteklenir."
              />

              <FileUploadField
                label="Eğitim Dokümanı / PDF Yükle"
                icon={FileText}
                accept=".pdf,application/pdf"
                file={documentFile}
                onSelect={setDocumentFile}
                hint="Resmî eğitim dokümanı veya destekleyici PDF."
              />
            </>
          )}
        </div>
      </SectionCard>

      {hasExam && (
        <>
          <SectionCard
            title="Sınav Ayarları"
            description="Sınavın geçme, süre ve tekrar kurallarını belirleyin."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field
                label="Geçme puanı"
                required
              >
                <input
                  id="passingScore"
                  type="number"
                  min={0}
                  max={100}
                  value={passingScore}
                  onChange={(event) =>
                    setPassingScore(
                      clampNumber(
                        event.target.value,
                        0,
                        100,
                        passingScore
                      )
                    )
                  }
                  className={
                    inputClassName
                  }
                />
              </Field>

              <Field
                label="Deneme hakkı"
                required
              >
                <input
                  id="attemptLimit"
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={attemptLimit}
                  onChange={(event) =>
                    setAttemptLimit(
                      Math.round(
                        clampNumber(
                          event.target.value,
                          1,
                          100,
                          attemptLimit
                        )
                      )
                    )
                  }
                  className={
                    inputClassName
                  }
                />
              </Field>

              <Field
                label="Sınav süresi (dakika)"
                required
              >
                <input
                  id="examDuration"
                  type="number"
                  min={1}
                  max={600}
                  value={
                    examDurationMinutes
                  }
                  onChange={(event) =>
                    setExamDurationMinutes(
                      Math.round(
                        clampNumber(
                          event.target.value,
                          1,
                          600,
                          examDurationMinutes
                        )
                      )
                    )
                  }
                  className={
                    inputClassName
                  }
                />
              </Field>

              <SwitchRow
                label="Soruları Karıştır"
                description="Her denemede soru sırası rastgele değişir."
                checked={shuffleQuestions}
                onChange={() =>
                  setShuffleQuestions(
                    (current) => !current
                  )
                }
              />

              <SwitchRow
                label="Şıkları Karıştır"
                description="Her denemede şık sırası rastgele değişir."
                checked={shuffleOptions}
                onChange={() =>
                  setShuffleOptions(
                    (current) => !current
                  )
                }
              />

              <SwitchRow
                label="Doğru Cevapları Göster"
                description="Sınav tamamlandıktan sonra doğru cevaplar çalışana gösterilir."
                checked={
                  showCorrectAnswersAfterExam
                }
                onChange={() =>
                  setShowCorrectAnswersAfterExam(
                    (current) => !current
                  )
                }
              />
            </div>
          </SectionCard>
          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <div className="flex flex-col gap-3 border-b border-gray-200 px-4 py-4 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  Sınav Soruları
                </h2>

                <p className="mt-1 text-xs leading-5 text-gray-400">
                  Her soruda doğru cevap işaretlenmelidir.
                  Toplam puan:

                  <span className="ml-1 font-semibold text-gray-700 dark:text-gray-200">
                    {totalExamScore}
                  </span>
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() =>
                    setIsPreviewOpen(true)
                  }
                  className={
                    secondaryButtonClassName
                  }
                >
                  <Eye className="h-4 w-4" />

                  Önizle
                </button>

                <button
                  type="button"
                  onClick={addQuestion}
                  className={
                    secondaryButtonClassName
                  }
                >
                  <Plus className="h-4 w-4" />

                  Soru Ekle
                </button>
              </div>
            </div>

            <div
              id="questions"
              className="space-y-4 p-4"
            >
              {questions.map(
                (
                  question,
                  questionIndex
                ) => (
                  <article
                    id={question.id}
                    key={question.id}
                    className="scroll-mt-4 rounded-xl border border-gray-200 dark:border-gray-700"
                  >
                    <div className="flex items-start gap-2 p-3 sm:items-center sm:p-4">
                      <button
                        type="button"
                        onClick={() =>
                          toggleQuestionOpen(
                            question.id
                          )
                        }
                        className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                      >
                        <div className="min-w-0">
                          <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
                            <span className="shrink-0">
                              Soru{" "}
                              {questionIndex +
                                1}
                            </span>

                            {question.text.trim() && (
                              <span className="truncate text-xs font-normal text-gray-400">
                                {
                                  question.text
                                }
                              </span>
                            )}
                          </h3>

                          <p className="mt-1 text-xs text-gray-400">
                            {question.type ===
                            "single"
                              ? "Tek doğru cevap"
                              : "Çoklu doğru cevap"}{" "}
                            • {question.points}{" "}
                            puan
                          </p>
                        </div>

                        {question.isOpen ? (
                          <ChevronUp className="h-4 w-4 shrink-0 text-gray-500" />
                        ) : (
                          <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
                        )}
                      </button>

                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            moveQuestion(
                              question.id,
                              "up"
                            )
                          }
                          disabled={
                            questionIndex === 0
                          }
                          className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 disabled:opacity-30 dark:border-gray-700 dark:hover:bg-gray-700"
                          aria-label={`Soru ${
                            questionIndex + 1
                          } yukarı taşı`}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            moveQuestion(
                              question.id,
                              "down"
                            )
                          }
                          disabled={
                            questionIndex ===
                            questions.length -
                              1
                          }
                          className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 disabled:opacity-30 dark:border-gray-700 dark:hover:bg-gray-700"
                          aria-label={`Soru ${
                            questionIndex + 1
                          } aşağı taşı`}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            duplicateQuestion(
                              question.id
                            )
                          }
                          className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
                          aria-label={`Soru ${
                            questionIndex + 1
                          } kopyala`}
                        >
                          <Copy className="h-4 w-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            removeQuestion(
                              question.id
                            )
                          }
                          disabled={
                            questions.length <= 1
                          }
                          className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 dark:border-gray-700 dark:hover:bg-red-900/20"
                          aria-label={`Soru ${
                            questionIndex + 1
                          } sil`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {question.isOpen && (
                      <div className="border-t border-gray-100 p-4 dark:border-gray-700">
                        <Field
                          label="Soru metni"
                          required
                        >
                          <textarea
                            id={`${question.id}-text`}
                            value={
                              question.text
                            }
                            onChange={(
                              event
                            ) =>
                              updateQuestion(
                                question.id,
                                "text",
                                event.target
                                  .value
                              )
                            }
                            className={`${inputClassName} min-h-20 resize-y`}
                            placeholder="Soru metnini yazın"
                            maxLength={1000}
                          />
                        </Field>

                        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                          <Field label="Cevap tipi">
                            <select
                              value={
                                question.type
                              }
                              onChange={(
                                event
                              ) =>
                                changeQuestionType(
                                  question.id,
                                  event.target
                                    .value as QuestionType
                                )
                              }
                              className={
                                inputClassName
                              }
                            >
                              <option value="single">
                                Tek doğru cevap
                              </option>

                              <option value="multiple">
                                Çoklu doğru
                                cevap
                              </option>
                            </select>
                          </Field>

                          <Field
                            label="Puan"
                            required
                          >
                            <input
                              id={`${question.id}-points`}
                              type="number"
                              min={1}
                              max={1000}
                              value={
                                question.points
                              }
                              onChange={(
                                event
                              ) =>
                                updateQuestion(
                                  question.id,
                                  "points",
                                  clampNumber(
                                    event.target
                                      .value,
                                    1,
                                    1000,
                                    question.points
                                  )
                                )
                              }
                              className={
                                inputClassName
                              }
                            />
                          </Field>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                          <FileUploadField
                            label="Soru Görseli Yükle"
                            icon={ImageIcon}
                            accept="image/png,image/jpeg"
                            file={
                              question.imageFile
                            }
                            onSelect={(
                              file
                            ) =>
                              updateQuestion(
                                question.id,
                                "imageFile",
                                file
                              )
                            }
                          />

                          <Field
                            label="Cevap açıklaması"
                            hint="Sınav sonrası doğru cevaplar gösterilecekse kullanılabilir."
                          >
                            <textarea
                              value={
                                question.explanation
                              }
                              onChange={(
                                event
                              ) =>
                                updateQuestion(
                                  question.id,
                                  "explanation",
                                  event.target
                                    .value
                                )
                              }
                              className={`${inputClassName} min-h-14 resize-y`}
                              placeholder="Doğru cevabın kısa açıklaması"
                              maxLength={600}
                            />
                          </Field>
                        </div>

                        <div className="mt-5">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                Şıklar
                              </p>

                              <p className="mt-1 text-xs text-gray-400">
                                Her şık metin, görsel veya ikisini birlikte içerebilir.
                                Doğru cevap düğmesi içerik bulunan şıklarda kullanılabilir.
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                addOption(
                                  question.id
                                )
                              }
                              className={
                                secondaryButtonClassName
                              }
                            >
                              <Plus className="h-4 w-4" />

                              Şık Ekle
                            </button>
                          </div>

                          <div
                            id={`${question.id}-options`}
                            className="mt-3 space-y-3"
                          >
                            {question.options.map(
                              (
                                option,
                                optionIndex
                              ) => {
                                const isCorrect =
                                  question.correctOptionIndexes.includes(
                                    optionIndex
                                  );
                                const optionImageFile =
                                  question.optionImageFiles[optionIndex] ?? null;
                                const optionImageUrl =
                                  question.optionImageUrls[optionIndex] ?? null;
                                const optionImageInputId =
                                  `${question.id}-option-${optionIndex}-image`;

                                return (
                                  <div
                                    key={`${question.id}-option-${optionIndex}`}
                                    id={`${question.id}-option-${optionIndex}`}
                                    className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
                                  >
                                    <div className="min-w-0 space-y-2">
                                      <input
                                        value={option}
                                        onChange={(event) => {
                                          const nextOptions = [...question.options];
                                          nextOptions[optionIndex] = event.target.value;
                                          const willHaveContent = Boolean(
                                            event.target.value.trim() ||
                                            optionImageFile ||
                                            optionImageUrl
                                          );
                                          const nextCorrectIndexes = willHaveContent
                                            ? question.correctOptionIndexes
                                            : question.correctOptionIndexes.filter(
                                                (index) => index !== optionIndex
                                              );

                                          setQuestions((currentQuestions) =>
                                            currentQuestions.map((currentQuestion) =>
                                              currentQuestion.id === question.id
                                                ? {
                                                    ...currentQuestion,
                                                    options: nextOptions,
                                                    correctOptionIndexes:
                                                      nextCorrectIndexes,
                                                  }
                                                : currentQuestion
                                            )
                                          );
                                        }}
                                        className={inputClassName}
                                        placeholder={`Şık ${optionIndex + 1} metni (görselli şıkta isteğe bağlı)`}
                                        maxLength={500}
                                      />

                                      <div className="flex flex-wrap items-center gap-2">
                                        <input
                                          id={optionImageInputId}
                                          type="file"
                                          accept="image/png,image/jpeg"
                                          className="sr-only"
                                          onChange={(event) => {
                                            const file = event.target.files?.[0] ?? null;
                                            setQuestions((currentQuestions) =>
                                              currentQuestions.map((currentQuestion) => {
                                                if (currentQuestion.id !== question.id) {
                                                  return currentQuestion;
                                                }
                                                const nextFiles = [
                                                  ...currentQuestion.optionImageFiles,
                                                ];
                                                nextFiles[optionIndex] = file;
                                                return {
                                                  ...currentQuestion,
                                                  optionImageFiles: nextFiles,
                                                };
                                              })
                                            );
                                            event.target.value = "";
                                          }}
                                        />
                                        <label
                                          htmlFor={optionImageInputId}
                                          className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                                        >
                                          <ImageIcon className="h-4 w-4" />
                                          {optionImageFile || optionImageUrl
                                            ? "Şık Görselini Değiştir"
                                            : "Şık Görseli Ekle"}
                                        </label>

                                        {(optionImageFile || optionImageUrl) && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setQuestions((currentQuestions) =>
                                                currentQuestions.map(
                                                  (currentQuestion) => {
                                                    if (
                                                      currentQuestion.id !== question.id
                                                    ) {
                                                      return currentQuestion;
                                                    }
                                                    const nextFiles = [
                                                      ...currentQuestion.optionImageFiles,
                                                    ];
                                                    const nextUrls = [
                                                      ...currentQuestion.optionImageUrls,
                                                    ];
                                                    nextFiles[optionIndex] = null;
                                                    nextUrls[optionIndex] = null;
                                                    const nextCorrectIndexes =
                                                      currentQuestion.options[
                                                        optionIndex
                                                      ]?.trim()
                                                        ? currentQuestion.correctOptionIndexes
                                                        : currentQuestion.correctOptionIndexes.filter(
                                                            (index) =>
                                                              index !== optionIndex
                                                          );
                                                    return {
                                                      ...currentQuestion,
                                                      optionImageFiles: nextFiles,
                                                      optionImageUrls: nextUrls,
                                                      correctOptionIndexes:
                                                        nextCorrectIndexes,
                                                    };
                                                  }
                                                )
                                              );
                                            }}
                                            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-500 transition hover:bg-red-50 hover:text-red-600 dark:border-gray-700 dark:hover:bg-red-900/20"
                                          >
                                            <X className="h-3.5 w-3.5" />
                                            Görseli Kaldır
                                          </button>
                                        )}
                                      </div>

                                      {optionImageFile && (
                                        <p className="truncate text-xs text-gray-400">
                                          {optionImageFile.name}
                                        </p>
                                      )}
                                      <ProtectedAssetImage
                                        file={optionImageFile}
                                        endpoint={optionImageUrl}
                                        actor="admin"
                                        alt={`Soru ${questions.indexOf(question) + 1}, şık ${optionIndex + 1} görseli`}
                                        className="max-h-36 max-w-full rounded-lg border border-gray-200 object-contain dark:border-gray-700"
                                      />
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        toggleCorrectOption(
                                          question,
                                          optionIndex
                                        )
                                      }
                                      disabled={!optionHasContent(question, optionIndex)}
                                      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                                        isCorrect
                                          ? "border-green-200 bg-green-50 text-green-700 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-400"
                                          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                                      }`}
                                    >
                                      {isCorrect && (
                                        <Check className="h-4 w-4" />
                                      )}

                                      {isCorrect
                                        ? "Doğru"
                                        : "Doğru Şık"}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        removeOption(
                                          question.id,
                                          optionIndex
                                        )
                                      }
                                      disabled={question.options.length <= 2}
                                      className="inline-flex min-h-11 items-center justify-center rounded-lg border border-gray-200 px-3 text-gray-500 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 dark:border-gray-700 dark:hover:bg-red-900/20"
                                      aria-label={`Şık ${optionIndex + 1} sil`}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                );
                              }
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </article>
                )
              )}
            </div>
          </section>
        </>
      )}

      {hasAttendanceForm && (
        <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-gray-500" />

          <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
            Katılım formu açık. Eğitim
            kaydedildikten sonra katılımcı
            listesi, imza alanı, boş form ve
            doldurulmuş form yönetici ekranından
            görüntülenip dışa aktarılabilir.
          </p>
        </div>
      )}

      <div className="sticky bottom-0 z-20 -mx-2 border-t border-gray-200 bg-white/95 px-2 py-3 backdrop-blur dark:border-gray-700 dark:bg-gray-900/95 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <button
            type="button"
            onClick={() =>
              navigate(
                "/admin/trainings"
              )
            }
            className={
              secondaryButtonClassName
            }
          >
            Vazgeç
          </button>

          <button
            type="button"
            onClick={() =>
              setIsPreviewOpen(true)
            }
            className={
              secondaryButtonClassName
            }
          >
            <Eye className="h-4 w-4" />

            Önizle
          </button>

          <button
            type="button"
            onClick={() =>
              handleSave("draft")
            }
            className={
              secondaryButtonClassName
            }
          >
            <Save className="h-4 w-4" />

            {isSaving ? "Kaydediliyor..." : "Taslak Kaydet"}
          </button>

          <button
            type="button"
            onClick={() =>
              handleSave("save")
            }
            className={
              primaryButtonClassName
            }
          >
            <Save className="h-4 w-4" />

            Eğitimi Kaydet
          </button>

          <button
            type="button"
            onClick={() =>
              handleSave(
                "save-and-assign"
              )
            }
            className={
              primaryButtonClassName
            }
          >
            <Users className="h-4 w-4" />

            Kaydet ve Atamaya Geç

            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isPreviewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="preview-title"
        >
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl dark:bg-gray-900 sm:max-w-3xl sm:rounded-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
              <div>
                <h2
                  id="preview-title"
                  className="text-base font-semibold text-gray-900 dark:text-gray-100"
                >
                  Eğitim Önizlemesi
                </h2>

                <p className="mt-1 text-xs text-gray-400">
                  Çalışan ekranında gösterilecek
                  akışın kısa önizlemesi.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setIsPreviewOpen(false)
                }
                className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                aria-label="Önizlemeyi kapat"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 p-4 sm:p-6">
              <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  {category ||
                    "Kategori seçilmedi"}
                </p>

                <h3 className="mt-2 text-xl font-semibold text-gray-900 dark:text-gray-100">
                  {title ||
                    "Eğitim adı girilmedi"}
                </h3>

                <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
                  {description ||
                    "Eğitim açıklaması girilmedi."}
                </p>

                <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                  <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
                    <p className="text-gray-400">
                      Tür
                    </p>

                    <p className="mt-1 font-medium text-gray-700 dark:text-gray-200">
                      {trainingKind}
                    </p>
                  </div>

                  <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
                    <p className="text-gray-400">
                      Şekil
                    </p>

                    <p className="mt-1 font-medium text-gray-700 dark:text-gray-200">
                      {trainingFormat}
                    </p>
                  </div>

                  <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
                    <p className="text-gray-400">
                      Tarih
                    </p>

                    <p className="mt-1 font-medium text-gray-700 dark:text-gray-200">
                      {date || "--"}
                    </p>
                  </div>

                  <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
                    <p className="text-gray-400">
                      Saat
                    </p>

                    <p className="mt-1 font-medium text-gray-700 dark:text-gray-200">
                      {startTime ||
                        "--:--"}{" "}
                      - {computedEndTime}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {hasTrainingContent && (
                  <div className="flex items-center gap-3 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                    <div className="rounded-lg bg-gray-100 p-2 dark:bg-gray-800">
                      <Video className="h-5 w-5 text-gray-600 dark:text-gray-300" />
                    </div>

                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                        Eğitim İçeriği
                      </p>

                      <p className="mt-1 text-xs text-gray-400">
                        {mustCompleteContent
                          ? "İçerik tamamlanmadan sınava geçilemez."
                          : "İçerik tamamlanması zorunlu değildir."}
                      </p>
                    </div>
                  </div>
                )}

                {hasExam && (
                  <div className="flex items-center gap-3 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                    <div className="rounded-lg bg-gray-100 p-2 dark:bg-gray-800">
                      <ListChecks className="h-5 w-5 text-gray-600 dark:text-gray-300" />
                    </div>

                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                        Sınav
                      </p>

                      <p className="mt-1 text-xs text-gray-400">
                        {questions.length} soru •{" "}
                        {examDurationMinutes}{" "}
                        dakika • Geçme puanı{" "}
                        {passingScore}
                      </p>
                    </div>
                  </div>
                )}

                {hasExam && (
                  <div className="flex items-center gap-3 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                        OSGB Sertifikası
                      </p>
                      <p className="mt-1 text-xs text-gray-400">
                        Sınavı başarıyla tamamlayan katılımcının OSGB tarafından hazırlanan PDF sertifikası sonradan manuel yüklenir.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {hasExam && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    Soru Önizlemesi
                  </h3>

                  <div className="mt-3 space-y-4">
                    {questions.map(
                      (
                        question,
                        questionIndex
                      ) => (
                        <div
                          key={question.id}
                          className="rounded-xl border border-gray-200 p-4 dark:border-gray-700"
                        >
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                            {questionIndex +
                              1}
                            .{" "}
                            {question.text ||
                              "Soru metni girilmedi"}
                          </p>

                          <div className="mt-3 space-y-2">
                            {question.options.map(
                              (
                                option,
                                optionIndex
                              ) => (
                                <div
                                  key={`${question.id}-preview-${optionIndex}`}
                                  className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300"
                                >
                                  <p>
                                    {String.fromCharCode(65 + optionIndex)}.{" "}
                                    {option || (optionHasContent(question, optionIndex)
                                      ? "Görsel şık"
                                      : "Boş şık")}
                                  </p>
                                  <ProtectedAssetImage
                                    file={question.optionImageFiles[optionIndex] ?? null}
                                    endpoint={question.optionImageUrls[optionIndex] ?? null}
                                    actor="admin"
                                    alt={`Şık ${optionIndex + 1} önizlemesi`}
                                    className="mt-2 max-h-32 max-w-full rounded-md object-contain"
                                  />
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 border-t border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <button
                type="button"
                onClick={() =>
                  setIsPreviewOpen(false)
                }
                className={`${primaryButtonClassName} w-full`}
              >
                Önizlemeyi Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CreateTestPage;