import Link from "next/link";

export default function HomePage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Redirect Manager</h1>
        <p className="mt-2 text-[var(--color-muted-foreground)]">
          View and edit pathname redirects stored in Vercel Global Config (
          <code className="text-sm">GLOBAL_CONFIG_REDIRECTS_1</code>–
          <code className="text-sm">3</code>, key{" "}
          <code className="text-sm">redirects</code>).
        </p>
      </div>
      <Link
        href="/dashboard"
        className="inline-flex w-fit items-center justify-center rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)]"
      >
        Open dashboard
      </Link>
    </div>
  );
}
