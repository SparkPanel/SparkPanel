import { Link } from "wouter";
import { LogOut, Monitor, Moon, Sun, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme, type ThemeChoice } from "@/lib/theme";

/** Меню пользователя в верхней панели: учётная запись, тема оформления, выход. */
export function UserMenu({
  username,
  summary,
  canOpenAccount,
  onLogout,
}: {
  username: string;
  summary: string;
  canOpenAccount: boolean;
  onLogout: () => void;
}) {
  const { theme, setTheme } = useTheme();
  const initials = username.slice(0, 2).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-2" data-testid="button-user-menu">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials}</span>
          <span className="hidden max-w-[10rem] truncate text-sm font-medium sm:inline">{username}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-sm font-medium">{username}</div>
          <div className="text-xs text-muted-foreground">{summary}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {canOpenAccount && (
          <DropdownMenuItem asChild>
            <Link href="/account">
              <UserCircle className="mr-2 h-4 w-4" /> Account
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuLabel className="pb-1 text-xs font-normal text-muted-foreground">Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as ThemeChoice)}>
          <DropdownMenuRadioItem value="light">
            <Sun className="mr-2 h-4 w-4" /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon className="mr-2 h-4 w-4" /> Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor className="mr-2 h-4 w-4" /> Same as system
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onLogout} data-testid="button-logout">
          <LogOut className="mr-2 h-4 w-4" /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
