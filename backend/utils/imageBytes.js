/**
 * The stored type is decided by the BYTES, never by the multipart part's
 * declared Content-Type — that header is written by the uploader and proves
 * nothing. Since a served response echoes this type back with the image,
 * trusting the label would let anyone store arbitrary content and have us
 * hand it back under a type of their choosing.
 *
 * Deliberately a closed list of three raster formats. SVG is absent and must
 * stay absent: it is a document, not an image, and it executes script in the
 * origin that serves it.
 *
 * Shared by customerAccountService (profile pictures) and imageService
 * (outlet logos, banners, reward and event photos). One copy on purpose —
 * two divergent copies of a security check is the failure worth avoiding.
 */
const sniffImageType = (buffer) => {
  if (!buffer || buffer.length < 12) return null;
  // PNG: \x89PNG\r\n\x1a\n
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  // WebP: "RIFF" .... "WEBP"
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  return null;
};

module.exports = { sniffImageType };
