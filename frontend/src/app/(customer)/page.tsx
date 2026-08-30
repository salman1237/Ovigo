import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-24 text-center dark:bg-black">
      <p className="mb-3 text-sm font-medium uppercase tracking-wide text-emerald-600">
        Ovigo
      </p>
      <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl">
        Local experts, hosts &amp; stays — booked with confidence.
      </h1>
      <p className="mt-4 max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
        Discover verified local experts, guides, hotels and stays by destination.
      </p>
      <div className="mt-8 flex gap-4">
        <Link
          href="/account/register"
          className="rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
        >
          Create an account
        </Link>
        <Link
          href="/account/login"
          className="rounded-full border border-zinc-300 px-6 py-3 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
