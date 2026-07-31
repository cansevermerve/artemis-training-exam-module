import type { ElementType, ReactNode } from "react";
import { X } from "lucide-react";

export const inputClassName =
  "w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-500 focus:ring-2 focus:ring-gray-200 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:border-gray-500 dark:focus:ring-gray-800 dark:disabled:bg-gray-800";

export const secondaryButtonClassName =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700";

export const primaryButtonClassName =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-gray-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white";

type FieldProps = {
  label: string;
  children: ReactNode;
  className?: string;
  required?: boolean;
  hint?: string;
};

export function Field({
  label,
  children,
  className = "",
  required = false,
  hint,
}: FieldProps) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

type SwitchRowProps = {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
};

export function SwitchRow({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: SwitchRowProps) {
  return (
    <div
      className={`rounded-lg border border-gray-200 p-4 dark:border-gray-700 ${
        disabled ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
            {label}
          </p>
          <p className="mt-1 text-xs leading-5 text-gray-400">{description}</p>
        </div>
        <button
          type="button"
          onClick={onChange}
          disabled={disabled}
          aria-pressed={checked}
          aria-label={`${label}: ${checked ? "Açık" : "Kapalı"}`}
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${
            checked
              ? "bg-gray-800 dark:bg-gray-100"
              : "bg-gray-300 dark:bg-gray-600"
          } disabled:cursor-not-allowed`}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition ${
              checked ? "left-6 dark:bg-gray-900" : "left-1"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

type FileUploadFieldProps = {
  label: string;
  icon: ElementType;
  accept: string;
  file: File | null;
  onSelect: (file: File | null) => void;
  hint?: string;
};

export function FileUploadField({
  label,
  icon: Icon,
  accept,
  file,
  onSelect,
  hint,
}: FileUploadFieldProps) {
  return (
    <div>
      <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-4 text-sm text-gray-600 transition hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300 dark:hover:bg-gray-900">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="text-center">{label}</span>
        <input
          type="file"
          accept={accept}
          className="hidden"
          onChange={(event) => {
            onSelect(event.target.files?.[0] ?? null);
            event.currentTarget.value = "";
          }}
        />
      </label>
      {file && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          <span className="truncate">{file.name}</span>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
            aria-label={`${file.name} dosyasını kaldır`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {hint && <p className="mt-1 text-xs leading-5 text-gray-400">{hint}</p>}
    </div>
  );
}

export function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 sm:p-5">
      <div>
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-xs leading-5 text-gray-400">{description}</p>
        )}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
