"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ListChecks, Layers, FileStack } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  moveStageDatesCascade,
  type CascadeMode,
} from "@/app/(app)/projects/actions";
import { fmtDate } from "@/lib/utils";

export type CascadePromptArgs = {
  stageId: string;
  oldStart: string;
  oldEnd: string;
  newStart: string;
  newEnd: string;
  horasEstimadas: number;
};

const HOURS_PER_DAY = 8;

function countBusinessDays(start: string, end: string): number {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  if (e < s) return 0;
  let count = 0;
  const cur = new Date(s);
  while (cur <= e) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export function CascadeDialog({
  open,
  args,
  onClose,
}: {
  open: boolean;
  args: CascadePromptArgs | null;
  onClose: () => void;
}) {
  const [pending, setPending] = useState<CascadeMode | null>(null);
  const [adjustHours, setAdjustHours] = useState(false);
  const router = useRouter();

  async function apply(mode: CascadeMode) {
    if (!args) return;
    setPending(mode);
    const adjustTo = adjustHours ? suggestedHoras : undefined;
    const r = await moveStageDatesCascade(
      args.stageId,
      args.newStart,
      args.newEnd,
      mode,
      adjustTo,
    );
    setPending(null);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    if (mode === "self") toast.success("Datas alteradas");
    else if (mode === "project")
      toast.success("Etapas seguintes deste projeto reagendadas");
    else toast.success("Todas as etapas após esta data foram reagendadas");
    router.refresh();
    onClose();
  }

  const newDays = args ? countBusinessDays(args.newStart, args.newEnd) : 0;
  const dailyLoad =
    args && newDays > 0 ? args.horasEstimadas / newDays : 0;
  const showHoursOption = !!args && dailyLoad > HOURS_PER_DAY + 0.0001;
  const suggestedHoras = newDays * HOURS_PER_DAY;

  if (!open || !args) return null;
  const deltaDays = Math.round(
    (new Date(args.newStart + "T00:00:00").getTime() -
      new Date(args.oldStart + "T00:00:00").getTime()) /
      86400000,
  );
  const deltaSign = deltaDays > 0 ? "+" : "";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Aplicar mudança a outras etapas?</DialogTitle>
        </DialogHeader>
        <div className="text-sm">
          <div className="text-muted-foreground mb-2">
            <span className="font-mono">{fmtDate(args.oldStart)} → {fmtDate(args.oldEnd)}</span>{" "}
            virou{" "}
            <span className="font-mono font-medium text-foreground">
              {fmtDate(args.newStart)} → {fmtDate(args.newEnd)}
            </span>{" "}
            ({deltaSign}{deltaDays} dias)
          </div>
          {showHoursOption && (
            <div className="border border-warn/40 bg-warn/10 rounded-md p-3 mb-3">
              <div className="text-sm">
                <strong>Carga ficou alta:</strong>{" "}
                {args.horasEstimadas.toFixed(1)}h em {newDays} dia(s) úteis ={" "}
                <span className="font-medium">{dailyLoad.toFixed(1)}h/dia</span>{" "}
                (passa da jornada de {HOURS_PER_DAY}h).
              </div>
              <label className="flex items-center gap-2 mt-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={adjustHours}
                  onChange={(e) => setAdjustHours(e.target.checked)}
                  className="h-4 w-4"
                />
                <span>
                  Reduzir <strong>horas estimadas</strong> para{" "}
                  <span className="font-mono">
                    {suggestedHoras}h
                  </span>{" "}
                  (mantém {HOURS_PER_DAY}h/dia)
                </span>
              </label>
            </div>
          )}
        </div>
        <div className="grid gap-2">
          <Button
            variant="outline"
            disabled={pending !== null}
            onClick={() => apply("self")}
            className="justify-start h-auto py-3"
          >
            <ListChecks className="h-4 w-4 shrink-0" />
            <div className="text-left">
              <div className="font-medium">Apenas esta etapa</div>
              <div className="text-xs text-muted-foreground font-normal">
                Não afeta nenhuma outra.
              </div>
            </div>
          </Button>
          <Button
            variant="outline"
            disabled={pending !== null}
            onClick={() => apply("project")}
            className="justify-start h-auto py-3"
          >
            <Layers className="h-4 w-4 shrink-0" />
            <div className="text-left">
              <div className="font-medium">
                Esta etapa + as seguintes deste projeto
              </div>
              <div className="text-xs text-muted-foreground font-normal">
                Desloca em {deltaSign}{deltaDays} dias as etapas deste projeto
                com ordem maior.
              </div>
            </div>
          </Button>
          <Button
            variant="outline"
            disabled={pending !== null}
            onClick={() => apply("global")}
            className="justify-start h-auto py-3"
          >
            <FileStack className="h-4 w-4 shrink-0" />
            <div className="text-left">
              <div className="font-medium">
                Todas as etapas a partir desta data — todos os projetos
              </div>
              <div className="text-xs text-muted-foreground font-normal">
                Desloca em {deltaSign}{deltaDays} dias todas as etapas (de
                qualquer projeto) que começavam em ≥ {fmtDate(args.oldStart)}.
              </div>
            </div>
          </Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending !== null}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
