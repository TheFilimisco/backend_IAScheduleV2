const TIMEZONE = "Europe/Madrid";

const getSpainOffset = (dateStr, hour) => {
  const h = Math.floor(hour);
  const m = Math.round((hour % 1) * 60);
  const utcGuess = new Date(`${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, hour: "numeric", hour12: false, minute: "numeric" });
  const parts = formatter.formatToParts(utcGuess);
  const localH = parseInt(parts.find((p) => p.type === "hour").value, 10);
  const localM = parseInt(parts.find((p) => p.type === "minute").value, 10);
  let offset = (localH * 60 + localM) - (h * 60 + m);
  if (offset > 720) offset -= 1440;
  if (offset < -720) offset += 1440;
  return offset;
};

const buildUTCDate = (dateStr, hour) => {
  const offsetMin = getSpainOffset(dateStr, hour);
  const h = Math.floor(hour);
  const m = Math.round((hour % 1) * 60);
  const totalMin = h * 60 + m - offsetMin;
  const utcH = Math.floor(((totalMin % 1440) + 1440) % 1440 / 60);
  const utcM = ((totalMin % 1440) + 1440) % 60;
  return new Date(`${dateStr}T${String(utcH).padStart(2, "0")}:${String(utcM).padStart(2, "0")}:00Z`);
};

const toLocalHour = (utcDate) => {
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false });
  return formatter.format(utcDate);
};

const toLocalParts = (utcDate) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hour: "numeric", minute: "numeric", hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(utcDate);
  const localH = parseInt(parts.find((p) => p.type === "hour").value, 10);
  const localM = parseInt(parts.find((p) => p.type === "minute").value, 10);
  const localY = parts.find((p) => p.type === "year").value;
  const localMo = parts.find((p) => p.type === "month").value;
  const localD = parts.find((p) => p.type === "day").value;
  return {
    hour: localH + (localM / 60),
    dateStr: `${localY}-${localMo}-${localD}`,
  };
};

const spanishDayRange = (dateStr) => {
  const offsetStart = getSpainOffset(dateStr, 0);
  const start = new Date(new Date(`${dateStr}T00:00:00Z`).getTime() - offsetStart * 60000);
  const end = new Date(start.getTime() + 24 * 60 * 60000);
  return { start, end };
};

module.exports = { TIMEZONE, getSpainOffset, buildUTCDate, toLocalHour, toLocalParts, spanishDayRange };
