// Shown instead of every public page of a website switched off for non-payment.
export const suspendedMetadata = {
  title: { absolute: "Temporarily unavailable" },
  robots: { index: false, follow: false },
};
export function SuspendedNotice() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f6f6f6] p-6 text-center">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-black">
          This website is temporarily unavailable.
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          Please check back later.
        </p>
      </div>
    </main>
  );
}
