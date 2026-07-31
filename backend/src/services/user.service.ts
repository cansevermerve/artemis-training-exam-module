import { getPrisma } from "../lib/prisma.js";

export async function getActiveUsers(query?: string) {
  const prisma = await getPrisma();
  const term = query?.trim();
  return prisma.user.findMany({
    where: {
      isActive: true,
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: "insensitive" } },
              { email: { contains: term, mode: "insensitive" } },
              { title: { contains: term, mode: "insensitive" } },
              { department: { contains: term, mode: "insensitive" } },
            ],
          }
        : {}),
    },
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
  });
}
