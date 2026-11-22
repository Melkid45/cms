import { currentUser } from "@/lib/builder/current-user";
import { SocialPosts } from "@/components/admin/social/social-posts";
// Social posts of the selected website: owner, designers and clients of that website.
export default async function SocialPage() {
  await currentUser();
  return <SocialPosts />;
}
