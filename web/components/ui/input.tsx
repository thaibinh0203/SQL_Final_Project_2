import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "focus-ring h-[42px] w-full rounded-lg border border-line bg-white px-3.5 text-sm font-medium text-navy placeholder:text-slate/70 hover:border-navy",
        className
      )}
      {...props}
    />
  );
}
