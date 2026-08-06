import fs from "node:fs";

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";

function resolveUnicodeFontPath(bold = false): string {
  const candidates = bold
    ? [
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/Arialbd.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
      ]
    : [
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
      ];

  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error("PDF raporu için Unicode font bulunamadı.");
  }
  return found;
}

export interface TableReportPdfInput {
  title: string;
  headers: string[];
  rows: Array<Array<string | number | null | undefined>>;
}

export async function generateTableReportPdf(
  input: TableReportPdfInput
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);

  const regular = await pdf.embedFont(
    fs.readFileSync(resolveUnicodeFontPath(false))
  );
  const bold = await pdf.embedFont(
    fs.readFileSync(resolveUnicodeFontPath(true))
  );

  const width = 595.28;
  const height = 841.89;
  const margin = 34;
  const lineHeight = 17;
  let page = pdf.addPage([width, height]);
  let y = height - margin;

  const drawHeader = () => {
    page.drawText(input.title, {
      x: margin,
      y,
      size: 15,
      font: bold,
      color: rgb(0.12, 0.12, 0.12),
    });
    y -= 28;
    page.drawText(input.headers.join("   |   "), {
      x: margin,
      y,
      size: 8,
      font: bold,
    });
    y -= lineHeight;
  };

  drawHeader();

  for (const row of input.rows) {
    if (y < margin + lineHeight) {
      page = pdf.addPage([width, height]);
      y = height - margin;
      drawHeader();
    }

    const text = row
      .map((cell) =>
        String(cell ?? "—")
          .replace(/\s+/g, " ")
          .slice(0, 38)
      )
      .join("   |   ");

    page.drawText(text, {
      x: margin,
      y,
      size: 7.5,
      font: regular,
      maxWidth: width - margin * 2,
    });
    y -= lineHeight;
  }

  pdf.setTitle(input.title);
  pdf.setCreator("Artemis Test Module");
  pdf.setProducer("Artemis Test Module");

  return Buffer.from(await pdf.save());
}
