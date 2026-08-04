/**
 * Ölçme Değerlendirme Formu PDF üreticisi (pdf-lib).
 *
 * Resmî sınav şablonunun ilk sayfasını kopyalar, eski soru alanını temizler ve
 * eğitimdeki soru/şıkları iki sütunlu düzende şablon üzerine yerleştirir.
 * Soru görselleri PNG/JPG olarak desteklenir; içerik sığmadığında ikinci sütuna
 * veya yeni şablon sayfasına geçilir.
 */
import {
  PDFDocument,
  PDFPage,
  PDFFont,
  PDFImage,
  rgb,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

export interface ExamPdfOption {
  id: string;
  text?: string | null;
  imageUrl?: string | null;
  order: number;
}

export interface ExamPdfQuestion {
  id: string;
  text: string;
  order: number;
  imageUrl?: string | null;
  options: ExamPdfOption[];
}

export interface ExamPdfTraining {
  id: string;
  title: string;
  examDurationMinutes: number;
  passingScore: number;
  questions: ExamPdfQuestion[];

  /*
   * Her eğitim farklı bir resmî şablon kullanabilecekse bu alanı doldur.
   * Doldurulmazsa DEFAULT_TEMPLATE_PATH kullanılır.
   */
  templatePath?: string | null;
}

// ---------- DOSYA YOLU ÇÖZÜMLEME ----------
function findExistingPath(
  candidates: string[],
  description: string
): string {
  const existingPath = candidates.find((candidate) =>
    fs.existsSync(candidate)
  );

  if (!existingPath) {
    throw new Error(
      `${description} bulunamadı. Kontrol edilen yollar:\n${candidates.join("\n")}`
    );
  }

  return existingPath;
}

function resolveDefaultTemplatePath(): string {
  return findExistingPath(
    [
      path.resolve(moduleDirectory, "templates", "exam-template.pdf"),
      path.resolve(moduleDirectory, "../../src/pdf/templates", "exam-template.pdf"),
      path.resolve(
        process.cwd(),
        "src",
        "pdf",
        "templates",
        "exam-template.pdf"
      ),
      path.resolve(
        process.cwd(),
        "backend",
        "templates",
        "exam-template.pdf"
      ),
      path.resolve(
        process.cwd(),
        "..",
        "templates",
        "exam-template.pdf"
      ),
    ],
    "Resmî sınav PDF şablonu"
  );
}

function resolveRegularFontPath(): string {
  return findExistingPath(
    [
      path.resolve(
        process.cwd(),
        "fonts",
        "Carlito-Regular.ttf"
      ),
      path.resolve(
        process.cwd(),
        "backend",
        "fonts",
        "Carlito-Regular.ttf"
      ),
      "C:/Windows/Fonts/arial.ttf",
      "C:/Windows/Fonts/Arial.ttf",
      "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ],
    "Regular PDF fontu"
  );
}

function resolveBoldFontPath(): string {
  return findExistingPath(
    [
      path.resolve(
        process.cwd(),
        "fonts",
        "Carlito-Bold.ttf"
      ),
      path.resolve(
        process.cwd(),
        "backend",
        "fonts",
        "Carlito-Bold.ttf"
      ),
      "C:/Windows/Fonts/arialbd.ttf",
      "C:/Windows/Fonts/Arialbd.ttf",
      "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ],
    "Bold PDF fontu"
  );
}

/*
 * pdfplumber ölçüleri sayfanın sol üstünden alınmıştır. pdf-lib koordinatları
 * sol alttan başladığı için çizim sırasında topToPdfY ile dönüştürülür.
 */

// ---------- SAYFA / İÇERİK ALANI ----------
const PAGE_WIDTH = 595.32;
const PAGE_HEIGHT = 841.92;
const CONTENT_TOP = 107.2;
const CONTENT_BOTTOM = 49.0;

// ---------- İKİ SÜTUNLU SORU DÜZENİ ----------
const COLUMN_X = [34.0, 302.0] as const;
const COLUMN_WIDTH = 253.0;

// ---------- YAZI / BOŞLUK AYARLARI ----------
const QUESTION_FONT_SIZE = 9.1;
const OPTION_FONT_SIZE = 9.0;
const LINE_HEIGHT = 10.7;
const QUESTION_TO_FIRST_OPTION_GAP = 2.2;
const OPTION_GAP = 0.3;
const QUESTION_BOTTOM_GAP = 9.0;

// ---------- SORU GÖRSELİ AYARLARI ----------
const IMAGE_MAX_WIDTH = COLUMN_WIDTH - 50;
const IMAGE_MAX_HEIGHT = 60;
const IMAGE_TOP_GAP = 3;
const IMAGE_BOTTOM_GAP = 4;
const OPTION_IMAGE_MAX_WIDTH = COLUMN_WIDTH - 26;
const OPTION_IMAGE_MAX_HEIGHT = 72;
const OPTION_IMAGE_TOP_GAP = 2;
const OPTION_IMAGE_BOTTOM_GAP = 3;

// Tüm şıkların görseli varsa referanstaki gibi küçük ve yan yana kartlar kullanılır.
const OPTION_IMAGE_GRID_MAX_COLUMNS = 4;
const OPTION_IMAGE_GRID_GAP = 4;
const OPTION_IMAGE_GRID_FONT_SIZE = 7.2;
const OPTION_IMAGE_GRID_LINE_HEIGHT = 8.2;
const OPTION_IMAGE_GRID_LABEL_GAP = 1.5;
const OPTION_IMAGE_GRID_MAX_HEIGHT = 46;
const OPTION_IMAGE_GRID_ROW_GAP = 4;

const OPTION_LETTERS = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
];

interface WrappedLine {
  text: string;
  width: number;
}

interface EmbeddedFonts {
  regular: PDFFont;
  bold: PDFFont;
}

// ---------- METİN / ÖLÇÜM YARDIMCILARI ----------
function assertFileExists(filePath: string, description: string): void {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${description} bulunamadı: ${filePath}`);
  }
}

function normalizeText(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function topToPdfY(topY: number): number {
  return PAGE_HEIGHT - topY;
}

function wrapText(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): WrappedLine[] {
  const normalized = normalizeText(text);

  if (!normalized) {
    return [];
  }

  const result: WrappedLine[] = [];

  for (const paragraph of normalized.split("\n")) {
    const words = paragraph.split(" ").filter(Boolean);

    if (words.length === 0) {
      result.push({ text: "", width: 0 });
      continue;
    }

    let currentLine = "";

    for (const word of words) {
      const candidate = currentLine
        ? `${currentLine} ${word}`
        : word;

      const candidateWidth = font.widthOfTextAtSize(
        candidate,
        fontSize
      );

      if (candidateWidth <= maxWidth) {
        currentLine = candidate;
        continue;
      }

      if (currentLine) {
        result.push({
          text: currentLine,
          width: font.widthOfTextAtSize(
            currentLine,
            fontSize
          ),
        });
      }

      /*
       * Tek bir kelime sütundan genişse karakter bazında böl.
       */
      if (
        font.widthOfTextAtSize(word, fontSize) >
        maxWidth
      ) {
        let fragment = "";

        for (const character of word) {
          const fragmentCandidate = fragment + character;

          if (
            font.widthOfTextAtSize(
              fragmentCandidate,
              fontSize
            ) <= maxWidth
          ) {
            fragment = fragmentCandidate;
          } else {
            if (fragment) {
              result.push({
                text: fragment,
                width: font.widthOfTextAtSize(
                  fragment,
                  fontSize
                ),
              });
            }

            fragment = character;
          }
        }

        currentLine = fragment;
      } else {
        currentLine = word;
      }
    }

    if (currentLine) {
      result.push({
        text: currentLine,
        width: font.widthOfTextAtSize(
          currentLine,
          fontSize
        ),
      });
    }
  }

  return result;
}

function drawWrappedTextFromTop(
  page: PDFPage,
  lines: WrappedLine[],
  x: number,
  topY: number,
  font: PDFFont,
  fontSize: number
): number {
  lines.forEach((line, index) => {
    /*
     * pdf-lib metni baseline üzerinden çizer.
     * topY'yi görsel üst koordinat olarak tutup baseline'a çeviriyoruz.
     */
    const baselineFromTop =
      topY + fontSize + index * LINE_HEIGHT;

    page.drawText(line.text, {
      x,
      y: topToPdfY(baselineFromTop),
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    });
  });

  return lines.length * LINE_HEIGHT;
}

function getSortedOptions(
  question: ExamPdfQuestion
): ExamPdfOption[] {
  return [...question.options].sort(
    (first, second) => first.order - second.order
  );
}

function hasUsableOptionImage(option: ExamPdfOption): boolean {
  return Boolean(option.imageUrl && fs.existsSync(option.imageUrl));
}

function shouldUseOptionImageGrid(options: ExamPdfOption[]): boolean {
  return options.length >= 2 && options.every(hasUsableOptionImage);
}

function getOptionImageGridColumnCount(options: ExamPdfOption[]): number {
  return Math.max(1, Math.min(OPTION_IMAGE_GRID_MAX_COLUMNS, options.length));
}

function getOptionImageGridCellWidth(options: ExamPdfOption[]): number {
  const columnCount = getOptionImageGridColumnCount(options);
  return (
    COLUMN_WIDTH - OPTION_IMAGE_GRID_GAP * (columnCount - 1)
  ) / columnCount;
}

function getOptionImageGridLabelLines(
  option: ExamPdfOption,
  optionIndex: number,
  fonts: EmbeddedFonts,
  cellWidth: number
): WrappedLine[] {
  const letter = OPTION_LETTERS[optionIndex] ?? `${optionIndex + 1}`;
  const label = option.text?.trim()
    ? `${letter}) ${option.text}`
    : `${letter})`;

  const lines = wrapText(
    label,
    fonts.regular,
    OPTION_IMAGE_GRID_FONT_SIZE,
    Math.max(1, cellWidth - 2)
  );

  return lines.length ? lines : [{ text: label, width: 0 }];
}

function measureQuestionHeight(
  question: ExamPdfQuestion,
  fonts: EmbeddedFonts,
  hasImage: boolean
): number {
  const questionLines = wrapText(
    `${question.order}- ${question.text}`,
    fonts.bold,
    QUESTION_FONT_SIZE,
    COLUMN_WIDTH
  );

  let height =
    questionLines.length * LINE_HEIGHT +
    QUESTION_TO_FIRST_OPTION_GAP;

  const options = getSortedOptions(question);

  if (shouldUseOptionImageGrid(options)) {
    const columnCount = getOptionImageGridColumnCount(options);
    const cellWidth = getOptionImageGridCellWidth(options);

    for (let rowStart = 0; rowStart < options.length; rowStart += columnCount) {
      const rowOptions = options.slice(rowStart, rowStart + columnCount);
      const maximumLabelLineCount = Math.max(
        1,
        ...rowOptions.map((option, rowIndex) =>
          getOptionImageGridLabelLines(
            option,
            rowStart + rowIndex,
            fonts,
            cellWidth
          ).length
        )
      );

      height +=
        maximumLabelLineCount * OPTION_IMAGE_GRID_LINE_HEIGHT +
        OPTION_IMAGE_GRID_LABEL_GAP +
        OPTION_IMAGE_GRID_MAX_HEIGHT;

      if (rowStart + columnCount < options.length) {
        height += OPTION_IMAGE_GRID_ROW_GAP;
      }
    }
  } else {
    options.forEach((option, index) => {
      const letter = OPTION_LETTERS[index] ?? `${index + 1}`;
      const label = option.text?.trim()
        ? `${letter}) ${option.text}`
        : `${letter})`;

      const optionLines = wrapText(
        label,
        fonts.regular,
        OPTION_FONT_SIZE,
        COLUMN_WIDTH
      );

      height += Math.max(1, optionLines.length) * LINE_HEIGHT;

      if (hasUsableOptionImage(option)) {
        height +=
          OPTION_IMAGE_TOP_GAP +
          OPTION_IMAGE_MAX_HEIGHT +
          OPTION_IMAGE_BOTTOM_GAP;
      }

      if (index < options.length - 1) {
        height += OPTION_GAP;
      }
    });
  }

  if (hasImage) {
    height +=
      IMAGE_TOP_GAP +
      IMAGE_MAX_HEIGHT +
      IMAGE_BOTTOM_GAP;
  }

  return height + QUESTION_BOTTOM_GAP;
}

// ---------- GÖRSEL YARDIMCILARI ----------
async function embedQuestionImage(
  outputPdf: PDFDocument,
  imagePath: string
): Promise<PDFImage | null> {
  if (!fs.existsSync(imagePath)) {
    return null;
  }

  const bytes = fs.readFileSync(imagePath);
  const extension = path
    .extname(imagePath)
    .toLocaleLowerCase("tr-TR");

  try {
    if (extension === ".png") {
      return await outputPdf.embedPng(bytes);
    }

    if (
      extension === ".jpg" ||
      extension === ".jpeg"
    ) {
      return await outputPdf.embedJpg(bytes);
    }

    return null;
  } catch {
    return null;
  }
}

function getContainedImageSize(
  image: PDFImage,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  const scale = Math.min(
    maxWidth / image.width,
    maxHeight / image.height,
    1
  );

  return {
    width: image.width * scale,
    height: image.height * scale,
  };
}

// ---------- SORU ÇİZİMİ ----------
async function drawQuestion(
  outputPdf: PDFDocument,
  page: PDFPage,
  question: ExamPdfQuestion,
  fonts: EmbeddedFonts,
  x: number,
  topY: number
): Promise<number> {
  const questionLines = wrapText(
    `${question.order}- ${question.text}`,
    fonts.bold,
    QUESTION_FONT_SIZE,
    COLUMN_WIDTH
  );

  let currentTop = topY;

  currentTop += drawWrappedTextFromTop(
    page,
    questionLines,
    x,
    currentTop,
    fonts.bold,
    QUESTION_FONT_SIZE
  );

  currentTop += QUESTION_TO_FIRST_OPTION_GAP;

  /*
   * Soru görseli, soru metninden sonra ve şıklardan önce çizilir.
   */
  if (question.imageUrl) {
    const embeddedImage = await embedQuestionImage(
      outputPdf,
      question.imageUrl
    );

    if (embeddedImage) {
      currentTop += IMAGE_TOP_GAP;

      const imageSize = getContainedImageSize(
        embeddedImage,
        IMAGE_MAX_WIDTH,
        IMAGE_MAX_HEIGHT
      );

      const imageX =
        x + (COLUMN_WIDTH - imageSize.width) / 2;

      page.drawImage(embeddedImage, {
        x: imageX,
        y: topToPdfY(currentTop + imageSize.height),
        width: imageSize.width,
        height: imageSize.height,
      });

      currentTop += imageSize.height + IMAGE_BOTTOM_GAP;
    }
  }

  const options = getSortedOptions(question);

  if (shouldUseOptionImageGrid(options)) {
    const columnCount = getOptionImageGridColumnCount(options);
    const cellWidth = getOptionImageGridCellWidth(options);

    for (let rowStart = 0; rowStart < options.length; rowStart += columnCount) {
      const rowOptions = options.slice(rowStart, rowStart + columnCount);
      const labelLinesByOption = rowOptions.map((option, rowIndex) =>
        getOptionImageGridLabelLines(
          option,
          rowStart + rowIndex,
          fonts,
          cellWidth
        )
      );
      const maximumLabelLineCount = Math.max(
        1,
        ...labelLinesByOption.map((lines) => lines.length)
      );
      const labelHeight =
        maximumLabelLineCount * OPTION_IMAGE_GRID_LINE_HEIGHT;
      const imageSlotTop =
        currentTop + labelHeight + OPTION_IMAGE_GRID_LABEL_GAP;

      for (let columnIndex = 0; columnIndex < rowOptions.length; columnIndex += 1) {
        const option = rowOptions[columnIndex];
        const cellX =
          x + columnIndex * (cellWidth + OPTION_IMAGE_GRID_GAP);
        const labelLines = labelLinesByOption[columnIndex];

        labelLines.forEach((line, lineIndex) => {
          page.drawText(line.text, {
            x: cellX,
            y: topToPdfY(
              currentTop +
              OPTION_IMAGE_GRID_FONT_SIZE +
              lineIndex * OPTION_IMAGE_GRID_LINE_HEIGHT
            ),
            size: OPTION_IMAGE_GRID_FONT_SIZE,
            font: fonts.regular,
            color: rgb(0, 0, 0),
          });
        });

        const embeddedOptionImage = await embedQuestionImage(
          outputPdf,
          option.imageUrl!
        );

        if (embeddedOptionImage) {
          const imageSize = getContainedImageSize(
            embeddedOptionImage,
            Math.max(1, cellWidth - 4),
            OPTION_IMAGE_GRID_MAX_HEIGHT
          );
          const imageX = cellX + (cellWidth - imageSize.width) / 2;
          const imageTop =
            imageSlotTop +
            (OPTION_IMAGE_GRID_MAX_HEIGHT - imageSize.height) / 2;

          page.drawImage(embeddedOptionImage, {
            x: imageX,
            y: topToPdfY(imageTop + imageSize.height),
            width: imageSize.width,
            height: imageSize.height,
          });
        }
      }

      currentTop = imageSlotTop + OPTION_IMAGE_GRID_MAX_HEIGHT;

      if (rowStart + columnCount < options.length) {
        currentTop += OPTION_IMAGE_GRID_ROW_GAP;
      }
    }
  } else {
    for (let index = 0; index < options.length; index += 1) {
      const option = options[index];
      const letter = OPTION_LETTERS[index] ?? `${index + 1}`;
      const label = option.text?.trim()
        ? `${letter}) ${option.text}`
        : `${letter})`;

      const optionLines = wrapText(
        label,
        fonts.regular,
        OPTION_FONT_SIZE,
        COLUMN_WIDTH
      );

      currentTop += drawWrappedTextFromTop(
        page,
        optionLines.length ? optionLines : [{ text: label, width: 0 }],
        x,
        currentTop,
        fonts.regular,
        OPTION_FONT_SIZE
      );

      if (option.imageUrl) {
        const embeddedOptionImage = await embedQuestionImage(
          outputPdf,
          option.imageUrl
        );

        if (embeddedOptionImage) {
          currentTop += OPTION_IMAGE_TOP_GAP;

          const imageSize = getContainedImageSize(
            embeddedOptionImage,
            OPTION_IMAGE_MAX_WIDTH,
            OPTION_IMAGE_MAX_HEIGHT
          );

          const imageX =
            x + 13 + (OPTION_IMAGE_MAX_WIDTH - imageSize.width) / 2;

          page.drawImage(embeddedOptionImage, {
            x: imageX,
            y: topToPdfY(currentTop + imageSize.height),
            width: imageSize.width,
            height: imageSize.height,
          });

          currentTop += imageSize.height + OPTION_IMAGE_BOTTOM_GAP;
        }
      }

      if (index < options.length - 1) {
        currentTop += OPTION_GAP;
      }
    }
  }

  return currentTop + QUESTION_BOTTOM_GAP;
}

// ---------- ŞABLON SAYFASI ----------
async function copyTemplatePage(
  templatePdf: PDFDocument,
  outputPdf: PDFDocument
): Promise<PDFPage> {
  const [copiedPage] = await outputPdf.copyPages(
    templatePdf,
    [0]
  );

  outputPdf.addPage(copiedPage);

  /*
   * Şablondaki eski soruları temizler.
   * Üst başlık ve ad-soyad tablosu korunur.
   */
  copiedPage.drawRectangle({
    x: 34,
    y: CONTENT_BOTTOM,
    width: PAGE_WIDTH - 34 - 41,
    height:
      PAGE_HEIGHT -
      CONTENT_TOP -
      CONTENT_BOTTOM,
    color: rgb(1, 1, 1),
    borderWidth: 0,
  });

  return copiedPage;
}

// ---------- FONTLAR ----------
async function embedFonts(
  outputPdf: PDFDocument
): Promise<EmbeddedFonts> {
  const regularFontPath = resolveRegularFontPath();
  const boldFontPath = resolveBoldFontPath();

  outputPdf.registerFontkit(fontkit);

  const regularBytes = fs.readFileSync(
    regularFontPath
  );

  const boldBytes = fs.readFileSync(
    boldFontPath
  );

  return {
    regular: await outputPdf.embedFont(
      regularBytes,
      { subset: true }
    ),
    bold: await outputPdf.embedFont(
      boldBytes,
      { subset: true }
    ),
  };
}

// ---------- ANA PDF ÜRETİCİSİ ----------
export async function generateExamPdf(
  training: ExamPdfTraining
): Promise<Buffer> {
  try {
    if (!training) {
      throw new Error("Eğitim bilgisi bulunamadı.");
    }

    if (!training.questions?.length) {
      throw new Error(
        "Bu eğitime ait PDF'e eklenecek soru bulunamadı."
      );
    }

    const templatePath =
      training.templatePath?.trim() ||
      resolveDefaultTemplatePath();

    assertFileExists(
      templatePath,
      "Resmî sınav PDF şablonu"
    );

    const templateBytes =
      fs.readFileSync(templatePath);

    const templatePdf = await PDFDocument.load(
      templateBytes
    );

    if (templatePdf.getPageCount() === 0) {
      throw new Error(
        "Resmî sınav PDF şablonunda sayfa bulunamadı."
      );
    }

    const templatePage = templatePdf.getPage(0);
    const { width, height } =
      templatePage.getSize();

    if (
      Math.abs(width - PAGE_WIDTH) > 1 ||
      Math.abs(height - PAGE_HEIGHT) > 1
    ) {
      throw new Error(
        `Şablon A4 değil. Beklenen: ${PAGE_WIDTH} × ${PAGE_HEIGHT} pt, gelen: ${width} × ${height} pt.`
      );
    }

    const outputPdf = await PDFDocument.create();
    const fonts = await embedFonts(outputPdf);

    let page = await copyTemplatePage(
      templatePdf,
      outputPdf
    );

    let columnIndex = 0;
    let currentTop = CONTENT_TOP;

    const sortedQuestions = [
      ...training.questions,
    ].sort(
      (first, second) =>
        first.order - second.order
    );

    for (const question of sortedQuestions) {
      const hasUsableImage =
        Boolean(question.imageUrl) &&
        fs.existsSync(
          question.imageUrl as string
        );

      const requiredHeight =
        measureQuestionHeight(
          question,
          fonts,
          hasUsableImage
        );

      const availableHeight =
        PAGE_HEIGHT -
        CONTENT_BOTTOM -
        currentTop;

      if (requiredHeight > availableHeight) {
        if (columnIndex === 0) {
          columnIndex = 1;
          currentTop = CONTENT_TOP;
        } else {
          page = await copyTemplatePage(
            templatePdf,
            outputPdf
          );

          columnIndex = 0;
          currentTop = CONTENT_TOP;
        }
      }

      currentTop = await drawQuestion(
        outputPdf,
        page,
        question,
        fonts,
        COLUMN_X[columnIndex],
        currentTop
      );
    }

    outputPdf.setTitle(
      `${training.title} - Ölçme Değerlendirme Formu`
    );

    outputPdf.setSubject(
      "Ölçme Değerlendirme Formu"
    );

    outputPdf.setCreator(
      "Artemis Test Module"
    );

    outputPdf.setProducer(
      "Artemis Test Module"
    );

    const pdfBytes = await outputPdf.save();

    return Buffer.from(pdfBytes);
  } catch (error) {
    console.error(
      "PDF GENERATION ERROR:",
      error
    );

    if (error instanceof Error) {
      throw new Error(
        `PDF oluşturulamadı: ${error.message}`
      );
    }

    throw new Error(
      "PDF oluşturulamadı: Bilinmeyen hata."
    );
  }
}