import { LoginForm } from "@/components/login-form";

export const instant = false;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const redirectTo = first(sp.redirectTo);

  return (
    <div className="mx-auto flex max-w-sm flex-1 flex-col justify-center px-4 py-16">
      <h1 className="mb-2 text-2xl font-bold">Staff &amp; volunteer sign in</h1>
      {redirectTo && (
        <p className="mb-4 text-sm text-muted-foreground">Sign in to continue to {redirectTo}.</p>
      )}
      <LoginForm />
    </div>
  );
}
