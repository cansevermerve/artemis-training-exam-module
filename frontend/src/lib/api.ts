export const API_BASE_URL = String(
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001/api"
).replace(/\/+$/, "");

export type ApiActor = "user" | "admin";

const AUTH_USER_ID_HEADER = String(
  import.meta.env.VITE_AUTH_USER_ID_HEADER ?? "x-user-id"
).trim().toLowerCase() || "x-user-id";
const AUTH_USER_EMAIL_HEADER = String(
  import.meta.env.VITE_AUTH_USER_EMAIL_HEADER ?? "x-user-email"
).trim().toLowerCase() || "x-user-email";

export class ApiError extends Error {
  readonly status: number;
  readonly details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

type ApiEnvelope<T> = { success?: boolean; data?: T; message?: string; details?: unknown };

export function getCurrentUserId(): string {
  return String(import.meta.env.VITE_CURRENT_USER_ID ?? "").trim();
}
export function getCurrentAdminId(): string {
  return String(import.meta.env.VITE_CURRENT_ADMIN_ID ?? import.meta.env.VITE_CURRENT_USER_ID ?? "").trim();
}
export function getCurrentUserEmail(): string {
  return String(import.meta.env.VITE_CURRENT_USER_EMAIL ?? "").trim();
}
export function getCurrentAdminEmail(): string {
  return String(
    import.meta.env.VITE_CURRENT_ADMIN_EMAIL ?? import.meta.env.VITE_CURRENT_USER_EMAIL ?? ""
  ).trim();
}
export function requireConfiguredId(id: string, variableName: string): string {
  if (!id) throw new Error(`${variableName} frontend ortam değişkeni tanımlı değil.`);
  return id;
}

function identityFor(actor: ApiActor): { id: string; email: string } {
  return actor === "admin"
    ? { id: getCurrentAdminId(), email: getCurrentAdminEmail() }
    : { id: getCurrentUserId(), email: getCurrentUserEmail() };
}

function normalizedEndpoint(endpoint: string): string {
  if (/^https?:\/\//i.test(endpoint)) {
    const url = new URL(endpoint);
    const base = new URL(API_BASE_URL);
    if (url.origin !== base.origin) throw new Error("Harici API adresine kimlik bilgisi gönderilemez.");
    endpoint = url.pathname + url.search;
  }
  const clean = endpoint.replace(/^\/+/, "").replace(/^api\//, "");
  return `${API_BASE_URL}/${clean}`;
}

function requestHeaders(init: RequestInit, actor: ApiActor): Headers {
  const headers = new Headers(init.headers);
  const identity = identityFor(actor);
  if (identity.id && !headers.has(AUTH_USER_ID_HEADER)) {
    headers.set(AUTH_USER_ID_HEADER, identity.id);
  } else if (identity.email && !headers.has(AUTH_USER_EMAIL_HEADER)) {
    headers.set(AUTH_USER_EMAIL_HEADER, identity.email);
  }
  if (init.body && !(init.body instanceof FormData) && !(init.body instanceof Blob) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

async function parseError<T>(response: Response): Promise<ApiEnvelope<T> | null> {
  return response.json().catch(() => null) as Promise<ApiEnvelope<T> | null>;
}

export async function apiRequest<T>(
  endpoint: string,
  init: RequestInit = {},
  actor: ApiActor = "user"
): Promise<T> {
  const response = await fetch(normalizedEndpoint(endpoint), {
    credentials: "include",
    ...init,
    headers: requestHeaders(init, actor),
  });
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | T | null;
  if (!response.ok) {
    const envelope = payload as ApiEnvelope<T> | null;
    throw new ApiError(response.status, envelope?.message ?? `İstek başarısız oldu (${response.status}).`, envelope?.details);
  }
  if (payload && typeof payload === "object" && "data" in payload) return (payload as ApiEnvelope<T>).data as T;
  return payload as T;
}

export function adminApiRequest<T>(endpoint: string, init: RequestInit = {}): Promise<T> {
  return apiRequest<T>(endpoint, init, "admin");
}

export async function apiBlobRequest(
  endpoint: string,
  init: RequestInit = {},
  actor: ApiActor = "user"
): Promise<{ blob: Blob; fileName: string | null }> {
  const response = await fetch(normalizedEndpoint(endpoint), {
    credentials: "include",
    ...init,
    headers: requestHeaders(init, actor),
  });
  if (!response.ok) {
    const payload = await parseError<never>(response);
    throw new ApiError(response.status, payload?.message ?? `Dosya isteği başarısız oldu (${response.status}).`, payload?.details);
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  const utf8Name = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plainName = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  return {
    blob: await response.blob(),
    fileName: utf8Name ? decodeURIComponent(utf8Name) : plainName ?? null,
  };
}

export async function uploadBinary<T>(
  endpoint: string,
  file: File,
  headers: Record<string, string> = {},
  actor: ApiActor = "admin"
): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "x-file-name": encodeURIComponent(file.name),
      ...headers,
    },
    body: file,
  }, actor);
}

export async function openProtectedDocument(endpoint: string, actor: ApiActor = "user"): Promise<void> {
  // Pencereyi kullanıcı tıklaması sırasında açmak, kimlikli dosya isteği
  // tamamlandıktan sonra tarayıcının popup engeline takılmasını önler.
  const windowRef = window.open("about:blank", "_blank");
  if (windowRef) windowRef.opener = null;

  try {
    const { blob } = await apiBlobRequest(endpoint, {}, actor);
    const url = URL.createObjectURL(blob);
    if (windowRef) {
      windowRef.location.replace(url);
    } else {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
  } catch (error) {
    windowRef?.close();
    throw error;
  }
}

export async function downloadProtectedDocument(
  endpoint: string,
  fallbackName: string,
  actor: ApiActor = "admin"
): Promise<void> {
  const { blob, fileName } = await apiBlobRequest(endpoint, {}, actor);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName || fallbackName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
