import Link from "next/link";

export function Header() {
  return (
    <header className="border-b bg-white">
      <div className="mx-auto max-w-5xl px-4 py-4">
        <Link href="/" className="text-lg font-semibold hover:underline">
          Atlanta Tech Bank
        </Link>
      </div>
    </header>
  );
}
