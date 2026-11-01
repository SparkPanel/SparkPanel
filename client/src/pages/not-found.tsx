import { Link } from "wouter";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

/** Неизвестный адрес или раздел, на который у пользователя нет прав. */
export default function NotFound() {
  return (
    <PageShell>
      <EmptyState
        icon={Compass}
        title="This page does not exist"
        description="The link may be outdated, or this section is not available for your account."
        action={
          <Button asChild variant="outline">
            <Link href="/">Go to the start page</Link>
          </Button>
        }
        className="mt-10"
      />
    </PageShell>
  );
}
