import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,

  // A self-contained server (.next/standalone) with only the files it needs,
  // so Studio can run from a slow USB stick without the 670MB node_modules.
  output: "standalone",

  // The build runs on the Mac, so tracing only ever sees the Mac database
  // engine. Force the Windows one in too, so the same build runs on the
  // ThinkPad.
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/.prisma/client/query_engine-windows.dll.node",
      "./node_modules/.prisma/client/libquery_engine-darwin-arm64.dylib.node",
      "./node_modules/.prisma/client/schema.prisma",
      // The PDF export's own fonts, and pdfkit's built-in font metrics -
      // both are read from disk at runtime, so tracing can't infer them.
      "./assets/fonts/*.ttf",
      "./node_modules/pdfkit/js/data/*.afm",
    ],
  },

  // Dead weight on a 5 MB/s stick: Prisma's WebAssembly engines for databases
  // we don't use (~49MB), and the image-processing library behind next/image,
  // which Studio never calls (~28MB).
  outputFileTracingExcludes: {
    "/**": [
      "./node_modules/@prisma/client/runtime/*{mysql,postgresql,sqlserver,cockroachdb}*",
      "./node_modules/@img/**",
      "./node_modules/sharp/**",
    ],
  },
};

export default nextConfig;
