import { emailError } from "../registration/validation";
import type { ReportForm, ReviewForm } from "./types";
const blocked = [/<\s*script/i, /<\/?[a-z][\s\S]*>/i, /\b(select|insert|update|delete|drop|alter|truncate|exec|execute|union)\b/i, /(--|\/\*|\*\/|;)/, /\b(cmd|powershell|bash|sh|curl|wget|chmod|sudo|rm\s+-rf)\b/i];
export function normalizeComment(comment: string): string { return comment.trim().replace(/\s+/g, " "); }
export function validateReview(form: ReviewForm): Partial<Record<keyof ReviewForm, string>> {
  const errors: Partial<Record<keyof ReviewForm, string>> = {}, comment = normalizeComment(form.comment);
  if (!Number.isInteger(form.rating) || form.rating < 1 || form.rating > 5) errors.rating = "Elige una calificación de 1 a 5.";
  if (comment.length < 10 || comment.length > 800) errors.comment = "Escribe entre 10 y 800 caracteres.";
  else if (!/^[a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ\s.,;:¡!¿?'"()\-_/]+$/.test(comment) || blocked.some(pattern => pattern.test(comment))) errors.comment = "El comentario contiene caracteres o contenido no permitido.";
  return errors;
}
export function validateReport(form: ReportForm): Partial<Record<keyof ReportForm, string>> {
  const errors: Partial<Record<keyof ReportForm, string>> = {};
  if (!form.name.trim() || form.name.trim().length > 100) errors.name = "Escribe tu nombre (hasta 100 caracteres).";
  const email = emailError(form.email); if (email) errors.email = email;
  if (form.reason.trim().length < 10 || form.reason.trim().length > 1000) errors.reason = "Describe el motivo con entre 10 y 1000 caracteres.";
  return errors;
}
