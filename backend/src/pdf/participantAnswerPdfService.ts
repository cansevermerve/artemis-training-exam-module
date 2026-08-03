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

export interface ParticipantAnswerPdfOption {
  id: string;
  text?: string | null;
  imageUrl?: string | null;
  order: number;
  isCorrect: boolean;
}

export interface ParticipantAnswerPdfQuestion {
  id: string;
  text: string;
  order: number;
  imageUrl?: string | null;
  options: ParticipantAnswerPdfOption[];
}

export interface ParticipantAnswerPdfAnswer {
  questionId: string;
  selectedOptionIds?: string[];
  isCorrect?: boolean | null;
}

export interface ParticipantAnswerPdfInput {
  attemptId: string;
  trainingTitle: string;
  participantName: string;
  participantTitle?: string | null;
  submittedAt?: string | Date | null;
  score?: number | null;
  passed?: boolean | null;
  questions: ParticipantAnswerPdfQuestion[];
  answers: ParticipantAnswerPdfAnswer[];
  templatePath?: string | null;
}

interface WrappedLine {
  text: string;
  width: number;
}

interface OptionLayout {
  letter: string;
  letterWidth: number;
  textLines: WrappedLine[];
  letterX: number;
  textX: number;
  markerX: number;
  maxTextWidth: number;
}

interface EmbeddedFonts {
  regular: PDFFont;
  bold: PDFFont;
}

const PAGE_WIDTH = 595.32;
const PAGE_HEIGHT = 841.92;

const COLUMN_X = [34.0, 302.0] as const;
const COLUMN_WIDTH = 253.0;

const CONTENT_TOP = 107.2;
const CONTENT_BOTTOM = 49.0;

const QUESTION_FONT_SIZE = 9.1;
const OPTION_FONT_SIZE = 9.0;
const LINE_HEIGHT = 10.7;

const OPTION_LEFT_GUTTER = 8.5;
const OPTION_PREFIX_GAP = 3.0;
const SELECTED_MARKER_RADIUS = 2.25;

const QUESTION_TO_FIRST_OPTION_GAP = 2.2;
const OPTION_GAP = 0.3;
const QUESTION_BOTTOM_GAP = 9.0;

const IMAGE_MAX_WIDTH = COLUMN_WIDTH - 10;
const IMAGE_MAX_HEIGHT = 90;
const IMAGE_TOP_GAP = 3;
const IMAGE_BOTTOM_GAP = 4;
const OPTION_IMAGE_MAX_WIDTH = COLUMN_WIDTH - 28;
const OPTION_IMAGE_MAX_HEIGHT = 72;
const OPTION_IMAGE_TOP_GAP = 2;
const OPTION_IMAGE_BOTTOM_GAP = 3;

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

const CORRECT_HIGHLIGHT = rgb(1, 0.93, 0.2);
const BLACK = rgb(0, 0, 0);

function findExistingPath(candidates: string[], description: string): string {
  const existingPath = candidates.find((candidate) => fs.existsSync(candidate));

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
      path.resolve(process.cwd(), "src", "pdf", "templates", "exam-template.pdf"),
      path.resolve(process.cwd(), "backend", "src", "pdf", "templates", "exam-template.pdf"),
      path.resolve(process.cwd(), "backend", "templates", "exam-template.pdf"),
      path.resolve(process.cwd(), "..", "templates", "exam-template.pdf"),
    ],
    "Resmî sınav PDF şablonu"
  );
}

function resolveRegularFontPath(): string {
  return findExistingPath(
    [
      path.resolve(process.cwd(), "fonts", "Carlito-Regular.ttf"),
      path.resolve(process.cwd(), "backend", "fonts", "Carlito-Regular.ttf"),
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
      path.resolve(process.cwd(), "fonts", "Carlito-Bold.ttf"),
      path.resolve(process.cwd(), "backend", "fonts", "Carlito-Bold.ttf"),
      "C:/Windows/Fonts/arialbd.ttf",
      "C:/Windows/Fonts/Arialbd.ttf",
      "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ],
    "Bold PDF fontu"
  );
}

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

function formatDate(value?: string | Date | null): string {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
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
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      const candidateWidth = font.widthOfTextAtSize(candidate, fontSize);

      if (candidateWidth <= maxWidth) {
        currentLine = candidate;
        continue;
      }

      if (currentLine) {
        result.push({
          text: currentLine,
          width: font.widthOfTextAtSize(currentLine, fontSize),
        });
      }

      if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
        let fragment = "";

        for (const character of word) {
          const fragmentCandidate = fragment + character;

          if (font.widthOfTextAtSize(fragmentCandidate, fontSize) <= maxWidth) {
            fragment = fragmentCandidate;
          } else {
            if (fragment) {
              result.push({
                text: fragment,
                width: font.widthOfTextAtSize(fragment, fontSize),
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
        width: font.widthOfTextAtSize(currentLine, fontSize),
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
    const baselineFromTop = topY + fontSize + index * LINE_HEIGHT;

    page.drawText(line.text, {
      x,
      y: topToPdfY(baselineFromTop),
      size: fontSize,
      font,
      color: BLACK,
    });
  });

  return lines.length * LINE_HEIGHT;
}

function getSortedOptions(
  question: ParticipantAnswerPdfQuestion
): ParticipantAnswerPdfOption[] {
  return [...question.options].sort(
    (first, second) => first.order - second.order
  );
}

function createOptionLayout(
  option: ParticipantAnswerPdfOption,
  optionIndex: number,
  fonts: EmbeddedFonts,
  columnX: number
): OptionLayout {
  const letter = `${OPTION_LETTERS[optionIndex] ?? optionIndex + 1})`;
  const letterWidth = fonts.regular.widthOfTextAtSize(
    letter,
    OPTION_FONT_SIZE
  );
  const letterX = columnX + OPTION_LEFT_GUTTER;
  const textX = letterX + letterWidth + OPTION_PREFIX_GAP;
  const maxTextWidth = Math.max(
    1,
    columnX + COLUMN_WIDTH - textX
  );
  const textLines = wrapText(
    option.text ?? "",
    fonts.regular,
    OPTION_FONT_SIZE,
    maxTextWidth
  );

  if (textLines.length === 0) {
    textLines.push({ text: "", width: 0 });
  }

  return {
    letter,
    letterWidth,
    textLines,
    letterX,
    textX,
    markerX: columnX + SELECTED_MARKER_RADIUS + 0.8,
    maxTextWidth,
  };
}

function measureQuestionHeight(
  question: ParticipantAnswerPdfQuestion,
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
    questionLines.length * LINE_HEIGHT + QUESTION_TO_FIRST_OPTION_GAP;

  getSortedOptions(question).forEach((option, index, options) => {
    const optionLayout = createOptionLayout(option, index, fonts, 0);

    height += optionLayout.textLines.length * LINE_HEIGHT;

    if (option.imageUrl && fs.existsSync(option.imageUrl)) {
      height +=
        OPTION_IMAGE_TOP_GAP +
        OPTION_IMAGE_MAX_HEIGHT +
        OPTION_IMAGE_BOTTOM_GAP;
    }

    if (index < options.length - 1) {
      height += OPTION_GAP;
    }
  });

  if (hasImage) {
    height += IMAGE_TOP_GAP + IMAGE_MAX_HEIGHT + IMAGE_BOTTOM_GAP;
  }

  return height + QUESTION_BOTTOM_GAP;
}

async function embedQuestionImage(
  outputPdf: PDFDocument,
  imagePath: string
): Promise<PDFImage | null> {
  if (!fs.existsSync(imagePath)) {
    return null;
  }

  const bytes = fs.readFileSync(imagePath);
  const extension = path.extname(imagePath).toLocaleLowerCase("tr-TR");

  try {
    if (extension === ".png") {
      return await outputPdf.embedPng(bytes);
    }

    if (extension === ".jpg" || extension === ".jpeg") {
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

function drawOptionDecorations(
  page: PDFPage,
  optionLayout: OptionLayout,
  topY: number,
  isCorrect: boolean,
  isSelected: boolean
): void {
  if (isCorrect) {
    optionLayout.textLines.forEach((line, index) => {
      if (!line.text) {
        return;
      }

      const lineTop = topY + index * LINE_HEIGHT;
      const horizontalPadding = 1.3;
      const verticalPadding = 1.0;

      page.drawRectangle({
        x: optionLayout.textX - horizontalPadding,
        y: topToPdfY(
          lineTop + OPTION_FONT_SIZE + verticalPadding
        ),
        width: Math.min(
          line.width + horizontalPadding * 2,
          optionLayout.maxTextWidth + horizontalPadding
        ),
        height: OPTION_FONT_SIZE + verticalPadding * 2,
        color: CORRECT_HIGHLIGHT,
        borderWidth: 0,
      });
    });
  }

  if (isSelected) {
    page.drawCircle({
      x: optionLayout.markerX,
      y: topToPdfY(topY + LINE_HEIGHT / 2),
      size: SELECTED_MARKER_RADIUS,
      color: BLACK,
    });
  }
}

function drawOption(
  page: PDFPage,
  optionLayout: OptionLayout,
  topY: number,
  fonts: EmbeddedFonts
): number {
  const firstBaselineTop = topY + OPTION_FONT_SIZE;

  page.drawText(optionLayout.letter, {
    x: optionLayout.letterX,
    y: topToPdfY(firstBaselineTop),
    size: OPTION_FONT_SIZE,
    font: fonts.regular,
    color: BLACK,
  });

  optionLayout.textLines.forEach((line, index) => {
    page.drawText(line.text, {
      x: optionLayout.textX,
      y: topToPdfY(
        topY + OPTION_FONT_SIZE + index * LINE_HEIGHT
      ),
      size: OPTION_FONT_SIZE,
      font: fonts.regular,
      color: BLACK,
    });
  });

  return optionLayout.textLines.length * LINE_HEIGHT;
}

async function drawAnsweredQuestion(
  outputPdf: PDFDocument,
  page: PDFPage,
  question: ParticipantAnswerPdfQuestion,
  answer: ParticipantAnswerPdfAnswer | undefined,
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

      const imageX = x + (COLUMN_WIDTH - imageSize.width) / 2;

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

  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    const optionLayout = createOptionLayout(
      option,
      index,
      fonts,
      x
    );
    const isSelected = answer?.selectedOptionIds?.includes(option.id) ?? false;

    drawOptionDecorations(
      page,
      optionLayout,
      currentTop,
      option.isCorrect,
      isSelected
    );

    currentTop += drawOption(
      page,
      optionLayout,
      currentTop,
      fonts
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
          x + OPTION_LEFT_GUTTER + 13 +
          (OPTION_IMAGE_MAX_WIDTH - imageSize.width) / 2;
        const imageY = topToPdfY(currentTop + imageSize.height);

        page.drawImage(embeddedOptionImage, {
          x: imageX,
          y: imageY,
          width: imageSize.width,
          height: imageSize.height,
        });

        if (option.isCorrect) {
          page.drawRectangle({
            x: imageX - 1.5,
            y: imageY - 1.5,
            width: imageSize.width + 3,
            height: imageSize.height + 3,
            borderColor: CORRECT_HIGHLIGHT,
            borderWidth: 2,
          });
        }

        currentTop += imageSize.height + OPTION_IMAGE_BOTTOM_GAP;
      }
    }

    if (index < options.length - 1) {
      currentTop += OPTION_GAP;
    }
  }

  return currentTop + QUESTION_BOTTOM_GAP;
}

function getVerticallyCenteredBaselineFromTop(
  rowTop: number,
  rowBottom: number,
  font: PDFFont,
  fontSize: number
): number {
  const ascent = font.heightAtSize(fontSize, { descender: false });
  const fullHeight = font.heightAtSize(fontSize, { descender: true });
  const rowHeight = rowBottom - rowTop;

  return rowTop + (rowHeight - fullHeight) / 2 + ascent;
}

function drawParticipantHeaderValues(
  page: PDFPage,
  input: ParticipantAnswerPdfInput,
  fonts: EmbeddedFonts
): void {
  // Ölçülen şablon geometrisi (PDF üstten koordinatlar):
  // sağ tablo x=379.51..552.46; yatay çizgi merkezleri
  // 35.64, 49.56, 63.48, 77.88, 91.82 pt.
  const valueX = 438.5;
  const valueRight = 548.5;
  const fontSize = 7.2;

  const headerValues = [
    {
      text: normalizeText(input.participantName),
      rowTop: 35.64,
      rowBottom: 49.56,
    },
    {
      text: normalizeText(input.participantTitle ?? ""),
      rowTop: 49.56,
      rowBottom: 63.48,
    },
    {
      text: formatDate(input.submittedAt),
      rowTop: 63.48,
      rowBottom: 77.88,
    },
  ];

  headerValues.forEach(({ text, rowTop, rowBottom }) => {
    if (!text) {
      return;
    }

    const maxWidth = valueRight - valueX;
    let fittedFontSize = fontSize;

    while (
      fittedFontSize > 5.8 &&
      fonts.regular.widthOfTextAtSize(text, fittedFontSize) > maxWidth
    ) {
      fittedFontSize -= 0.2;
    }

    page.drawText(text, {
      x: valueX,
      y: topToPdfY(
        getVerticallyCenteredBaselineFromTop(
          rowTop,
          rowBottom,
          fonts.regular,
          fittedFontSize
        )
      ),
      size: fittedFontSize,
      font: fonts.regular,
      color: BLACK,
      maxWidth,
    });
  });

  const summaryParts: string[] = [];

  if (input.score !== null && input.score !== undefined) {
    summaryParts.push(`Puan: ${input.score}`);
  }

  if (input.passed !== null && input.passed !== undefined) {
    summaryParts.push(input.passed ? "Başarılı" : "Başarısız");
  }

  page.drawText(
    `Sarı: doğru cevap   ●: katılımcının seçimi${
      summaryParts.length
        ? `   |   ${summaryParts.join(" - ")}`
        : ""
    }`,
    {
      x: 34,
      y: topToPdfY(99),
      size: 7.3,
      font: fonts.regular,
      color: BLACK,
    }
  );
}

async function copyTemplatePage(
  templatePdf: PDFDocument,
  outputPdf: PDFDocument,
  input: ParticipantAnswerPdfInput,
  fonts: EmbeddedFonts
): Promise<PDFPage> {
  const [copiedPage] = await outputPdf.copyPages(templatePdf, [0]);
  outputPdf.addPage(copiedPage);

  copiedPage.drawRectangle({
    x: 34,
    y: CONTENT_BOTTOM,
    width: PAGE_WIDTH - 34 - 41,
    height: PAGE_HEIGHT - CONTENT_TOP - CONTENT_BOTTOM,
    color: rgb(1, 1, 1),
    borderWidth: 0,
  });

  drawParticipantHeaderValues(copiedPage, input, fonts);

  return copiedPage;
}

async function embedFonts(outputPdf: PDFDocument): Promise<EmbeddedFonts> {
  const regularFontPath = resolveRegularFontPath();
  const boldFontPath = resolveBoldFontPath();

  outputPdf.registerFontkit(fontkit);

  const regularBytes = fs.readFileSync(regularFontPath);
  const boldBytes = fs.readFileSync(boldFontPath);

  return {
    regular: await outputPdf.embedFont(regularBytes, { subset: true }),
    bold: await outputPdf.embedFont(boldBytes, { subset: true }),
  };
}

export async function generateParticipantAnswerPdf(
  input: ParticipantAnswerPdfInput
): Promise<Buffer> {
  try {
    if (!input) {
      throw new Error("Katılımcı sınav bilgisi bulunamadı.");
    }

    if (!input.questions?.length) {
      throw new Error("PDF'e eklenecek soru bulunamadı.");
    }

    const templatePath =
      input.templatePath?.trim() || resolveDefaultTemplatePath();

    assertFileExists(templatePath, "Resmî sınav PDF şablonu");

    const templatePdf = await PDFDocument.load(
      fs.readFileSync(templatePath)
    );

    if (templatePdf.getPageCount() === 0) {
      throw new Error("Resmî sınav PDF şablonunda sayfa bulunamadı.");
    }

    const templatePage = templatePdf.getPage(0);
    const { width, height } = templatePage.getSize();

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
      outputPdf,
      input,
      fonts
    );

    let columnIndex = 0;
    let currentTop = CONTENT_TOP;

    const answersByQuestionId = new Map(
      input.answers.map((answer) => [answer.questionId, answer])
    );

    const sortedQuestions = [...input.questions].sort(
      (first, second) => first.order - second.order
    );

    for (const question of sortedQuestions) {
      const hasUsableImage =
        Boolean(question.imageUrl) &&
        fs.existsSync(question.imageUrl as string);

      const requiredHeight = measureQuestionHeight(
        question,
        fonts,
        hasUsableImage
      );

      const availableHeight = PAGE_HEIGHT - CONTENT_BOTTOM - currentTop;

      if (requiredHeight > availableHeight) {
        if (columnIndex === 0) {
          columnIndex = 1;
          currentTop = CONTENT_TOP;
        } else {
          page = await copyTemplatePage(
            templatePdf,
            outputPdf,
            input,
            fonts
          );

          columnIndex = 0;
          currentTop = CONTENT_TOP;
        }
      }

      currentTop = await drawAnsweredQuestion(
        outputPdf,
        page,
        question,
        answersByQuestionId.get(question.id),
        fonts,
        COLUMN_X[columnIndex],
        currentTop
      );
    }

    outputPdf.setTitle(
      `${input.trainingTitle} - ${input.participantName} Katılımcı Cevapları`
    );
    outputPdf.setSubject("Katılımcı Sınav Cevapları");
    outputPdf.setCreator("Artemis Test Module");
    outputPdf.setProducer("Artemis Test Module");

    const pdfBytes = await outputPdf.save();
    return Buffer.from(pdfBytes);
  } catch (error) {
    console.error("PARTICIPANT ANSWER PDF ERROR:", error);

    if (error instanceof Error) {
      throw new Error(`Katılımcı cevap PDF'i oluşturulamadı: ${error.message}`);
    }

    throw new Error(
      "Katılımcı cevap PDF'i oluşturulamadı: Bilinmeyen hata."
    );
  }
}