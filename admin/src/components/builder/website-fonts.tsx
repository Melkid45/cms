import { fontStylesheet, type WebsiteFont } from "@/lib/builder/fonts";
export function WebsiteFonts({
  fonts,
}: {
  fonts: (WebsiteFont | undefined)[];
}) {
  return <link rel="stylesheet" href={fontStylesheet(fonts)} />;
}
