import Link from "next/link";

/** Top bar shared by both pages: wordmark on the left, mono nav on the right. */
export function Masthead({ current }: { current: "dashboard" | "chat" }) {
  return (
    <header className="topbar">
      <Link href="/dashboard" className="wordmark">Store Analytics<span>.</span></Link>
      <nav className="nav" aria-label="Main">
        <Link href="/dashboard" aria-current={current === "dashboard" ? "page" : undefined}>Dashboard</Link>
        <Link href="/chat" aria-current={current === "chat" ? "page" : undefined}>Ask a question</Link>
      </nav>
    </header>
  );
}

export function Colophon() {
  return (
    <footer className="foot">
      Order history May 6 – Oct 27, 2025 · Store today fixed at Oct 27, 2025 · Every number comes from the metric functions, never from the model.
    </footer>
  );
}
