import { readIntegerEnv } from "./env.js";

function megabytes(name: string, fallback: number): number {
  return readIntegerEnv(name, fallback, { min: 1, max: 2048 });
}

export function documentUploadLimitBytes(): number {
  return megabytes("DOCUMENT_UPLOAD_LIMIT_MB", 25) * 1024 * 1024;
}

export function trainingAssetUploadLimitBytes(): number {
  return megabytes("TRAINING_ASSET_UPLOAD_LIMIT_MB", 250) * 1024 * 1024;
}

export function expressLimit(bytes: number): string {
  return `${bytes}b`;
}
