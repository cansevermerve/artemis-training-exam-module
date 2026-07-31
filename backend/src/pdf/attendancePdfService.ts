import {
    PDFDocument,
    PDFPage,
    PDFFont,
    rgb,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type AttendanceTemplateType =
    | "ISG_BASIC"
    | "WORKING_AT_HEIGHT";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

export interface AttendancePdfParticipant {
    fullName: string;
    title?: string | null;
    result?: string | number | null;
}

export interface AttendancePdfInput {
    templateType: AttendanceTemplateType;
    trainingDate?: string | Date | null;
    organizationName?: string | null;
    durationHours?: number | null;
    participants: AttendancePdfParticipant[];
    templatePath?: string | null;
    documentTitle?: string | null;
}

interface EmbeddedFonts {
    regular: PDFFont;
    bold: PDFFont;
}

interface BoxCoordinates {
    x: number;
    top: number;
    right: number;
    bottom: number;
}

interface ColumnCoordinates {
    x: number;
    right: number;
}

interface AttendanceTemplateConfig {
    description: string;
    templateFileNames: string[];
    maxParticipants: number;
    headerFontSize: number;
    rowFontSize: number;
    dateValueBox: BoxCoordinates;
    organizationValueBox: BoxCoordinates;
    durationValueBox?: BoxCoordinates;
    durationMode: "DYNAMIC" | "STATIC";
    table: {
        firstRowTop: number;
        rowHeight: number;
        columns: {
            no: ColumnCoordinates;
            fullName: ColumnCoordinates;
            title: ColumnCoordinates;
            result: ColumnCoordinates;
        };
    };
}

const PAGE_WIDTH = 595.32;
const PAGE_HEIGHT = 841.92;
const BLACK = rgb(0, 0, 0);

const MIN_HEADER_FONT_SIZE = 5.8;
const MIN_ROW_FONT_SIZE = 5.6;
const FONT_SIZE_STEP = 0.2;
const CELL_HORIZONTAL_PADDING = 3;

const ATTENDANCE_TEMPLATE_CONFIGS: Record<
    AttendanceTemplateType,
    AttendanceTemplateConfig
> = {
    ISG_BASIC: {
        description: "İSG temel eğitim katılım tutanağı şablonu",
        templateFileNames: [
            "4_İSG_Temel_Eğitim_Katılım_Tutanağı_Kalibre_Format_Nisan_2026_Son_Format.pdf",
            "4_İSG_Temel_Eğitim_Katılım_Tutanağı_Kalibre_Format_Nisan_2026_Son_Format (1)(2).pdf",
            "isg-attendance-template.pdf",
        ],
        maxParticipants: 20,
        headerFontSize: 7.2,
        rowFontSize: 7.2,
        dateValueBox: {
            x: 451.75,
            top: 43.2,
            right: 550.54,
            bottom: 56.64,
        },
        organizationValueBox: {
            x: 125.66,
            top: 79.08,
            right: 451.27,
            bottom: 99.86,
        },
        // Şablonda "DERS SAATİ" metni hazırdır; yalnızca sayı yazılır.
        durationValueBox: {
            x: 477.99,
            top: 79.08,
            right: 477.5,
            bottom: 99.86,
        },
        durationMode: "DYNAMIC",
        table: {
            firstRowTop: 145.34,
            rowHeight: 17.76,
            columns: {
                no: { x: 47.76, right: 75.62 },
                fullName: { x: 76.34, right: 238.54 },
                title: { x: 239.26, right: 366.10 },
                result: { x: 451.90, right: 550.42 },
            },
        },
    },

    WORKING_AT_HEIGHT: {
        description: "Yüksekte çalışma eğitim katılım formu şablonu",
        templateFileNames: [
            "5_YÜKSEKTE ÇALIŞMA EĞİTİM KATILIM FORMU.pdf",
            "5_YÜKSEKTE ÇALIŞMA EĞİTİM KATILIM FORMU(1).pdf",
            "working-at-height-attendance-template.pdf",
        ],
        maxParticipants: 15,
        headerFontSize: 7.2,
        rowFontSize: 7.2,
        dateValueBox: {
            x: 451.78,
            top: 43.2,
            right: 550.56,
            bottom: 71.16,
        },
        organizationValueBox: {
            x: 125.66,
            top: 93.5,
            right: 451.29,
            bottom: 115.58,
        },
        // Bu şablonda süre "2 DERS SAATİ" olarak sabittir.
        durationMode: "STATIC",
        table: {
            firstRowTop: 161.06,
            rowHeight: 17.76,
            columns: {
                no: { x: 47.76, right: 75.62 },
                fullName: { x: 76.34, right: 238.54 },
                title: { x: 239.26, right: 366.10 },
                result: { x: 451.90, right: 550.42 },
            },
        },
    },
};

function findExistingPath(candidates: string[], description: string): string {
    const existingPath = candidates.find((candidate) => fs.existsSync(candidate));

    if (!existingPath) {
        throw new Error(
            `${description} bulunamadı. Kontrol edilen yollar:\n${candidates.join("\n")}`
        );
    }

    return existingPath;
}

function buildTemplateCandidates(fileNames: string[]): string[] {
    const directories = [
        path.resolve(moduleDirectory, "templates"),
        path.resolve(moduleDirectory, "../../src/pdf/templates"),
        path.resolve(process.cwd(), "src", "pdf", "templates"),
        path.resolve(process.cwd(), "backend", "src", "pdf", "templates"),
        path.resolve(process.cwd(), "templates"),
    ];

    return directories.flatMap((directory) =>
        fileNames.map((fileName) => path.join(directory, fileName))
    );
}

function resolveDefaultTemplatePath(
    config: AttendanceTemplateConfig
): string {
    return findExistingPath(
        buildTemplateCandidates(config.templateFileNames),
        config.description
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

function getFittedFontSize(
    text: string,
    font: PDFFont,
    preferredFontSize: number,
    minimumFontSize: number,
    maxWidth: number
): number {
    let fittedFontSize = preferredFontSize;

    while (
        fittedFontSize > minimumFontSize &&
        font.widthOfTextAtSize(text, fittedFontSize) > maxWidth
    ) {
        fittedFontSize -= FONT_SIZE_STEP;
    }

    return Math.max(fittedFontSize, minimumFontSize);
}

function drawTextInsideBox(
    page: PDFPage,
    textValue: string,
    box: BoxCoordinates,
    font: PDFFont,
    preferredFontSize: number,
    minimumFontSize: number,
    alignment: "LEFT" | "CENTER" = "LEFT"
): void {
    const text = normalizeText(textValue);

    if (!text) {
        return;
    }

    const availableWidth = Math.max(
        1,
        box.right - box.x - CELL_HORIZONTAL_PADDING * 2
    );
    const fittedFontSize = getFittedFontSize(
        text,
        font,
        preferredFontSize,
        minimumFontSize,
        availableWidth
    );
    const textWidth = font.widthOfTextAtSize(text, fittedFontSize);
    const textX =
        alignment === "CENTER"
            ? box.x + Math.max(0, (box.right - box.x - textWidth) / 2)
            : box.x + CELL_HORIZONTAL_PADDING;

    page.drawText(text, {
        x: textX,
        y: topToPdfY(
            getVerticallyCenteredBaselineFromTop(
                box.top,
                box.bottom,
                font,
                fittedFontSize
            )
        ),
        size: fittedFontSize,
        font,
        color: BLACK,
        maxWidth: availableWidth,
    });
}

function drawTextInsideRowCell(
    page: PDFPage,
    textValue: string,
    column: ColumnCoordinates,
    rowTop: number,
    rowBottom: number,
    font: PDFFont,
    preferredFontSize: number,
    alignment: "LEFT" | "CENTER" = "LEFT"
): void {
    drawTextInsideBox(
        page,
        textValue,
        {
            x: column.x,
            top: rowTop,
            right: column.right,
            bottom: rowBottom,
        },
        font,
        preferredFontSize,
        MIN_ROW_FONT_SIZE,
        alignment
    );
}

function drawHeaderValues(
    page: PDFPage,
    input: AttendancePdfInput,
    config: AttendanceTemplateConfig,
    fonts: EmbeddedFonts
): void {
    drawTextInsideBox(
        page,
        formatDate(input.trainingDate),
        config.dateValueBox,
        fonts.regular,
        config.headerFontSize,
        MIN_HEADER_FONT_SIZE,
        "CENTER"
    );

    drawTextInsideBox(
        page,
        input.organizationName ?? "",
        config.organizationValueBox,
        fonts.regular,
        config.headerFontSize,
        MIN_HEADER_FONT_SIZE,
        "LEFT"
    );

    if (
        config.durationMode === "DYNAMIC" &&
        config.durationValueBox &&
        input.durationHours !== null &&
        input.durationHours !== undefined
    ) {
        drawTextInsideBox(
            page,
            String(input.durationHours),
            config.durationValueBox,
            fonts.regular,
            config.headerFontSize,
            MIN_HEADER_FONT_SIZE,
            "CENTER"
        );
    }
}

function drawParticipantRows(
    page: PDFPage,
    participants: AttendancePdfParticipant[],
    config: AttendanceTemplateConfig,
    fonts: EmbeddedFonts
): void {
    participants.forEach((participant, index) => {
        const rowTop =
            config.table.firstRowTop + index * config.table.rowHeight;

        const rowBottom = rowTop + config.table.rowHeight;

        // NO sütunundaki sayılar şablonda hazır bulunduğu için tekrar çizilmez.

        drawTextInsideRowCell(
            page,
            participant.fullName,
            config.table.columns.fullName,
            rowTop,
            rowBottom,
            fonts.regular,
            config.rowFontSize,
            "LEFT"
        );

        drawTextInsideRowCell(
            page,
            participant.title ?? "",
            config.table.columns.title,
            rowTop,
            rowBottom,
            fonts.regular,
            config.rowFontSize,
            "LEFT"
        );

        drawTextInsideRowCell(
            page,
            participant.result === null || participant.result === undefined
                ? ""
                : String(participant.result),
            config.table.columns.result,
            rowTop,
            rowBottom,
            fonts.regular,
            config.rowFontSize,
            "CENTER"
        );

        // İmza sütunu bilerek boş bırakılır.
    });
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

function validateInput(
    input: AttendancePdfInput,
    config: AttendanceTemplateConfig
): void {
    if (!input) {
        throw new Error("Katılım formu bilgisi bulunamadı.");
    }

    if (!Array.isArray(input.participants)) {
        throw new Error("Katılımcı listesi geçerli değil.");
    }

    if (input.participants.length === 0) {
        throw new Error("PDF'e eklenecek katılımcı bulunamadı.");
    }

    input.participants.forEach((participant, index) => {
        if (!normalizeText(participant.fullName ?? "")) {
            throw new Error(`${index + 1}. katılımcının ad soyad bilgisi eksik.`);
        }
    });

    if (config.durationMode === "DYNAMIC") {
        if (
            input.durationHours === null ||
            input.durationHours === undefined ||
            !Number.isFinite(input.durationHours) ||
            input.durationHours <= 0
        ) {
            throw new Error("Eğitim süresi pozitif bir sayı olmalıdır.");
        }
    }
}

export async function generateAttendancePdf(
    input: AttendancePdfInput
): Promise<Buffer> {
    try {
        if (!input?.templateType) {
            throw new Error("Katılım formu şablon tipi belirtilmedi.");
        }

        const config = ATTENDANCE_TEMPLATE_CONFIGS[input.templateType];

        if (!config) {
            throw new Error(`Desteklenmeyen katılım formu tipi: ${input.templateType}`);
        }

        validateInput(input, config);

        const templatePath =
            input.templatePath?.trim() || resolveDefaultTemplatePath(config);

        assertFileExists(templatePath, config.description);

        const templatePdf = await PDFDocument.load(
            fs.readFileSync(templatePath)
        );

        if (templatePdf.getPageCount() === 0) {
            throw new Error(`${config.description} içinde sayfa bulunamadı.`);
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

        for (
            let participantOffset = 0;
            participantOffset < input.participants.length;
            participantOffset += config.maxParticipants
        ) {
            const pageParticipants = input.participants.slice(
                participantOffset,
                participantOffset + config.maxParticipants
            );
            const [copiedPage] = await outputPdf.copyPages(templatePdf, [0]);
            outputPdf.addPage(copiedPage);
            drawHeaderValues(copiedPage, input, config, fonts);
            drawParticipantRows(copiedPage, pageParticipants, config, fonts);
        }

        const defaultTitle =
            input.templateType === "ISG_BASIC"
                ? "İSG Temel Eğitim Katılım Tutanağı"
                : "Yüksekte Çalışma Eğitim Katılım Formu";

        outputPdf.setTitle(input.documentTitle?.trim() || defaultTitle);
        outputPdf.setSubject("Eğitim Katılım Formu");
        outputPdf.setCreator("Artemis Test Module");
        outputPdf.setProducer("Artemis Test Module");

        const pdfBytes = await outputPdf.save();
        return Buffer.from(pdfBytes);
    } catch (error) {
        console.error("ATTENDANCE PDF ERROR:", error);

        if (error instanceof Error) {
            throw new Error(`Katılım PDF'i oluşturulamadı: ${error.message}`);
        }

        throw new Error(
            "Katılım PDF'i oluşturulamadı: Bilinmeyen hata."
        );
    }
}