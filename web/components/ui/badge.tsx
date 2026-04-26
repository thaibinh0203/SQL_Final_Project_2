import type { HTMLAttributes } from "react";
import { cn, statusClass } from "@/lib/utils";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status?: unknown;
}

export function Badge({ className, status, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-3 py-1 text-xs font-bold uppercase tracking-[0.5px]",
        status === undefined ? "bg-slate-100 text-slate" : statusClass(status),
        className
      )}
      {...props}
    />
  );
}
