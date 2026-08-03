export type UserSummary = {
  id: string;
  name: string | null;
  email: string | null;
  title: string | null;
  department: string | null;
};

export type TrainingContent = {
  id: string;
  trainingId: string;
  type: "VIDEO" | "PDF" | "IMAGE" | "LINK";
  title: string;
  fileUrl: string | null;
  externalUrl: string | null;
  order: number;
  isRequired: boolean;
  durationSeconds: number | null;
};

export type Training = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  trainingKind: string;
  trainingFormat: string;
  trainingDate: string | null;
  startTime: string | null;
  durationMinutes: number;
  location: string | null;
  isDraft: boolean;
  isActive: boolean;
  hasTrainingContent: boolean;
  mustCompleteContent: boolean;
  hasExam: boolean;
  hasCertificate: boolean;
  hasAttendanceForm: boolean;
  coverImageUrl?: string | null;
  certificateMinimumScore?: number | null;
  passingScore: number;
  attemptLimit: number;
  examDurationMinutes: number;
  contents?: TrainingContent[];
  _count?: {
    assignments: number;
    documents: number;
  };
};

export type ContentProgress = {
  id: string;
  contentId: string;
  isCompleted: boolean;
  completedAt: string | null;
  lastPositionSeconds: number;
  watchedSeconds: number;
};

export type AttemptSummary = {
  id: string;
  attemptNumber: number;
  status: "IN_PROGRESS" | "PASSED" | "FAILED" | "TIMED_OUT";
  score: number | null;
  passed: boolean | null;
  startedAt: string;
  submittedAt: string | null;
};

export type DocumentSummary = {
  id: string;
  type: string;
  status: string;
  originalName: string;
  title: string;
  attemptId: string | null;
  createdAt: string;
  isGenerated: boolean;
};

export type TrainingAssignment = {
  id: string;
  trainingId: string;
  userId: string;
  assignedAt: string;
  dueDate: string | null;
  startedAt: string | null;
  contentCompletedAt: string | null;
  completedAt: string | null;
  status: "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "EXPIRED" | "CANCELLED";
  training: Training & { contents?: TrainingContent[] };
  user?: UserSummary;
  contentProgress: ContentProgress[];
  attempts: AttemptSummary[];
  documents: DocumentSummary[];
};

export type AttemptQuestion = {
  id: string;
  text: string;
  type: "SINGLE" | "MULTIPLE";
  points: number;
  order: number;
  imageUrl: string | null;
  selectedOptionIds: string[];
  options: Array<{
    id: string;
    text: string | null;
    imageUrl: string | null;
    order: number;
  }>;
};

export type ExamAttempt = {
  id: string;
  assignmentId: string;
  attemptNumber: number;
  status: "IN_PROGRESS" | "PASSED" | "FAILED" | "TIMED_OUT";
  startedAt: string;
  expiresAt: string | null;
  remainingAttempts: number;
  training: {
    id: string;
    title: string;
    passingScore: number;
    examDurationMinutes: number;
    showCorrectAnswers: boolean;
  };
  questions: AttemptQuestion[];
};

export type AttemptResult = {
  attemptId: string;
  assignmentId: string;
  employee: UserSummary;
  training: {
    id: string;
    title: string;
    passingScore: number;
    showCorrectAnswers: boolean;
    hasCertificate: boolean;
    certificateMinimumScore: number;
  };
  attemptNumber: number;
  status: "PASSED" | "FAILED" | "TIMED_OUT";
  score: number;
  totalScore: number;
  totalPoints: number | null;
  passed: boolean;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  startedAt: string;
  completedAt: string | null;
  durationSeconds: number;
  remainingAttempts: number;
  certificateEligible: boolean;
  certificateUrl: string | null;
};
