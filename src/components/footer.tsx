import Link from "next/link";

export function Footer() {
  return (
    <footer className="bg-atb-navy text-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-[1.4fr_1fr_1fr] sm:px-6">
        <div className="space-y-2">
          <p className="font-heading text-lg font-extrabold tracking-tight">Atlanta Tech Bank</p>
          <p className="max-w-sm text-sm text-white/75">
            Placement portal for ATB&apos;s nonprofit partners, staff and volunteers. Giving retired technology a second
            life across Atlanta.
          </p>
        </div>
        <div className="space-y-2 text-sm">
          <p className="font-semibold text-atb-apricot">Partners</p>
          <ul className="space-y-1.5 text-white/85">
            <li>
              <Link href="/request" className="hover:text-white hover:underline">
                Request devices
              </Link>
            </li>
            <li>
              <Link href="/status" className="hover:text-white hover:underline">
                Check a request
              </Link>
            </li>
          </ul>
        </div>
        <div className="space-y-2 text-sm">
          <p className="font-semibold text-atb-apricot">ATB team</p>
          <ul className="space-y-1.5 text-white/85">
            <li>
              <Link href="/login" className="hover:text-white hover:underline">
                Staff and volunteer sign in
              </Link>
            </li>
            <li>
              <a href="https://www.atlantatechbank.org/" className="hover:text-white hover:underline">
                atlantatechbank.org
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-white/60 sm:px-6">
          Atlanta Tech Bank, Inc. is a 501(c)(3) nonprofit.
        </p>
      </div>
    </footer>
  );
}
