/** svg-to-pdfkit ships no types; this is the one call Studio makes. */
declare module "svg-to-pdfkit" {
  export default function SVGtoPDF(
    doc: PDFKit.PDFDocument,
    svg: string,
    x?: number,
    y?: number,
    options?: {
      width?: number;
      height?: number;
      preserveAspectRatio?: string;
      assumePt?: boolean;
      useCSS?: boolean;
    },
  ): void;
}
