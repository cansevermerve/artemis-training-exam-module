import type { Request } from "express";

import { HttpError } from "./http-error.js";

export function getStringParam(request: Request, name: string): string {
  const value = request.params[name];

  if (!value || Array.isArray(value) || !value.trim()) {
    throw new HttpError(400, `Geçersiz ${name}.`);
  }

  return value.trim();
}

export function getOptionalHeader(
  request: Request,
  name: string
): string | undefined {
  const value = request.header(name)?.trim();
  return value || undefined;
}

export function getRequiredHeader(request: Request, name: string): string {
  const value = getOptionalHeader(request, name);

  if (!value) {
    throw new HttpError(400, `${name} header alanı zorunludur.`);
  }

  return value;
}
