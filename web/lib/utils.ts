import type { AnyRecord } from "@/lib/types";

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatDate(value: unknown) {
  if (!value) {
    return "-";
  }
  const date = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 16);
  }
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function shortText(value: unknown, limit = 70) {
  const text = String(value ?? "").trim();
  if (text.length <= limit) {
    return text || "-";
  }
  return `${text.slice(0, limit - 3).trim()}...`;
}

export function statusClass(status: unknown) {
  const value = String(status ?? "").toLowerCase();
  if (["open", "accepted", "pass", "success"].includes(value)) {
    return "bg-success/10 text-green-700";
  }
  if (["pending", "reviewed", "interviewing"].includes(value)) {
    return "bg-warning/15 text-yellow-700";
  }
  if (["closed", "rejected", "fail", "error"].includes(value)) {
    return "bg-danger/10 text-red-700";
  }
  return "bg-slate/10 text-slate";
}

export function countBy(rows: AnyRecord[], key: string) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const value = String(row[key] ?? "Unknown");
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}
