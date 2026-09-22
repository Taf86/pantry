import {
  useState,
  type ForwardRefExoticComponent,
  type RefAttributes,
} from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Button } from "../ui/button";
import {
  LogOutIcon,
  PackagePlusIcon,
  PlusIcon,
  ShoppingCartIcon,
  type LucideProps,
} from "lucide-react";
import { Link, useMatch, useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback } from "../ui/avatar";
import useRequireAuth from "@/hooks/use-require-auth";
import type { User } from "@pantry/shared";
import { signOut } from "@/lib/auth-client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../ui/sheet";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { clearLocalUserData } from "@/lib/local-data";
import { forgetLastUser } from "@/lib/user/last-user";
import type { ParseKeys } from "i18next";

const adminPageNavItems = [
  { to: "/admin/users", key: "feature.navBar.link.users" },
  { to: "/admin/invites", key: "feature.navBar.link.invites" },
  { to: "/admin/requests", key: "feature.navBar.link.requests" },
  { to: "/", key: "feature.navBar.link.home" },
] as const satisfies { to: string; key: ParseKeys }[];

const homeNavItems = [
  { to: "/lists", key: "feature.navBar.link.lists" },
  { to: "/shopping", key: "feature.navBar.link.shopping" },
  { to: "/pantries", key: "feature.navBar.link.pantries" },
] as const satisfies { to: string; key: ParseKeys }[];

const toAdminNavItems = [
  { to: "/admin", key: "feature.navBar.link.admin" },
] as const satisfies { to: string; key: ParseKeys }[];

const quickActions = [
  { id: "add", icon: PlusIcon, key: "feature.navBar.quickAction.add" },
  {
    id: "shop",
    icon: ShoppingCartIcon,
    key: "feature.navBar.quickAction.shop",
  },
  {
    id: "stock",
    icon: PackagePlusIcon,
    key: "feature.navBar.quickAction.stock",
  },
] as const satisfies {
  id: string;
  icon: ForwardRefExoticComponent<
    Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>
  >;
  key: ParseKeys;
}[];

export default function NavBar() {
  const { t } = useTranslation();
  const isAdminPage = useMatch("/admin/*");
  const [navOpen, setNavOpen] = useState(false);
  const user = useRequireAuth();
  const isAdminUser = user.role === "admin";
  const initial = getInitial(user);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const navItems = isAdminPage
    ? adminPageNavItems
    : isAdminUser
      ? [...homeNavItems, ...toAdminNavItems]
      : homeNavItems;

  const logout = async () => {
    await signOut();
    forgetLastUser();
    await clearLocalUserData(queryClient);
    await navigate("/login", { replace: true });
  };

  return (
    <header className="bg-background/95 supports-backdrop-filter:bg-background/60 sticky top-0 z-50 w-full border-b backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-screen-2xl items-center gap-1 px-4">
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetTrigger
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
          </SheetTrigger>
          <SheetContent side="left" className="w-3/4 overflow-y-auto">
            <SheetHeader className="sr-only">
              <SheetTitle>{t("feature.navBar.menu")}</SheetTitle>
            </SheetHeader>
            <nav
              aria-label="Navigazione principale"
              className="flex flex-col gap-6 px-6 py-8"
            >
              {navItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setNavOpen(false)}
                  className="text-2xl font-medium underline-offset-8 data-[status=active]:underline"
                >
                  {t(item.key)}
                </Link>
              ))}
            </nav>
          </SheetContent>
        </Sheet>

        <nav
          aria-label="Navigazione principale"
          className="hidden items-center gap-4 text-sm font-medium md:flex"
        >
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="text-foreground/60 hover:text-foreground/80 data-[status=active]:text-foreground transition-colors"
            >
              {t(item.key)}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          {!isAdminPage &&
            quickActions.map(({ id, icon: Icon, key }) => (
              <Button
                key={id}
                variant="ghost"
                className="px-2 sm:px-3"
                onClick={() => {}}
              >
                <Icon data-icon="inline-start" />
                <span className="sr-only sm:not-sr-only">{t(key)}</span>
              </Button>
            ))}
        </div>

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
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 text-foreground">
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
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void logout()}>
                <LogOutIcon data-icon="inline-start" />
                {t("feature.navBar.logout")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
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
