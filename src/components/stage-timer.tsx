"use client";
import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { startTimer, stopTimer } from "@/app/(app)/projects/actions";
import { fmtDuration } from "@/lib/utils";

export function StageTimer({
  stageId,
  isAssignee,
  runningStartedAt,
  baselineSeconds,
}: {
  stageId: string;
  isAssignee: boolean;
  runningStartedAt: string | null;
  baselineSeconds: number;
}) {
  const [pending, setPending] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const isRunning = !!runningStartedAt;

  useEffect(() => {
    if (!isRunning) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isRunning]);

  const liveSeconds = isRunning
    ? baselineSeconds +
      Math.floor((now - new Date(runningStartedAt!).getTime()) / 1000)
    : baselineSeconds;

  async function toggle() {
    if (!isAssignee) return;
    setPending(true);
    const r = isRunning ? await stopTimer(stageId) : await startTimer(stageId);
    setPending(false);
    if (r.error) toast.error(r.error);
    else toast.success(isRunning ? "Timer parado" : "Timer iniciado");
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className={`text-xs tabular-nums px-2 py-0.5 rounded-md font-medium ${
          isRunning
            ? "bg-success/10 text-success animate-pulse"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {fmtDuration(liveSeconds)}
      </span>
      {isAssignee && (
        <Button
          size="icon"
          variant={isRunning ? "destructive" : "default"}
          onClick={toggle}
          disabled={pending}
          title={isRunning ? "Parar" : "Iniciar"}
        >
          {isRunning ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </Button>
      )}
    </div>
  );
}
