"use client";

import { BookMarked, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "ホーム" },
  { href: "/search", label: "検索" },
  { href: "/shelf", label: "本棚" },
] as const;

export function Header() {
  const pathname = usePathname();
  const { user, isLoading, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const displayName = user?.email ?? "";

  function isNavActive(href: (typeof navItems)[number]["href"]) {
    if (href === "/") {
      return pathname === "/";
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await signOut();
    } catch (error) {
      console.error("[MyShelf] signOut failed", error);
    } finally {
      setOpen(false);
      window.location.href = "/";
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-heading text-base font-semibold tracking-tight text-foreground sm:text-lg"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BookMarked className="size-4" aria-hidden />
          </span>
          MyShelf
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="メイン">
          {navItems.map((item) => {
            const isActive = isNavActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <div className="hidden items-center gap-2 md:flex">
            {isLoading ? null : user?.id ? (
              <>
                <span className="max-w-40 truncate text-sm text-muted-foreground">
                  {displayName}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isSigningOut}
                  onClick={() => void handleSignOut()}
                >
                  {isSigningOut ? "ログアウト中..." : "ログアウト"}
                </Button>
              </>
            ) : (
              <Link href="/login" className={cn(buttonVariants())}>
                ログイン
              </Link>
            )}
          </div>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  aria-label="メニューを開く"
                />
              }
            >
              <Menu className="size-5" />
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle>メニュー</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 px-4" aria-label="モバイル">
                {navItems.map((item) => {
                  const isActive = isNavActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
                {user?.id ? (
                  <>
                    <p className="mt-3 truncate px-3 text-sm text-muted-foreground">
                      {displayName}
                    </p>
                    <Button
                      type="button"
                      className="mt-2"
                      variant="outline"
                      disabled={isSigningOut}
                      onClick={() => void handleSignOut()}
                    >
                      {isSigningOut ? "ログアウト中..." : "ログアウト"}
                    </Button>
                  </>
                ) : (
                  <Link
                    href="/login"
                    onClick={() => setOpen(false)}
                    className="mt-2 rounded-lg bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground"
                  >
                    ログイン
                  </Link>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
