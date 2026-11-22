import fonts from "@/lib/builder/site-font-files.json";
import "./site-base.css";

// Root layout of public website pages (the admin has its own in app/(admin)/layout.tsx).
// Loads only the base styles, the self-hosted website fonts (public/fonts/site-fonts.*.css: every
// font pair as @font-face rules, files in /fonts; a page downloads only the faces its text uses,
// and public-page.tsx preloads its own pair) and, per page, the library CSS of its blocks
// (public-page.tsx): no admin Tailwind utilities, shadcn or admin scripts. Moving between a
// website and the admin is a full page load (two root layouts).
export default function SiteLayout({ children }: LayoutProps<"/site">) {
  return (
    <html lang="en">
      <body>
        {/* A static file (not bundled), so its url()s stay /fonts/… and match the preloads. */}
        <link rel="stylesheet" href={fonts.css} precedence="site-fonts" />
        {children}
      </body>
    </html>
  );
}
