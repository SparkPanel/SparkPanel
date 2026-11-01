import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Постраничный вывод длинных списков (сотни серверов и пользователей). При смене фильтра — на первую страницу. */
export function usePagination<T>(items: T[], pageSize: number, resetKey?: unknown) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => setPage(1), [resetKey]);
  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [page, pages]);

  const pageItems = useMemo(() => items.slice((page - 1) * pageSize, page * pageSize), [items, page, pageSize]);
  return { page, pages, setPage, pageItems, total: items.length, from: items.length ? (page - 1) * pageSize + 1 : 0, to: Math.min(page * pageSize, items.length) };
}

export function PaginationBar({
  page,
  pages,
  setPage,
  from,
  to,
  total,
  noun = "items",
}: {
  page: number;
  pages: number;
  setPage: (page: number) => void;
  from: number;
  to: number;
  total: number;
  noun?: string;
}) {
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between gap-3 px-1 pt-1 text-sm text-muted-foreground">
      <span className="tabular-nums">
        {from}–{to} of {total} {noun}
      </span>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
            <ChevronLeft />
          </Button>
          <span className="min-w-[4.5rem] text-center tabular-nums">
            {page} / {pages}
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(page + 1)} disabled={page >= pages} aria-label="Next page">
            <ChevronRight />
          </Button>
        </div>
      )}
    </div>
  );
}
