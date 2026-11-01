import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Обёртка страницы: единые отступы и ширина. narrow — для страниц-форм (аккаунт, настройки). */
export function PageShell({ children, narrow, className }: { children: ReactNode; narrow?: boolean; className?: string }) {
  return (
    <div className={cn("mx-auto w-full space-y-6 px-4 py-6 sm:px-6 lg:px-8", narrow ? "max-w-3xl" : "max-w-[1400px]", className)}>
      {children}
    </div>
  );
}

/** Шапка страницы: заголовок и короткое пояснение слева, действия справа. */
export function PageHeader({
  title,
  description,
  actions,
  leading,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Элемент перед заголовком — например, кнопка «назад» или светодиод статуса. */
  leading?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {leading}
        <div className="min-w-0">
          <h1 className="truncate text-[1.6rem] font-semibold leading-tight">{title}</h1>
          {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Заголовок раздела внутри страницы. */
export function SectionHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex min-h-8 flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
