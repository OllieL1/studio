import { crossAppHref } from "@/lib/apps";

/** A link into Studio from Livio. Plain path; `/` carries the marker that
 *  keeps it from being read as Livio's home on livio.localhost. */
export function StudioLink({ href, className, title, children }: {
  href: string;
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  return <a href={crossAppHref("studio", href)} className={className} title={title}>{children}</a>;
}
