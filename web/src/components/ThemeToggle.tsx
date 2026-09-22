"use client";
import { useEffect, useState } from "react";

/* Reads the theme the page is actually painted in, so the toggle and the page
 * can never disagree. That is the attribute when the reader has chosen one and
 * the system preference otherwise, because dark is answered in css from
 * prefers-color-scheme and the attribute only exists to override it. Reading
 * the attribute alone reported light to a system-dark reader and made the
 * first press do nothing. Renders nothing until mounted: the server does not
 * know the theme, and guessing paints the wrong icon. */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<string | null>(null);

  useEffect(() => {
    const chosen = document.documentElement.dataset.theme;
    if (chosen === "dark" || chosen === "light") { setTheme(chosen); return; }
    setTheme(matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }, []);

  if (!theme) return <span className="w-9 h-9" aria-hidden />;

  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem("theme", next);
        } catch {}
        setTheme(next);
      }}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className="w-9 h-9 shrink-0 rounded-full border border-ink/15 flex items-center justify-center text-ink/70 hover:text-ink hover:border-ink/30 transition-colors"
    >
      {theme === "dark" ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}
