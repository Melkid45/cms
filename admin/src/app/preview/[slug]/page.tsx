import { SavedPagePreview } from "@/components/admin/saved-page-preview";
export const metadata = { title: "Page preview", robots: { index: false, follow: false } };
export default async function PreviewPage({ params }: { params: Promise<{ slug: string }> }) { return <SavedPagePreview slug={(await params).slug} />; }
