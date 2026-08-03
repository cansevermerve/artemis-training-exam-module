import type { Request } from "express";

export interface PaginationInput {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> extends PaginationInput {
  items: T[];
  total: number;
  totalPages: number;
}

function parsePositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function readPagination(
  request: Request,
  defaults: { page?: number; pageSize?: number; maximumPageSize?: number } = {}
): PaginationInput {
  const maximumPageSize = defaults.maximumPageSize ?? 100;
  return {
    page: parsePositiveInteger(request.query.page, defaults.page ?? 1),
    pageSize: Math.min(
      maximumPageSize,
      parsePositiveInteger(request.query.pageSize, defaults.pageSize ?? 10)
    ),
  };
}

export function buildPaginatedResult<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number
): PaginatedResult<T> {
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
