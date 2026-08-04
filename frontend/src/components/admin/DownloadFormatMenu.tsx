import { useState } from "react";
import { ChevronDown, Download, FileSpreadsheet, FileText } from "lucide-react";

export type DownloadFormat = "pdf" | "excel";

type DownloadFormatMenuProps = {
  label: string;
  disabled?: boolean;
  onPick: (format: DownloadFormat) => void;
};

export function DownloadFormatMenu({
  label,
  disabled = false,
  onPick,
}: DownloadFormatMenuProps) {
  const [open, setOpen] = useState(false);

  function pick(format: DownloadFormat) {
    setOpen(false);
    onPick(format);
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
      >
        <Download className="h-4 w-4" />
        {label}
        <ChevronDown className="h-4 w-4" />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="İndirme menüsünü kapat"
            className="fixed inset-0 z-20 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 z-30 mt-1 w-48 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
            <button
              type="button"
              onClick={() => pick("pdf")}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <FileText className="h-4 w-4 text-red-500" /> PDF olarak indir
            </button>
            <button
              type="button"
              onClick={() => pick("excel")}
              className="flex w-full items-center gap-2 border-t border-gray-100 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <FileSpreadsheet className="h-4 w-4 text-green-600" /> Excel olarak indir
            </button>
          </div>
        </>
      )}
    </div>
  );
}
