import * as React from "react";
import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      "min-h-[140px] w-full resize-y rounded-input border border-line bg-white px-4 py-4 text-[15px] leading-7 text-ink shadow-paper outline-none transition placeholder:text-helper focus:border-ink/45 focus:ring-4 focus:ring-lime/25",
      className
    )}
    ref={ref}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export { Textarea };
