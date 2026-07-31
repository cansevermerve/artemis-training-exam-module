import type { ErrorRequestHandler, RequestHandler } from "express";

import { HttpError, isPrismaKnownRequestError } from "../utils/http-error.js";

export const notFoundHandler: RequestHandler = (request, response) => {
  response.status(404).json({
    success: false,
    message: `Endpoint bulunamadı: ${request.method} ${request.originalUrl}`,
  });
};

export const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next
) => {
  if (error instanceof HttpError) {
    response.status(error.statusCode).json({
      success: false,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    });
    return;
  }
  if (typeof error === "object" && error !== null && "type" in error && error.type === "entity.too.large") {
    response.status(413).json({ success: false, message: "Gönderilen dosya veya istek gövdesi izin verilen boyutu aşıyor." });
    return;
  }
  if (error instanceof SyntaxError && "body" in error) {
    response.status(400).json({ success: false, message: "Geçersiz JSON gövdesi." });
    return;
  }
  if (isPrismaKnownRequestError(error, "P2002")) {
    response.status(409).json({ success: false, message: "Aynı benzersiz kayıt zaten mevcut." });
    return;
  }
  if (isPrismaKnownRequestError(error, "P2003")) {
    response.status(400).json({ success: false, message: "İlişkili kayıt bulunamadı veya geçersiz." });
    return;
  }
  console.error("UNHANDLED API ERROR:", error);
  response.status(500).json({ success: false, message: "Beklenmeyen bir sunucu hatası oluştu." });
};
