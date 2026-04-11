export function parseJsonObject(raw: string, optionName: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Invalid JSON for ${optionName}: ${detail}`);
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    const kind = parsed === null ? "null" : Array.isArray(parsed) ? "array" : typeof parsed;
    throw new Error(
      `${optionName} must be a JSON object (e.g. '{"option":"value"}'), not ${kind}`,
    );
  }

  return parsed as Record<string, unknown>;
}

export function resolveOptionalJsonObject(
  raw: string | undefined,
  fallback: Record<string, unknown>,
  optionName = "--payload",
): Record<string, unknown> {
  if (raw === undefined) {
    return fallback;
  }
  return parseJsonObject(raw, optionName);
}
