import { getPrisma } from "../lib/prisma.js";
import { HttpError } from "../utils/http-error.js";
import { buildPaginatedResult } from "../utils/pagination.js";

export interface UserListOptions {
  query?: string;
  page: number;
  pageSize: number;
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export async function findActiveUserByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) throw new HttpError(400, "E-posta adresi zorunludur.");

  const prisma = await getPrisma();
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      email: { equals: normalizedEmail, mode: "insensitive" },
    },
    take: 2,
    select: { id: true, role: true, isActive: true, email: true },
  });

  if (users.length === 0) {
    throw new HttpError(401, "Bu e-posta adresiyle aktif kullanıcı bulunamadı.");
  }
  if (users.length > 1) {
    throw new HttpError(
      409,
      "E-posta adresi birden fazla kullanıcıyla eşleşiyor. Kullanıcı tablosunda e-posta alanı benzersiz olmalıdır."
    );
  }
  return users[0];
}

export async function resolveActiveUserIdsByEmails(emails: string[]): Promise<string[]> {
  const normalizedEmails = [...new Set(emails.map(normalizeEmail).filter(Boolean))];
  if (!normalizedEmails.length) return [];

  const prisma = await getPrisma();
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      email: { in: normalizedEmails, mode: "insensitive" },
    },
    select: { id: true, email: true },
  });

  const byEmail = new Map<string, string[]>();
  for (const user of users) {
    const key = normalizeEmail(user.email ?? "");
    if (!key) continue;
    byEmail.set(key, [...(byEmail.get(key) ?? []), user.id]);
  }

  const missing = normalizedEmails.filter((email) => !byEmail.has(email));
  if (missing.length) {
    throw new HttpError(400, `Aktif kullanıcı bulunamayan e-postalar: ${missing.join(", ")}`);
  }

  const duplicates = normalizedEmails.filter((email) => (byEmail.get(email)?.length ?? 0) > 1);
  if (duplicates.length) {
    throw new HttpError(
      409,
      `Birden fazla kullanıcıyla eşleşen e-postalar: ${duplicates.join(", ")}. E-posta alanı benzersiz olmalıdır.`
    );
  }

  return normalizedEmails.map((email) => byEmail.get(email)?.[0] as string);
}

export async function getActiveUsers(options: UserListOptions) {
  const prisma = await getPrisma();
  const term = options.query?.trim();
  const where = {
    isActive: true,
    ...(term
      ? {
          OR: [
            { name: { contains: term, mode: "insensitive" as const } },
            { email: { contains: term, mode: "insensitive" as const } },
            { title: { contains: term, mode: "insensitive" as const } },
            { department: { contains: term, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [total, items] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        title: true,
        department: true,
        role: true,
        isActive: true,
      },
    }),
  ]);

  return buildPaginatedResult(items, total, options.page, options.pageSize);
}
