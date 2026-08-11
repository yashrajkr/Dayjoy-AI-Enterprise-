import * as React from "react";

/**
 * ThemeInit — runs a tiny inline script (via `dangerouslySetInnerHTML`)
 * that sets the `.dark` class on `<html>` **before** the body paints,
 * based on either a saved localStorage preference or the OS
 * `prefers-color-scheme` media query. Avoids a flash of the wrong
 * theme on first load.
 */
const THEME_SCRIPT = `(function(){try{
  var t = localStorage.getItem('dayjoy-chat-theme');
  if (!t) {
    t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  if (t === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
} catch (e) {} })();`;

export function ThemeInit() {
  return (
    <script
      dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
    />
  );
}
