/** PDF.js ships no types for the worker entry; we only hand the module object back to PDF.js. */
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}
