// Feriados nacionais BR — fixos + móveis (calculados a partir da Páscoa)

const FIXED_HOLIDAYS_BR = [
  "01-01", // Confraternização Universal
  "04-21", // Tiradentes
  "05-01", // Dia do Trabalho
  "09-07", // Independência
  "10-12", // N.S. Aparecida
  "11-02", // Finados
  "11-15", // Proclamação da República
  "12-25", // Natal
];

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// Anonymous Gregorian algorithm — domingo de Páscoa
function computeEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const cache = new Map<number, Set<string>>();

export function getHolidays(year: number): Set<string> {
  if (cache.has(year)) return cache.get(year)!;
  const set = new Set<string>();
  for (const md of FIXED_HOLIDAYS_BR) set.add(`${year}-${md}`);
  const easter = computeEaster(year);
  set.add(ymd(addDays(easter, -48))); // Carnaval — segunda
  set.add(ymd(addDays(easter, -47))); // Carnaval — terça
  set.add(ymd(addDays(easter, -2))); // Sexta-feira Santa
  set.add(ymd(addDays(easter, 60))); // Corpus Christi
  cache.set(year, set);
  return set;
}

export function isHoliday(d: Date): boolean {
  return getHolidays(d.getFullYear()).has(ymd(d));
}

export function isBusinessDay(d: Date): boolean {
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  return !isHoliday(d);
}
