import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Button } from "../ui/button";
import {
  LogOutIcon,
  PackagePlusIcon,
  PlusIcon,
  ShoppingCartIcon,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback } from "../ui/avatar";
import useRequireAuth from "@/hooks/use-require-auth";
import type { User } from "@pantry/shared";
import { signOut } from "@/lib/auth-client";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

const navItems = ["/lists", "/shopping-lists", "/pantries"] as const;
const quickActions = [
  { id: "add", icon: PlusIcon },
  { id: "buy", icon: ShoppingCartIcon },
  { id: "stock", icon: PackagePlusIcon },
] as const;

export default function NavBar() {
  const { t } = useTranslation();
  const [navOpen, setNavOpen] = useState(false);
  const user = useRequireAuth();
  const initial = getInitial(user);
  const navigate = useNavigate();

  const logout = async () => {
    await signOut();
    await navigate("/login", { replace: true });
  };

  return (
    <header className="bg-background/95 supports-backdrop-filter:bg-background/60 sticky top-0 z-50 w-full border-b backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-screen-2xl items-center gap-1 px-4">
        <Popover open={navOpen} onOpenChange={setNavOpen} modal>
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                className="h-8 touch-manipulation items-center justify-start gap-2.5 p-0! hover:bg-transparent focus-visible:bg-transparent active:bg-transparent md:hidden"
              />
            }
          >
            <div className="relative flex h-8 w-4 items-center justify-center">
              <div className="relative size-4">
                <span
                  className={cn(
                    "bg-foreground absolute left-0 block h-0.5 w-4 transition-all duration-100 motion-reduce:transition-none",
                    navOpen ? "top-[0.4rem] -rotate-45" : "top-1",
                  )}
                />
                <span
                  className={cn(
                    "bg-foreground absolute left-0 block h-0.5 w-4 transition-all duration-100 motion-reduce:transition-none",
                    navOpen ? "top-[0.4rem] rotate-45" : "top-2.5",
                  )}
                />
              </div>
            </div>
            <span className="flex h-8 items-center text-base leading-none font-medium">
              {t("feature.navBar.menu")}
            </span>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="bottom"
            alignOffset={-16}
            sideOffset={14}
            className="bg-background/90 h-(--available-height) w-(--available-width) overflow-y-auto rounded-none border-none ring-0 p-0 shadow-none backdrop-blur duration-100"
          >
            <nav
              aria-label="Navigazione principale"
              className="flex flex-col gap-6 px-6 py-8"
            >
              {navItems.map((item) => (
                <Link
                  key={item}
                  to={item}
                  onClick={() => setNavOpen(false)}
                  className="text-2xl font-medium underline-offset-8 data-[status=active]:underline"
                >
                  {item}
                </Link>
              ))}
            </nav>
          </PopoverContent>
        </Popover>

        <nav
          aria-label="Navigazione principale"
          className="hidden items-center gap-4 text-sm font-medium md:flex"
        >
          {navItems.map((item) => (
            <Link
              key={item}
              to={item}
              className="text-foreground/60 hover:text-foreground/80 data-[status=active]:text-foreground transition-colors"
            >
              {item}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          {quickActions.map(({ id, icon: Icon }) => (
            <Button
              key={id}
              variant="ghost"
              className="px-2 sm:px-3"
              onClick={() => {}}
            >
              <Icon data-icon="inline-start" />
              <span className="sr-only sm:not-sr-only">{id}</span>
            </Button>
          ))}
        </div>

        <div aria-hidden="true" className="bg-border mx-2 h-5 w-px" />

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-full p-0"
              />
            }
          >
            <Avatar className="size-8">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
                {initial}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={10} className="w-64">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <Avatar className="size-8 shrink-0">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
                  {initial}
                </AvatarFallback>
              </Avatar>
              <div className="grid min-w-0 flex-1 leading-tight">
                <span className="truncate text-sm font-medium">
                  {user.displayName}
                </span>
                <span className="text-muted-foreground truncate text-xs">
                  {user.email}
                </span>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void logout()}>
              <LogOutIcon data-icon="inline-start" />
              {t("feature.navBar.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function getInitial(user: User) {
  const source = user.displayName.trim() || user.email.trim();
  return Array.from(source)[0]?.toUpperCase() ?? "?";
}
