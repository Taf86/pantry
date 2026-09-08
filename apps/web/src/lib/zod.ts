import * as z from "zod";
import { en, it } from "zod/locales";
import type { i18n as I18n, TFunction } from "i18next";

const locales = { en, it } as const;
type Supported = keyof typeof locales;

function normalize(lng: string | undefined): Supported {
  const base = (lng ?? "en").toLowerCase().split("-")[0] ?? "en";
  return base in locales ? (base as Supported) : "en";
}

function applyZodLocale(lng: string | undefined) {
  z.config(locales[normalize(lng)]());
}

export function bindZodToI18n(i18n: I18n) {
  applyZodLocale(i18n.resolvedLanguage);
  i18n.on("languageChanged", applyZodLocale);
  return () => i18n.off("languageChanged", applyZodLocale);
}

export function requiredString(t?: TFunction<"translation", undefined>) {
  return z
    .string()
    .trim()
    .min(1, { error: t ? t("validation.required") : undefined });
}
