import type { MetadataRoute } from "next";

/** The app is private: no crawler may index anything (also sent as `X-Robots-Tag`). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
