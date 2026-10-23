"use client";

import { useEffect, useState } from "react";
import { crossAppHref } from "@/lib/apps";

/**
 * A link into Studio from Livio. On livio.localhost a bare "/" is Livio's own
 * home, so the address has to name Studio's host - which only the browser
 * knows. The server renders the plain path, right on localhost.
 */
export function StudioLink({ href, className, title, children }: {
  href: string;
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  const [url, setUrl] = useState(href);
  useEffect(() => setUrl(crossAppHref("studio", href, window.location)), [href]);
  return <a href={url} className={className} title={title}>{children}</a>;
}
