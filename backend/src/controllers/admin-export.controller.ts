import fs from "node:fs";
import path from "node:path";
import type { NextFunction, Request, Response } from "express";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";

import { getPrisma } from "../lib/prisma.js";
import { registerGeneratedDocument } from "../services/document.service.js";
import { HttpError } from "../utils/http-error.js";
import { getStringParam } from "../utils/request.js";

function fontPath(bold = false): string {
  const candidates = bold
    ? ["C:/Windows/Fonts/arialbd.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]
    : ["C:/Windows/Fonts/arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new HttpError(500, "PDF raporu için Unicode font bulunamadı.");
  return found;
}

function safeFilename(value: string): string {
  return value.toLocaleLowerCase("tr-TR").replace(/[^a-z0-9ğüşöçı]+/gi, "-").replace(/^-|-$/g, "").slice(0, 80) || "rapor";
}

function escapeXml(value: unknown): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function assignmentStatusLabel(status: string): string {
  if (status === "ASSIGNED") return "Atandı";
  if (status === "IN_PROGRESS") return "Devam Ediyor";
  if (status === "COMPLETED") return "Tamamlandı";
  if (status === "FAILED") return "Başarısız";
  if (status === "EXPIRED") return "Süresi Doldu";
  if (status === "CANCELLED") return "İptal Edildi";
  return status;
}

function attemptStatusLabel(status: string | undefined): string {
  if (!status) return "Girilmedi";
  if (status === "PASSED") return "Başarılı";
  if (status === "FAILED") return "Başarısız";
  if (status === "TIMED_OUT") return "Süre Doldu";
  if (status === "IN_PROGRESS") return "Devam Ediyor";
  return status;
}

async function reportPdf(title: string, headers: string[], rows: string[][]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(fs.readFileSync(fontPath(false)));
  const bold = await pdf.embedFont(fs.readFileSync(fontPath(true)));
  const width = 595.28;
  const height = 841.89;
  const margin = 34;
  const lineHeight = 17;
  let page = pdf.addPage([width, height]);
  let y = height - margin;
  const drawHeader = () => {
    page.drawText(title, { x: margin, y, size: 15, font: bold, color: rgb(0.12, 0.12, 0.12) });
    y -= 28;
    page.drawText(headers.join("   |   "), { x: margin, y, size: 8, font: bold });
    y -= lineHeight;
  };
  drawHeader();
  for (const row of rows) {
    if (y < margin + lineHeight) {
      page = pdf.addPage([width, height]);
      y = height - margin;
      drawHeader();
    }
    const text = row.map((cell) => String(cell ?? "—").replace(/\s+/g, " ").slice(0, 38)).join("   |   ");
    page.drawText(text, { x: margin, y, size: 7.5, font: regular, maxWidth: width - margin * 2 });
    y -= lineHeight;
  }
  return Buffer.from(await pdf.save());
}

async function loadTrainingReport(trainingId: string) {
  const prisma = await getPrisma();
  const training = await prisma.training.findUnique({
    where: { id: trainingId },
    include: {
      assignments: {
        where: { cancelledAt: null },
        orderBy: { assignedAt: "asc" },
        include: {
          user: { select: { id: true, name: true, email: true, title: true, department: true } },
          attempts: { where: { status: { not: "IN_PROGRESS" } }, orderBy: { attemptNumber: "desc" }, take: 1 },
        },
      },
    },
  });
  if (!training) throw new HttpError(404, "Eğitim bulunamadı.");
  return training;
}

function participantRows(training: any): string[][] {
  return training.assignments.map((assignment: any, index: number) => [
    String(index + 1),
    assignment.user.name ?? assignment.user.email ?? "Çalışan",
    assignment.user.title ?? "—",
    assignment.user.department ?? "—",
    assignmentStatusLabel(assignment.status),
    assignment.attempts[0]?.score === null || assignment.attempts[0]?.score === undefined ? "—" : String(assignment.attempts[0].score),
  ]);
}

export async function exportParticipantsPdf(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const trainingId = getStringParam(request, "trainingId");
    const training = await loadTrainingReport(trainingId);
    const buffer = await reportPdf(`${training.title} - Katılımcı Listesi`, ["No", "Ad Soyad", "Görev", "Departman", "Durum", "Puan"], participantRows(training));
    const fileName = `${safeFilename(training.title)}-katilimcilar.pdf`;
    const document = await registerGeneratedDocument({
      trainingId,
      uploadedById: request.auth?.userId ?? null,
      type: "PARTICIPANT_LIST",
      status: "ARCHIVED",
      title: `${training.title} Katılımcı Listesi`,
      originalName: fileName,
      mimeType: "application/pdf",
      buffer,
    });
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    response.setHeader("X-Document-Id", document.id);
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.send(buffer);
  } catch (error) { next(error); }
}

export async function exportResultsPdf(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const trainingId = getStringParam(request, "trainingId");
    const training = await loadTrainingReport(trainingId);
    const rows = training.assignments.map((assignment: any, index: number) => {
      const attempt = assignment.attempts[0];
      return [String(index + 1), assignment.user.name ?? assignment.user.email ?? "Çalışan", attempt?.attemptNumber ? String(attempt.attemptNumber) : "—", attemptStatusLabel(attempt?.status), attempt?.score === null || attempt?.score === undefined ? "—" : String(attempt.score), attempt?.submittedAt ? new Date(attempt.submittedAt).toLocaleString("tr-TR") : "—"];
    });
    const buffer = await reportPdf(`${training.title} - Sınav Sonuçları`, ["No", "Ad Soyad", "Deneme", "Sonuç", "Puan", "Tarih"], rows);
    const fileName = `${safeFilename(training.title)}-sonuclar.pdf`;
    const document = await registerGeneratedDocument({
      trainingId,
      uploadedById: request.auth?.userId ?? null,
      type: "RESULTS_REPORT",
      status: "ARCHIVED",
      title: `${training.title} Sonuç Raporu`,
      originalName: fileName,
      mimeType: "application/pdf",
      buffer,
    });
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    response.setHeader("X-Document-Id", document.id);
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.send(buffer);
  } catch (error) { next(error); }
}

export async function exportParticipantsExcel(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const trainingId = getStringParam(request, "trainingId");
    const training = await loadTrainingReport(trainingId);
    const rows = [["No", "Ad Soyad", "E-posta", "Görev", "Departman", "Durum", "Puan"], ...training.assignments.map((assignment: any, index: number) => [
      index + 1,
      assignment.user.name ?? "",
      assignment.user.email ?? "",
      assignment.user.title ?? "",
      assignment.user.department ?? "",
      assignmentStatusLabel(assignment.status),
      assignment.attempts[0]?.score ?? "",
    ])];
    const xmlRows = rows.map((row) => `<Row>${row.map((cell: string | number) => `<Cell><Data ss:Type="${typeof cell === "number" ? "Number" : "String"}">${escapeXml(cell)}</Data></Cell>`).join("")}</Row>`).join("");
    const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Katılımcılar"><Table>${xmlRows}</Table></Worksheet></Workbook>`;
    const buffer = Buffer.from(xml, "utf8");
    const fileName = `${safeFilename(training.title)}-katilimcilar.xls`;
    response.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.send(buffer);
  } catch (error) { next(error); }
}


export async function exportResultsExcel(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const trainingId = getStringParam(request, "trainingId");
    const training = await loadTrainingReport(trainingId);
    const rows = [
      ["No", "Ad Soyad", "E-posta", "Deneme", "Sonuç", "Puan", "Tarih"],
      ...training.assignments.map((assignment: any, index: number) => {
        const attempt = assignment.attempts[0];
        return [
          index + 1,
          assignment.user.name ?? "",
          assignment.user.email ?? "",
          attempt?.attemptNumber ?? "",
          attemptStatusLabel(attempt?.status),
          attempt?.score ?? "",
          attempt?.submittedAt ? new Date(attempt.submittedAt).toLocaleString("tr-TR") : "",
        ];
      }),
    ];
    const xmlRows = rows
      .map((row) =>
        `<Row>${row
          .map(
            (cell: string | number) =>
              `<Cell><Data ss:Type="${typeof cell === "number" ? "Number" : "String"}">${escapeXml(cell)}</Data></Cell>`
          )
          .join("")}</Row>`
      )
      .join("");
    const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Sonuçlar"><Table>${xmlRows}</Table></Worksheet></Workbook>`;
    const buffer = Buffer.from(xml, "utf8");
    const fileName = `${safeFilename(training.title)}-sonuclar.xls`;
    response.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.send(buffer);
  } catch (error) {
    next(error);
  }
}
