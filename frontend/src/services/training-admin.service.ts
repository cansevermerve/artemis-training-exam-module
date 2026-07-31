import { uploadBinary } from "../lib/api";

export type UploadedTrainingAsset = {
  document: { id: string };
  url: string;
  entity: { id: string };
};

export async function getVideoDurationSeconds(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = Math.ceil(video.duration);
      URL.revokeObjectURL(url);
      if (!Number.isFinite(duration) || duration < 1) reject(new Error("Video süresi okunamadı."));
      else resolve(duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Video dosyası okunamadı."));
    };
    video.src = url;
  });
}

export function uploadTrainingAsset(
  trainingId: string,
  assetType: "cover" | "content" | "question-image",
  file: File,
  headers: Record<string, string> = {}
): Promise<UploadedTrainingAsset> {
  return uploadBinary<UploadedTrainingAsset>(
    `/trainings/${encodeURIComponent(trainingId)}/assets/${assetType}`,
    file,
    headers,
    "admin"
  );
}
