import type { NextFunction, Request, Response } from "express";

import {
  getParticipantTrainingFile,
  getTrainingCommonDocuments,
  normalizeDocumentStatus,
  normalizeDocumentType,
  readDocumentFile,
  saveOsgbCertificate,
  savePersonalEmployeeDocument,
  saveSignedAttendanceFormDocument,
  saveSignedExamDocument,
} from "../services/document.service.js";
import { HttpError } from "../utils/http-error.js";
import {
  getOptionalHeader,
  getRequiredHeader,
  getStringParam,
} from "../utils/request.js";

function getBuffer(request: Request): Buffer {
  if (!Buffer.isBuffer(request.body)) {
    throw new HttpError(400, "Dosya gövdesi binary olarak gönderilmelidir.");
  }
  return request.body;
}

function decodeHeaderValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isPdf(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

function isPng(buffer: Buffer): boolean {
  return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
}

function isJpeg(buffer: Buffer): boolean {
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

function isWebp(buffer: Buffer): boolean {
  return buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP";
}

function validateManualDocument(mimeType: string, buffer: Buffer): void {
  const valid =
    (mimeType === "application/pdf" && isPdf(buffer)) ||
    (mimeType === "image/png" && isPng(buffer)) ||
    (mimeType === "image/jpeg" && isJpeg(buffer)) ||
    (mimeType === "image/webp" && isWebp(buffer));
  if (!valid) {
    throw new HttpError(400, "Manuel belge yalnızca geçerli PDF, PNG, JPEG veya WebP olabilir.");
  }
}

function buildUploadInput(
  request: Request,
  employeeId: string,
  forcedType?: ReturnType<typeof normalizeDocumentType>
) {
  const trainingId = getRequiredHeader(request, "x-training-id");
  const originalName = decodeHeaderValue(getRequiredHeader(request, "x-file-name"));
  const type = forcedType ?? normalizeDocumentType(getRequiredHeader(request, "x-document-type"));
  const buffer = getBuffer(request);
  const mimeType = (request.header("content-type") ?? "application/octet-stream")
    .split(";")[0]
    .trim()
    .toLowerCase();
  validateManualDocument(mimeType, buffer);
  return {
    employeeId,
    trainingId,
    assignmentId: getOptionalHeader(request, "x-assignment-id") ?? null,
    attemptId: getOptionalHeader(request, "x-attempt-id") ?? null,
    uploadedById: request.auth?.userId ?? null,
    type,
    status: normalizeDocumentStatus(getOptionalHeader(request, "x-document-status")),
    title: getOptionalHeader(request, "x-document-title")
      ? decodeHeaderValue(getRequiredHeader(request, "x-document-title"))
      : originalName,
    originalName,
    mimeType,
    documentDate: getOptionalHeader(request, "x-document-date"),
    buffer,
  };
}

export async function uploadEmployeeDocument(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const employeeId = getStringParam(request, "employeeId");
    const input = buildUploadInput(request, employeeId);
    const allowedManualTypes = new Set(["SIGNED_EXAM", "OTHER"]);
    if (!allowedManualTypes.has(input.type)) {
      throw new HttpError(
        400,
        "Bu belge türü generic upload endpoint'i üzerinden yüklenemez. Sistem PDF'leri, eğitim varlıkları ve OSGB sertifikaları kendi özel akışlarını kullanmalıdır."
      );
    }
    if (!input.assignmentId) {
      throw new HttpError(400, "Kişiye özel belge ilgili eğitim atamasına bağlanmalıdır.");
    }
    const document = input.type === "SIGNED_EXAM"
      ? await saveSignedExamDocument(input)
      : await savePersonalEmployeeDocument(input);
    response.status(201).json({ success: true, data: document });
  } catch (error) {
    next(error);
  }
}

export async function getTrainingDocumentsController(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const trainingId = getStringParam(request, "trainingId");
    response.status(200).json({
      success: true,
      data: await getTrainingCommonDocuments(trainingId),
    });
  } catch (error) {
    next(error);
  }
}

export async function uploadSignedAttendanceForm(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const trainingId = getStringParam(request, "trainingId");
    const originalName = decodeHeaderValue(getRequiredHeader(request, "x-file-name"));
    const buffer = getBuffer(request);
    const mimeType = (request.header("content-type") ?? "application/octet-stream")
      .split(";")[0]
      .trim()
      .toLowerCase();
    validateManualDocument(mimeType, buffer);
    const document = await saveSignedAttendanceFormDocument({
      trainingId,
      uploadedById: request.auth?.userId ?? null,
      type: "SIGNED_ATTENDANCE_FORM",
      status: "SIGNED",
      title: getOptionalHeader(request, "x-document-title")
        ? decodeHeaderValue(getRequiredHeader(request, "x-document-title"))
        : originalName,
      originalName,
      mimeType,
      documentDate: getOptionalHeader(request, "x-document-date"),
      buffer,
    });
    response.status(201).json({ success: true, data: document });
  } catch (error) {
    next(error);
  }
}

export async function getParticipantTrainingFileController(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const trainingId = getStringParam(request, "trainingId");
    const employeeId = getStringParam(request, "employeeId");
    response.status(200).json({
      success: true,
      data: await getParticipantTrainingFile(trainingId, employeeId),
    });
  } catch (error) {
    next(error);
  }
}

export async function uploadOsgbCertificate(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const employeeId = getStringParam(request, "employeeId");
    const input = buildUploadInput(request, employeeId, "OSGB_CERTIFICATE");
    if (input.mimeType.split(";")[0].trim().toLowerCase() !== "application/pdf" || !isPdf(input.buffer)) {
      throw new HttpError(400, "OSGB sertifikası geçerli bir PDF dosyası olmalıdır.");
    }
    const document = await saveOsgbCertificate(input);
    response.status(201).json({ success: true, data: document });
  } catch (error) {
    next(error);
  }
}

async function sendDocument(
  request: Request,
  response: Response,
  next: NextFunction,
  disposition: "inline" | "attachment"
): Promise<void> {
  try {
    const documentId = getStringParam(request, "documentId");
    const { document, buffer } = await readDocumentFile(documentId);
    response.setHeader("Content-Type", document.mimeType);
    response.setHeader("Content-Length", String(buffer.length));
    response.setHeader(
      "Content-Disposition",
      `${disposition}; filename*=UTF-8''${encodeURIComponent(document.originalName)}`
    );
    const cacheableAssetTypes = new Set(["TRAINING_COVER", "TRAINING_CONTENT", "QUESTION_IMAGE", "OPTION_IMAGE"]);
    response.setHeader(
      "Cache-Control",
      cacheableAssetTypes.has(document.type) ? "private, max-age=300" : "private, no-store"
    );
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.status(200).send(buffer);
  } catch (error) {
    next(error);
  }
}

export function previewDocument(request: Request, response: Response, next: NextFunction): void {
  void sendDocument(request, response, next, "inline");
}

export function downloadDocument(request: Request, response: Response, next: NextFunction): void {
  void sendDocument(request, response, next, "attachment");
}
