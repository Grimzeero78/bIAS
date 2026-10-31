/**
 * UNIVERSAL CV TEXT EXTRACTION
 *
 * Accepts virtually any document format a candidate might upload and pulls
 * out whatever readable text it can:
 *
 *   structured   → pdf, docx (mammoth)
 *   markup       → html / htm / xhtml / xml (tag strip + entity decode)
 *   plain        → txt / md / csv / json / log / tex (utf-8)
 *   rich text    → rtf (control-word strip)
 *   zip packages → odt / ods / odp / pptx / xlsx / epub / pages (jszip → xml)
 *   legacy       → doc (utf-16 aware binary scrape)
 *   images       → jpg / png / webp / … (OCR via the vision model)
 *   anything else→ best-effort printable scrape (never hard-rejects)
 *
 * The only honest failure is "no readable text found" — surfaces as a clean
 * analysis error, never an upload rejection.
 */

// ─────────────────────────── helpers ───────────────────────────

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–",
  mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
  bull: "•", middot: "·", deg: "°", euro: "€", pound: "£", copy: "©", reg: "®",
  trade: "™", eacute: "é", egrave: "è", agrave: "à", ccedil: "ç", uuml: "ü",
  ouml: "ö", auml: "ä", ntilde: "ñ", szlig: "ß", aacute: "á", iacute: "í",
  oacute: "ó", uacute: "ú", ocirc: "ô", ecirc: "ê", acirc: "â", ucirc: "û",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X"
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      const n = Number.isFinite(code) ? code : NaN;
      return Number.isNaN(n) || n < 32 || n > 0x10ffff ? " " : String.fromCodePoint(n);
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? " ";
  });
}

/** Collapse runs of whitespace; keep line structure sensible. */
function tidy(s: string): string {
  return s
    .replace(/[ \t\u00A0\u2000-\u200B\u3000]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─────────────────── markup (html / xml) ───────────────────

const BLOCKISH = /<\/?(p|div|br|li|tr|h[1-6]|section|article|header|footer|table|ul|ol|blockquote|pre|title)\b/gi;

export function stripHtml(html: string): string {
  let s = html;
  // drop invisible content wholesale
  s = s.replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ");
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<!DOCTYPE[^>]*>/gi, " ");
  // block boundaries become newlines so lists/paragraphs stay readable
  s = s.replace(BLOCKISH, "\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  // strip every remaining tag
  s = s.replace(/<[^>]+>/g, " ");
  return tidy(decodeEntities(s));
}

export function stripXml(xml: string): string {
  let s = xml;
  // per-paragraph / per-run structure in OOXML & ODF
  s = s.replace(/<\/(w:p|text:p|text:h|a:p)>/gi, "\n");
  s = s.replace(/<text:tab\b[^>]*\/>/gi, "\t");
  s = s.replace(/<text:s\b[^>]*\/>/gi, " ");
  s = s.replace(/<text:line-break\b[^>]*\/>/gi, "\n");
  // adjacent runs (<w:t>…</w:t><w:t>…) must not fuse into one word
  s = s.replace(/> </g, "> <").replace(/></g, "> <");
  s = s.replace(/<[^>]+>/g, "");
  return tidy(decodeEntities(s));
}

// ─────────────────── RTF ───────────────────

export function stripRtf(rtf: string): string {
  let s = rtf;
  // discard destination groups that carry no visible text (lazy match may
  // stop at nested braces — harmless, remnants are control words anyway)
  s = s.replace(
    /\{\\(?:\*\\)?(?:fonttbl|colortbl|stylesheet|info|pict|object|header|footer|themedata|xmlnstbl|latentstyles|listtable|listoverridetable|rsidtbl|generator|pgptbl|revtbl)[\s\S]*?\}/gi,
    " "
  );
  s = s.replace(/\\par[d]?\b/gi, "\n");
  s = s.replace(/\\line\b/gi, "\n");
  s = s.replace(/\\tab\b/gi, "\t");
  // protect escaped delimiters (\\ \{ \}) before control-word stripping
  s = s.replace(/\\([\\{}])/g, "\u0000$1");
  // \'hh hex escapes and \uN unicode skips
  s = s.replace(/\\'([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  s = s.replace(/\\u(-?\d+)\s?\??/g, (_, n) => {
    const code = parseInt(n, 10);
    const c = code < 0 ? code + 65536 : code;
    return c >= 32 && c <= 0x10ffff ? String.fromCharCode(c) : "";
  });
  s = s.replace(/\{|\}/g, " ");
  // remaining control words (\b, \fs22, \fontfam0 …)
  s = s.replace(/\\[a-zA-Z]+-?\d* ?/g, " ");
  // restore protected delimiters
  s = s.replace(/\u0000\\/g, "\\");
  s = s.replace(/\u0000\{/g, "{");
  s = s.replace(/\u0000\}/g, "}");
  return tidy(decodeEntities(s));
}

// ─────────────────── legacy binary (.doc & unknown) ───────────────────

/**
 * Best-effort text scrape for binary containers. Detects UTF-16LE runs
 * (legacy .doc stores text as UTF-16) before falling back to latin-1-ish
 * printable filtering. Never throws.
 */
export function stripBinaryNoise(buf: Buffer): string {
  const out: string[] = [];
  // UTF-16LE run detection: sequences of "printable, 0x00" pairs
  let u16 = "";
  let run = 0;
  for (let i = 0; i + 1 < buf.length; i += 2) {
    const ch = buf[i];
    const hi = buf[i + 1];
    if (hi === 0 && (ch === 0x20 || ch === 0x0a || ch === 0x0d || (ch >= 0x21 && ch <= 0x7e) || ch >= 0xc0)) {
      run++;
      u16 += String.fromCharCode(ch);
    } else {
      if (run >= 8) out.push(u16);
      u16 = "";
      run = 0;
    }
  }
  if (run >= 8) out.push(u16);
  const utf16Text = out.join("\n").trim();
  if (utf16Text.length >= 40) return tidy(utf16Text);

  // fallback: printable byte scrape (latin-1 window keeps accented letters)
  const ascii = buf
    .toString("latin1")
    .replace(/[^\x20-\x7E\u00A0-\u024F\n\r\t]/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
  return tidy(ascii);
}

// ─────────────────── zip packages (odt / pptx / xlsx / epub / pages) ───────────────────

type ZipEntry = { name: string; text: () => Promise<string> };

async function readZip(buf: Buffer): Promise<{ entries: ZipEntry[] }> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buf);
  const entries: ZipEntry[] = [];
  zip.forEach((name, f) => {
    if (!f.dir) entries.push({ name, text: () => f.async("string") });
  });
  return { entries };
}

async function textFromZipEntries(
  buf: Buffer,
  pick: (names: string[]) => string[]
): Promise<string> {
  const { entries } = await readZip(buf);
  const names = entries.map((e) => e.name);
  const wanted = pick(names);
  const parts: string[] = [];
  for (const name of wanted) {
    const entry = entries.find((e) => e.name === name);
    if (!entry) continue;
    const raw = await entry.text();
    parts.push(name.endsWith(".pdf") ? "" : stripXml(raw));
  }
  // .pages keeps a preview PDF — caller handles it via the pdf extractor hook
  const preview = wanted.find((n) => n.endsWith(".pdf"));
  if (preview && parts.every((p) => !p.trim())) {
    const { entries: e2 } = await readZip(buf);
    const entry = e2.entries.find((e) => e.name === preview);
    if (entry) {
      const JSZip = (await import("jszip")).default;
      const z = await JSZip.loadAsync(buf);
      const pdfBytes = await z.file(preview)!.async("nodebuffer");
      return `__PDF_PREVIEW__${preview}\u0000${pdfBytes.toString("base64")}`;
    }
  }
  return tidy(parts.join("\n"));
}

/** Flatten a table-ish XLSX: shared strings carry most CV-visible text. */
function xlsxPicker(names: string[]): string[] {
  const wanted = names.filter((n) => n === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  return wanted.sort();
}

function pptxPicker(names: string[]): string[] {
  return names
    .filter((n) => /^ppt\/(slides|notesSlides)\/[^/]*\.xml$/.test(n))
    .sort((a, b) => {
      const na = parseInt(a.replace(/\D+/g, ""), 10) || 0;
      const nb = parseInt(b.replace(/\D+/g, ""), 10) || 0;
      return na - nb;
    });
}

function epubPicker(names: string[]): string[] {
  return names.filter((n) => /\.(x?html|htm|html)$/i.test(n)).sort();
}

function odfPicker(names: string[]): string[] {
  return names.includes("content.xml") ? ["content.xml"] : names.filter((n) => n.endsWith(".xml")).slice(0, 4);
}

function pagesPicker(names: string[]): string[] {
  const preview = names.find((n) => /preview\.pdf$/i.test(n));
  if (preview) return [preview];
  return names.filter((n) => n === "index.xml" || n === "QuickLook/preview.webarchive").slice(0, 2);
}

// ─────────────────── router ───────────────────

export interface ExtractDeps {
  /** PDF text extractor (pdf.js lives in cv.ts — injected to avoid cycles). */
  extractPdf?: (buf: Buffer) => Promise<string>;
  /** Image OCR via the vision model (optional; throws if unavailable). */
  visionOcr?: (buf: Buffer, mime: string) => Promise<string>;
}

const IMAGE_EXT = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".heic", ".heif", ".tif", ".tiff", ".avif",
]);
const ZIP_XML_EXT = new Set([".odt", ".ods", ".odp", ".fodt", ".pptx", ".xlsx", ".epub", ".pages"]);

function imageMime(ext: string): string {
  const clean = ext.replace(/^\./, "");
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
    gif: "image/gif", bmp: "image/bmp", heic: "image/heic", heif: "image/heif",
    tif: "image/tiff", tiff: "image/tiff", avif: "image/avif",
  };
  return map[clean] || "image/jpeg";
}

/**
 * Route a CV buffer to the right extractor. Returns "" only when the format
 * truly holds no recoverable text — callers decide whether that's fatal.
 */
export async function extractTextFromCvBuffer(
  filename: string,
  buf: Buffer,
  deps: ExtractDeps = {}
): Promise<string> {
  const ext = (filename.toLowerCase().match(/(\.[^.]+)$/)?.[1]) || "";

  // images → vision OCR
  if (IMAGE_EXT.has(ext)) {
    if (!deps.visionOcr) throw new Error("Image CVs need vision OCR, which is not available on this deployment");
    const text = await deps.visionOcr(buf, imageMime(ext));
    return tidy(text);
  }

  // structured / plain
  if (ext === ".pdf") {
    if (deps.extractPdf) return (await deps.extractPdf(buf)).trim();
    throw new Error("PDF extraction unavailable");
  }
  if (ext === ".docx") {
    const mammoth = await import("mammoth");
    const out = await mammoth.extractRawText({ buffer: buf });
    return (out.value || "").trim();
  }
  if ([".txt", ".md", ".markdown", ".csv", ".json", ".log", ".tex", ".vcf"].includes(ext)) {
    return buf.toString("utf-8").trim();
  }

  // markup
  if ([".html", ".htm", ".xhtml", ".xht"].includes(ext)) return stripHtml(buf.toString("utf-8"));
  if ([".xml", ".plist"].includes(ext)) return stripXml(buf.toString("utf-8"));

  // rich text
  if (ext === ".rtf") return stripRtf(buf.toString("latin1"));

  // zip packages
  if (ZIP_XML_EXT.has(ext)) {
    const text = await textFromZipEntries(buf, (names) => {
      if (ext === ".xlsx") return xlsxPicker(names);
      if (ext === ".pptx") return pptxPicker(names);
      if (ext === ".epub") return epubPicker(names);
      if (ext === ".pages") return pagesPicker(names);
      return odfPicker(names); // .odt / .ods / .odp / .fodt
    });
    if (text.startsWith("__PDF_PREVIEW__")) {
      const marker = text.indexOf("\u0000");
      const b64 = text.slice(marker + 1);
      if (deps.extractPdf) return (await deps.extractPdf(Buffer.from(b64, "base64"))).trim();
    }
    return text;
  }

  // legacy & unknown — best effort, never reject
  return stripBinaryNoise(buf);
}
