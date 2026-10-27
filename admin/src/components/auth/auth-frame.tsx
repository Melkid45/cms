type AuthFrameProps = {
  children: React.ReactNode;
  title: string;
};

export function AuthFrame({ children, title }: AuthFrameProps) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-white px-6 py-12">
      <section aria-labelledby="auth-title" className="w-full max-w-[360px]">
        <p className="mb-8 text-xs font-semibold tracking-[0.18em] text-neutral-500">HARBSTONE</p>
        <h1 id="auth-title" className="text-3xl font-semibold tracking-[-0.035em]">{title}</h1>
        <div className="mt-8">{children}</div>
      </section>
    </main>
  );
}
