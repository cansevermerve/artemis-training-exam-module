import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { PrismaPg } from "@prisma/adapter-pg";

import { HttpError } from "../utils/http-error.js";

type PrismaClientConstructor = new (options: {
  adapter: PrismaPg;
}) => PrismaClientLike;

export type PrismaClientLike = Record<string, any> & {
  $transaction: any;
  $disconnect?: () => Promise<void>;
};

let prismaClientPromise: Promise<PrismaClientLike> | undefined;

export function hasGeneratedPrismaClient(): boolean {
  return ["client.js", "client.ts"].some((fileName) =>
    existsSync(fileURLToPath(new URL(`../generated/prisma/${fileName}`, import.meta.url)))
  );
}

async function createPrismaClient(): Promise<PrismaClientLike> {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new HttpError(
      503,
      "DATABASE_URL tanımlı değil. Prisma işlemi çalıştırılamadı."
    );
  }

  // prisma generate sonrasında bu modül oluşur. Değişken yol kullanımı,
  // DB erişimi olmayan geliştirme ortamında TypeScript build'inin yine de
  // çalışmasına izin verir.
  const generatedClientModule = "../generated/prisma/client.js";

  let generatedModule: { PrismaClient?: PrismaClientConstructor };

  try {
    generatedModule = (await import(generatedClientModule)) as {
      PrismaClient?: PrismaClientConstructor;
    };
  } catch {
    throw new HttpError(
      503,
      "Prisma Client üretilmemiş. Gerçek ortamda `npm run prisma:generate` çalıştırılmalıdır."
    );
  }

  if (!generatedModule.PrismaClient) {
    throw new HttpError(503, "Üretilen Prisma Client modülü geçersiz.");
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl });

  return new generatedModule.PrismaClient({ adapter });
}

export async function getPrisma(): Promise<PrismaClientLike> {
  prismaClientPromise ??= createPrismaClient();

  try {
    return await prismaClientPromise;
  } catch (error) {
    prismaClientPromise = undefined;
    throw error;
  }
}
