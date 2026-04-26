import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "focus-ring h-[42px] w-full rounded-lg border border-line bg-white px-3.5 text-sm font-semibold text-navy hover:border-navy",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}
