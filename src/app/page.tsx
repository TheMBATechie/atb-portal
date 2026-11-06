import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server-admin";

// Cache Components (Next 16) requires an explicit opt-out of prerendering
// for pages that read live, uncached data on every request.
export const instant = false;

const STEPS = [
  {
    title: "Tell us what you need",
    body: "Share what your program does and the devices that would help. A two-laptop request takes about a minute.",
  },
  {
    title: "We plan and match",
    body: "ATB staff review every request and set aside specific, wiped devices that fit your needs.",
  },
  {
    title: "Volunteers prepare them",
    body: "Each device is tested, checked in QA, and packed with the right charger and accessories.",
  },
  {
    title: "Pick up and power up",
    body: "Collect your devices and put them to work. We'll check in later to hear how it's going.",
  },
];

function HeroArt() {
  // Simple brand-colored shapes (not ATB's illustrations): a laptop under a peach tree.
  return (
    <svg viewBox="0 0 400 320" className="h-auto w-full max-w-md" aria-hidden="true">
      <circle cx="210" cy="150" r="140" fill="#fbcda7" />
      <circle cx="300" cy="70" r="36" fill="#fae3c2" />
      <path d="M200 40c30-20 70-14 86 6-34 4-56 18-86-6z" fill="#425e51" />
      <path d="M196 44c-24-22-60-20-76-2 30 6 50 18 76 2z" fill="#5c7a6b" />
      <rect x="196" y="40" width="8" height="70" rx="4" fill="#425e51" />
      <circle cx="200" cy="120" r="34" fill="#ff8c5d" />
      <circle cx="188" cy="110" r="7" fill="#fae3c2" opacity="0.7" />
      <rect x="100" y="150" width="200" height="120" rx="10" fill="#181e4b" />
      <rect x="112" y="162" width="176" height="96" rx="5" fill="#f7ece5" />
      <rect x="128" y="182" width="90" height="10" rx="5" fill="#ff8c5d" />
      <rect x="128" y="202" width="140" height="8" rx="4" fill="#d3cbc7" />
      <rect x="128" y="218" width="120" height="8" rx="4" fill="#d3cbc7" />
      <rect x="128" y="234" width="60" height="12" rx="6" fill="#425e51" />
      <path d="M70 272h260l-18 18H88z" fill="#282e58" />
    </svg>
  );
}

export default async function HomePage() {
  const supabase = createAdminClient();
  const [totalRes, placedRes, partnersRes] = await Promise.all([
    supabase.from("devices").select("*", { count: "exact", head: true }),
    supabase.from("devices").select("*", { count: "exact", head: true }).eq("status", "Deployed"),
    supabase.from("partners").select("*", { count: "exact", head: true }).eq("status", "approved"),
  ]);
  const statsOk = !totalRes.error && !placedRes.error && !partnersRes.error;
  const stats = [
    { value: totalRes.count ?? 0, label: "devices donated and tracked" },
    { value: placedRes.count ?? 0, label: "devices placed with nonprofits" },
    { value: partnersRes.count ?? 0, label: "partner organizations" },
  ];

  return (
    <main className="flex flex-1 flex-col">
      {/* Hero */}
      <section className="bg-atb-blush">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 md:py-20">
          <div className="space-y-6">
            <p className="text-sm font-semibold tracking-wide text-atb-green uppercase">For nonprofit partners</p>
            <h1 className="text-4xl leading-tight text-atb-navy sm:text-5xl">
              Put retired technology to work in your community.
            </h1>
            <p className="max-w-lg text-lg text-atb-navy/80">
              Request refurbished laptops, desktops and tablets from Atlanta Tech Bank, and follow your request from
              planning to pickup.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/request"
                className="rounded-md bg-atb-navy px-6 py-3.5 font-semibold text-white transition-colors hover:bg-atb-navy/85"
              >
                Request devices
              </Link>
              <Link
                href="/status"
                className="rounded-md border border-atb-navy/20 bg-white px-6 py-3.5 font-semibold text-atb-navy transition-colors hover:border-atb-navy"
              >
                Check a request
              </Link>
            </div>
          </div>
          <div className="flex justify-center md:justify-end">
            <HeroArt />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <p className="text-sm font-semibold tracking-wide text-atb-coral uppercase">How it works</p>
          <h2 className="mt-2 text-3xl text-atb-navy sm:text-4xl">Simple and clear.</h2>
          <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <li key={step.title} className="space-y-3 rounded-xl bg-atb-cream p-6">
                <span className="flex size-10 items-center justify-center rounded-full bg-atb-coral font-heading text-lg font-extrabold text-white">
                  {i + 1}
                </span>
                <h3 className="text-lg text-atb-navy">{step.title}</h3>
                <p className="text-sm text-atb-navy/75">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Impact numbers */}
      {statsOk && (
        <section className="bg-atb-cream">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:grid-cols-3 sm:px-6">
            {stats.map((s) => (
              <div key={s.label}>
                <p className="font-heading text-4xl font-extrabold tracking-tight text-atb-navy">
                  {s.value.toLocaleString("en-US")}
                </p>
                <p className="text-sm text-atb-navy/75">{s.label}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Staff & volunteers */}
      <section className="bg-atb-green text-white">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center">
          <div className="space-y-2">
            <p className="text-sm font-semibold tracking-wide text-atb-apricot uppercase">ATB staff and volunteers</p>
            <h2 className="text-3xl">Let&apos;s get devices out the door.</h2>
            <p className="max-w-xl text-white/85">
              Plan requests, match devices, work the prep queue and print pick lists, all in one place.
            </p>
          </div>
          <Link
            href="/login"
            className="rounded-md bg-atb-cream px-6 py-3.5 font-semibold text-atb-green transition-colors hover:bg-white"
          >
            Sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
