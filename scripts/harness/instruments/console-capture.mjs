// Console + pageerror capture. Filters noise; surfaces errors, warnings,
// and any console line that mentions error/fail/429/disconnect.

export function consoleCapture({ ev, page }) {
  const onConsole = (m) => {
    const text = m.text();
    if (/error|warn|failed|exception/i.test(m.type()) || /error|fail|429|disconnect/i.test(text)) {
      ev("console", { type: m.type(), text: text.slice(0, 400) });
    }
  };
  const onPageError = (e) => {
    ev("page.error", { message: e.message, stack: (e.stack || "").slice(0, 1000) });
  };

  return {
    start() {
      page.on("console", onConsole);
      page.on("pageerror", onPageError);
    },
    stop() {
      page.off("console", onConsole);
      page.off("pageerror", onPageError);
    },
  };
}
