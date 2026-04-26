import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "focus-ring min-h-28 w-full resize-y rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm font-medium text-navy placeholder:text-slate/70 hover:border-navy",
        className
      )}
      {...props}
    />
  );
}
