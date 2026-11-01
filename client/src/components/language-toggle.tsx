import { useEffect, useState } from "react";
import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { currentLanguage, onLanguageChange, setLanguage, type Language } from "@/i18n";

/** Переключатель языка интерфейса RU/EN; выбор запоминается в браузере. */
export function LanguageToggle({ className }: { className?: string }) {
  const [lang, setLang] = useState<Language>(currentLanguage());
  useEffect(() => {
    const off = onLanguageChange(setLang);
    return () => {
      off();
    };
  }, []);
  const next: Language = lang === "ru" ? "en" : "ru";
  return (
    <Button variant="ghost" size="sm" className={className} onClick={() => setLanguage(next)} translate="no" aria-label={next === "ru" ? "Переключить на русский" : "Switch to English"}>
      <Languages /> {lang === "ru" ? "RU" : "EN"}
    </Button>
  );
}
