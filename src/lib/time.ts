/**
 * Accurately converts a local date string (YYYY-MM-DD), time string (HH:mm),
 * and an IANA timezone identifier (e.g. "Asia/Kathmandu", "America/New_York", "UTC")
 * into the exact UTC Date object.
 */
export function getUtcDateFromLocal(dateStr: string, timeStr: string, timeZone: string): Date {
  if (!dateStr || !timeStr) {
    throw new Error("Date and time are required");
  }

  const [year, month, day] = dateStr.split("-").map(Number);
  const [hours, minutes] = timeStr.split(":").map(Number);

  // Initial estimate assuming UTC
  const utcGuess = Date.UTC(year, month - 1, day, hours, minutes, 0);

  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false,
    });

    const parts = formatter.formatToParts(new Date(utcGuess));
    const partMap: Record<string, number> = {};
    for (const part of parts) {
      if (part.type !== "literal") {
        partMap[part.type] = parseInt(part.value, 10);
      }
    }

    const targetHour = partMap.hour === 24 ? 0 : partMap.hour;
    const asTzUtc = Date.UTC(
      partMap.year,
      partMap.month - 1,
      partMap.day,
      targetHour,
      partMap.minute,
      partMap.second || 0
    );

    const offsetMs = asTzUtc - utcGuess;
    return new Date(utcGuess - offsetMs);
  } catch (err) {
    console.warn("Timezone calculation fallback to local date:", err);
    return new Date(`${dateStr}T${timeStr}:00`);
  }
}

/**
 * Formats a UTC Date or ISO string into a human-readable string in the target timezone
 */
export function formatInTimezone(utcDateOrIso: Date | string, timeZone: string): string {
  const date = typeof utcDateOrIso === "string" ? new Date(utcDateOrIso) : utcDateOrIso;
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || "UTC",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}
