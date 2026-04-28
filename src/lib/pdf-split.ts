import { PDFDocument } from 'pdf-lib';

/**
 * Split a PDF buffer into smaller chunks of N pages each.
 * Returns array of base64-encoded PDF chunks.
 */
export async function splitPdfToChunks(
  pdfBuffer: Buffer,
  maxPagesPerChunk: number = 5,
  maxChunks: number = 4
): Promise<{ chunks: string[]; totalPages: number }> {
  const srcDoc = await PDFDocument.load(pdfBuffer);
  const totalPages = srcDoc.getPageCount();

  const chunks: string[] = [];
  let pageIndex = 0;

  while (pageIndex < totalPages && chunks.length < maxChunks) {
    const endPage = Math.min(pageIndex + maxPagesPerChunk, totalPages);
    const chunkDoc = await PDFDocument.create();

    const pageIndices = Array.from(
      { length: endPage - pageIndex },
      (_, i) => pageIndex + i
    );
    const copiedPages = await chunkDoc.copyPages(srcDoc, pageIndices);
    for (const page of copiedPages) {
      chunkDoc.addPage(page);
    }

    const chunkBytes = await chunkDoc.save();
    const chunkBase64 = Buffer.from(chunkBytes).toString('base64');

    // Check if this chunk is under 5MB base64 (~3.75MB raw)
    if (chunkBase64.length > 5 * 1024 * 1024) {
      // Try with fewer pages
      if (maxPagesPerChunk > 1) {
        // Recurse with smaller chunk size
        return splitPdfToChunks(pdfBuffer, Math.max(1, Math.floor(maxPagesPerChunk / 2)), maxChunks);
      }
      // Single page is too large, skip it
      pageIndex = endPage;
      continue;
    }

    chunks.push(chunkBase64);
    pageIndex = endPage;
  }

  return { chunks, totalPages };
}
