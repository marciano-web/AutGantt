"use client";
import { useState } from "react";
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
};

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

  async function apply(mode: CascadeMode) {
    if (!args) return;
    setPending(mode);
    const r = await moveStageDatesCascade(
      args.stageId,
      args.newStart,
      args.newEnd,
      mode,
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
    onClose();
  }

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
