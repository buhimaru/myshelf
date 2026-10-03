"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={
        mounted
          ? isDark
            ? "ライトモードに切り替える"
            : "ダークモードに切り替える"
          : "テーマを切り替える"
      }
      disabled={!mounted}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      suppressHydrationWarning
    >
      <span className="flex size-4 items-center justify-center" suppressHydrationWarning>
        {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </span>
    </Button>
  );
}
