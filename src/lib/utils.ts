import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function brl(value: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value ?? 0));
}

export function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d + "T00:00:00") : d;
  return date.toLocaleDateString("pt-BR");
}

export function businessDays(d1: Date, d2: Date) {
  if (d2 < d1) return 0;
  let count = 0;
  const cur = new Date(d1);
  while (cur <= d2) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export function computeStageCost(args: {
  horas: number;
  custoFixo: number;
  diasUteis: number;
  custoHora: number;
  jornadaDia: number;
  hePct: number;
}) {
  const { horas, custoFixo, diasUteis, custoHora, jornadaDia, hePct } = args;
  if (!diasUteis || diasUteis <= 0) {
    return (custoFixo ?? 0) + horas * custoHora * (1 + hePct / 100);
  }
  const horasDia = horas / diasUteis;
  if (horasDia <= jornadaDia) return horas * custoHora + (custoFixo ?? 0);
  const normais = jornadaDia * diasUteis;
  const extras = horas - normais;
  return (
    normais * custoHora + extras * custoHora * (1 + hePct / 100) + (custoFixo ?? 0)
  );
}
