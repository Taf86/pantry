import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import * as en from "./locale/en.json";
import * as it from "./locale/it.json";
import { bindZodToI18n } from "../zod";

await i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { it: { translation: it }, en: { translation: en } },
    supportedLngs: ["it", "en"],
    load: "languageOnly",
    nonExplicitSupportedLngs: true,
    fallbackLng: "en",
    detection: {
      order: ["querystring", "localStorage", "navigator"],
      caches: ["localStorage"],
    },
    interpolation: { escapeValue: false },
  });
bindZodToI18n(i18n);
