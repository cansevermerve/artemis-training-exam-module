import { cp, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendDirectory = path.resolve(scriptDirectory, "..");
const sourceDirectory = path.join(backendDirectory, "src", "pdf", "templates");
const targetDirectory = path.join(backendDirectory, "dist", "pdf", "templates");

await mkdir(targetDirectory, { recursive: true });
await cp(sourceDirectory, targetDirectory, { recursive: true, force: true });

const copiedFiles = await readdir(targetDirectory);
const requiredFiles = [
  "exam-template.pdf",
  "4_İSG_Temel_Eğitim_Katılım_Tutanağı_Kalibre_Format_Nisan_2026_Son_Format.pdf",
  "5_YÜKSEKTE ÇALIŞMA EĞİTİM KATILIM FORMU.pdf",
];
const missingFiles = requiredFiles.filter((fileName) => !copiedFiles.includes(fileName));
if (missingFiles.length > 0) {
  throw new Error(`PDF şablonları build çıktısına kopyalanamadı: ${missingFiles.join(", ")}`);
}
