import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

type AuthFrameProps = {
  children: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
};

export function AuthFrame({ children, eyebrow, title, description }: AuthFrameProps) {
  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[minmax(360px,0.86fr)_1.14fr]">
      <aside className="subtle-grid relative hidden min-h-screen overflow-hidden bg-black px-12 py-10 text-white lg:flex lg:flex-col">
        <Link href="/" className="flex w-fit items-center gap-3" aria-label="Harbstone CMS">
          <span className="grid size-9 place-items-center rounded-md bg-white text-sm font-black text-black">H</span>
          <span className="text-sm font-semibold tracking-[0.18em]">HARBSTONE</span>
        </Link>

        <div className="my-auto max-w-lg py-20">
          <p className="mb-5 text-xs font-medium uppercase tracking-[0.22em] text-white/45">Content without the clutter</p>
          <h2 className="text-balance text-5xl font-medium leading-[1.08] tracking-[-0.045em] xl:text-6xl">
            Everything you need to manage your project in one place.
          </h2>
        </div>

        <div className="flex items-end justify-between border-t border-white/15 pt-6 text-xs text-white/45">
          <span>Harbstone CMS · 2026</span>
          <span className="flex items-center gap-1.5">Documentation <ArrowUpRight className="size-3" /></span>
        </div>
      </aside>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
        <div className="rise-in w-full max-w-[420px]">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <span className="grid size-9 place-items-center rounded-md bg-black text-sm font-black text-white">H</span>
            <span className="text-sm font-semibold tracking-[0.18em]">HARBSTONE</span>
          </div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">{eyebrow}</p>
          <h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-[2.5rem]">{title}</h1>
          <p className="mt-3 max-w-sm text-sm leading-6 text-neutral-500">{description}</p>
          <div className="mt-9">{children}</div>
        </div>
      </section>
    </main>
  );
}
