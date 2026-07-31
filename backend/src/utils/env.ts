export function readIntegerEnv(
  name: string,
  fallback: number,
  options: { min?: number; max?: number } = {}
): number {
  const rawValue = process.env[name]?.trim();
  const parsedValue = rawValue === undefined || rawValue === "" ? fallback : Number(rawValue);

  if (!Number.isFinite(parsedValue) || !Number.isInteger(parsedValue)) {
    return fallback;
  }

  const minimum = options.min ?? Number.MIN_SAFE_INTEGER;
  const maximum = options.max ?? Number.MAX_SAFE_INTEGER;

  return Math.min(maximum, Math.max(minimum, parsedValue));
}
