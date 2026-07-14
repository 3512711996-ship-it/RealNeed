import { AlertTriangle } from "lucide-react";

export function ErrorState({
  title = "判断没有继续",
  message
}: {
  title?: string;
  message: string;
}) {
  return (
    <div className="rounded-card border border-clay/35 bg-clay/10 p-4 text-clay">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <AlertTriangle className="h-4 w-4" />
        {title}
      </div>
      <p className="mt-2 text-sm leading-6">{message}</p>
    </div>
  );
}
