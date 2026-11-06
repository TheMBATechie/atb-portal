import Link from "next/link";

export function BrandMark() {
  return (
    <span className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden="true">
        <circle cx="16" cy="17" r="13" fill="#ff8c5d" />
        <path d="M16 4c3.5 0 6-2 6-2s-1 5-6 6" fill="#425e51" />
        <rect x="9" y="12" width="14" height="9" rx="1.5" fill="#fff" />
        <rect x="7" y="22" width="18" height="2.5" rx="1.25" fill="#181e4b" />
      </svg>
      <span className="font-heading text-lg leading-none font-extrabold tracking-tight text-atb-navy">
        Atlanta Tech Bank
      </span>
    </span>
  );
}

export function Header() {
  return (
    <header className="border-b border-atb-cream bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4 sm:px-6">
        <Link href="/" aria-label="ATB Placement Portal home" className="rounded-md">
          <BrandMark />
        </Link>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium text-atb-navy">
          <Link href="/request" className="hover:text-atb-coral">
            Request devices
          </Link>
          <Link href="/status" className="hover:text-atb-coral">
            Check a request
          </Link>
          <Link
            href="/login"
            className="rounded-md bg-atb-navy px-4 py-2 font-semibold text-white transition-colors hover:bg-atb-navy/85"
          >
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}
