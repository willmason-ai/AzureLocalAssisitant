/**
 * Safely convert any PowerShell API value to a renderable string.
 * PowerShell's ConvertTo-Json serializes .NET types like TimeSpan and DateTime
 * as nested objects (e.g., {Days, Hours, Minutes, ...}) which React cannot render.
 */
export function safeString(value: unknown, fallback = 'N/A'): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') return value || fallback;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  // PowerShell TimeSpan object
  if (typeof value === 'object' && 'Days' in (value as any) && 'Hours' in (value as any)) {
    const ts = value as { Days: number; Hours: number; Minutes: number; Seconds: number };
    return `${ts.Days}d ${ts.Hours}h ${ts.Minutes}m`;
  }

  // PowerShell DateTime or any ISO string-like object
  if (typeof value === 'object' && 'DateTime' in (value as any)) {
    return String((value as any).DateTime);
  }

  // Generic object fallback — don't let React try to render it
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}
