import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  SANCTION_META,
  formatManilaDate,
  formatManilaDateTime,
  type DisciplinarySanction,
} from "./incident-reports";

export interface GeneratedDisciplinaryPdf {
  pdfBytes: Uint8Array;
  sha256: string;
}

export interface NoticeToExplainPdfInput {
  tenantName: string;
  tenantAddress?: string | null;
  caseNumber: string;
  issuedAt: string | Date;
  deadlineAt: string | Date;
  employeeName: string;
  employeeNumber?: string | null;
  employeePosition: string;
  employeeDepartment: string;
  supervisorName?: string | null;
  incidentDate: string;
  offenseCategory: string;
  policyViolated?: string | null;
  description: string;
  issuedByName: string;
  issuedByTitle?: string | null;
  hrSignaturePngBase64?: string | null;
  hrSignatoryName?: string | null;
  hrSignedAt?: string | Date | null;
}

export interface NoticeOfDecisionPdfInput {
  tenantName: string;
  tenantAddress?: string | null;
  caseNumber: string;
  resolvedAt: string | Date;
  nteIssuedAt?: string | Date | null;
  nteAcknowledgedAt?: string | Date | null;
  explanationSubmittedAt?: string | Date | null;
  lapsedWithoutResponse?: boolean;
  employeeName: string;
  employeeNumber?: string | null;
  employeePosition: string;
  employeeDepartment: string;
  incidentDate: string;
  offenseCategory: string;
  policyViolated?: string | null;
  sanctionType: DisciplinarySanction;
  suspensionDays?: number | null;
  suspensionStartDate?: string | null;
  suspensionEndDate?: string | null;
  resolutionNotes: string;
  resolvedByName: string;
  resolvedByTitle?: string | null;
  hrSignaturePngBase64?: string | null;
  hrSignatoryName?: string | null;
  hrSignedAt?: string | Date | null;
}

export interface StampEmployeeAcknowledgmentInput {
  existingPdfBytes: Uint8Array;
  employeeSignaturePngBase64: string;
  employeeName: string;
  acknowledgedAt: string | Date;
  caseNumber: string;
  noticeType: "nte" | "decision";
}

const PAGE_WIDTH = 612; // US Letter
const PAGE_HEIGHT = 792;
const MARGIN_X = 52;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const SIGNATURE_COL_WIDTH = (CONTENT_WIDTH - 24) / 2;
const SIGNATURE_LEFT_X = MARGIN_X;
const SIGNATURE_RIGHT_X = MARGIN_X + SIGNATURE_COL_WIDTH + 24;
const SIGNATURE_TOP_Y = 152;
const FOOTER_Y = 28;

const NAVY = rgb(0.118, 0.106, 0.294); // #1E1B4B
const SLATE_DARK = rgb(0.12, 0.14, 0.18);
const SLATE_MUTED = rgb(0.38, 0.42, 0.48);
const BORDER_COLOR = rgb(0.84, 0.86, 0.9);
const TINT_BG = rgb(0.965, 0.968, 0.985);
const AMBER_BG = rgb(1, 0.975, 0.92);
const AMBER_BORDER = rgb(0.92, 0.68, 0.25);

/**
 * Computes the hex-encoded SHA-256 digest of a PDF byte buffer.
 */
export function computePdfSha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function decodePngDataUrl(dataUrlOrBase64: string): Uint8Array {
  const cleaned = dataUrlOrBase64.replace(/^data:image\/png;base64,/i, "").trim();
  return Uint8Array.from(Buffer.from(cleaned, "base64"));
}

/**
 * Strips characters outside WinAnsi so StandardFonts.Helvetica never throws.
 */
function sanitizeWinAnsi(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .replace(/\u2014|\u2013/g, "-")
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/\u2022/g, "\u00B7")
    .replace(/\u20B1/g, "PHP ")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, " ");
}

function wrapParagraphs(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): string[] {
  const clean = sanitizeWinAnsi(text).replace(/\r\n/g, "\n");
  const paragraphs = clean.split("\n");
  const lines: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      lines.push("");
      continue;
    }

    const words = trimmed.split(/\s+/);
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      const width = font.widthOfTextAtSize(candidate, fontSize);
      if (width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
  }

  return lines.length > 0 ? lines : [""];
}

class PdfCursor {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  regular: PDFFont;
  bold: PDFFont;

  constructor(doc: PDFDocument, regular: PDFFont, bold: PDFFont) {
    this.doc = doc;
    this.regular = regular;
    this.bold = bold;
    this.page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - 50;
  }

  ensureSpace(neededHeight: number) {
    if (this.y - neededHeight < 56) {
      this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      this.y = PAGE_HEIGHT - 52;
    }
  }

  drawRule(color = BORDER_COLOR, thickness = 0.75) {
    this.page.drawLine({
      start: { x: MARGIN_X, y: this.y },
      end: { x: PAGE_WIDTH - MARGIN_X, y: this.y },
      thickness,
      color,
    });
    this.y -= 12;
  }

  drawSectionHeading(title: string) {
    this.ensureSpace(28);
    this.y -= 6;
    this.page.drawText(sanitizeWinAnsi(title), {
      x: MARGIN_X,
      y: this.y,
      size: 10.5,
      font: this.bold,
      color: NAVY,
    });
    this.y -= 6;
    this.drawRule(BORDER_COLOR, 0.75);
  }

  drawKeyValueGrid(rows: Array<[string, string]>) {
    const labelX = MARGIN_X;
    const valueX = MARGIN_X + 150;
    const valueMaxWidth = CONTENT_WIDTH - 150;

    for (const [label, value] of rows) {
      const wrapped = wrapParagraphs(value || "-", this.regular, 9.5, valueMaxWidth);
      const rowHeight = Math.max(15, wrapped.length * 13);
      this.ensureSpace(rowHeight + 4);

      this.page.drawText(sanitizeWinAnsi(label), {
        x: labelX,
        y: this.y,
        size: 9.5,
        font: this.bold,
        color: SLATE_MUTED,
      });

      let lineY = this.y;
      for (const line of wrapped) {
        this.page.drawText(line, {
          x: valueX,
          y: lineY,
          size: 9.5,
          font: this.regular,
          color: SLATE_DARK,
        });
        lineY -= 13;
      }
      this.y -= rowHeight + 2;
    }
  }

  drawParagraphs(text: string, fontSize = 9.5, isBold = false, color = SLATE_DARK) {
    const font = isBold ? this.bold : this.regular;
    const lines = wrapParagraphs(text, font, fontSize, CONTENT_WIDTH);
    for (const line of lines) {
      this.ensureSpace(14);
      if (line) {
        this.page.drawText(line, {
          x: MARGIN_X,
          y: this.y,
          size: fontSize,
          font,
          color,
        });
      }
      this.y -= 13.5;
    }
  }

  drawCalloutBox(title: string, body: string, bg = AMBER_BG, border = AMBER_BORDER) {
    const bodyLines = wrapParagraphs(body, this.regular, 9.5, CONTENT_WIDTH - 24);
    const boxHeight = 24 + bodyLines.length * 13 + 10;
    this.ensureSpace(boxHeight + 10);

    const boxTop = this.y;
    this.page.drawRectangle({
      x: MARGIN_X,
      y: boxTop - boxHeight,
      width: CONTENT_WIDTH,
      height: boxHeight,
      color: bg,
      borderColor: border,
      borderWidth: 1,
    });

    let textY = boxTop - 16;
    this.page.drawText(sanitizeWinAnsi(title), {
      x: MARGIN_X + 12,
      y: textY,
      size: 9.5,
      font: this.bold,
      color: NAVY,
    });
    textY -= 15;

    for (const line of bodyLines) {
      if (line) {
        this.page.drawText(line, {
          x: MARGIN_X + 12,
          y: textY,
          size: 9.5,
          font: this.regular,
          color: SLATE_DARK,
        });
      }
      textY -= 13;
    }

    this.y = boxTop - boxHeight - 14;
  }

  drawHeader(
    tenantName: string,
    tenantAddress: string | null | undefined,
    docTitle: string,
    caseNumber: string
  ) {
    this.page.drawRectangle({
      x: MARGIN_X,
      y: this.y - 46,
      width: CONTENT_WIDTH,
      height: 54,
      color: TINT_BG,
      borderColor: BORDER_COLOR,
      borderWidth: 0.75,
    });

    this.page.drawText(sanitizeWinAnsi(tenantName.toUpperCase()), {
      x: MARGIN_X + 12,
      y: this.y - 12,
      size: 11,
      font: this.bold,
      color: NAVY,
    });

    if (tenantAddress) {
      this.page.drawText(sanitizeWinAnsi(tenantAddress), {
        x: MARGIN_X + 12,
        y: this.y - 25,
        size: 8.5,
        font: this.regular,
        color: SLATE_MUTED,
      });
    }

    const caseLabel = `CASE NO. ${sanitizeWinAnsi(caseNumber)}`;
    const caseWidth = this.bold.widthOfTextAtSize(caseLabel, 9.5);
    this.page.drawText(caseLabel, {
      x: PAGE_WIDTH - MARGIN_X - 12 - caseWidth,
      y: this.y - 12,
      size: 9.5,
      font: this.bold,
      color: NAVY,
    });

    this.page.drawText("STRICTLY CONFIDENTIAL", {
      x:
        PAGE_WIDTH -
        MARGIN_X -
        12 -
        this.bold.widthOfTextAtSize("STRICTLY CONFIDENTIAL", 7.5),
      y: this.y - 25,
      size: 7.5,
      font: this.bold,
      color: SLATE_MUTED,
    });

    this.y -= 66;

    this.page.drawText(sanitizeWinAnsi(docTitle), {
      x: MARGIN_X,
      y: this.y,
      size: 14,
      font: this.bold,
      color: NAVY,
    });
    this.y -= 18;
    this.drawRule(NAVY, 1.2);
  }

  async drawSignatureBlocks(params: {
    issuerName: string;
    issuerTitle: string;
    employeeName: string;
    hrSignaturePngBase64?: string | null;
    hrSignatoryName?: string | null;
    hrSignedAt?: string | Date | null;
  }) {
    // Ensure enough room at the bottom of the page for the fixed-position signature block
    if (this.y < SIGNATURE_TOP_Y + 24) {
      this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    }

    const topY = SIGNATURE_TOP_Y;
    this.page.drawLine({
      start: { x: MARGIN_X, y: topY + 14 },
      end: { x: PAGE_WIDTH - MARGIN_X, y: topY + 14 },
      thickness: 0.75,
      color: BORDER_COLOR,
    });

    // Left: HR Signatory
    this.page.drawText("ISSUED BY:", {
      x: SIGNATURE_LEFT_X,
      y: topY,
      size: 8.5,
      font: this.bold,
      color: SLATE_MUTED,
    });

    if (params.hrSignaturePngBase64) {
      const pngImage = await this.doc.embedPng(
        decodePngDataUrl(params.hrSignaturePngBase64)
      );
      const maxSigW = SIGNATURE_COL_WIDTH - 16;
      const maxSigH = 28;
      const scale = Math.min(maxSigW / pngImage.width, maxSigH / pngImage.height, 1);
      const drawW = pngImage.width * scale;
      const drawH = pngImage.height * scale;
      this.page.drawImage(pngImage, {
        x: SIGNATURE_LEFT_X + 4,
        y: topY - 34,
        width: drawW,
        height: drawH,
      });
    }

    this.page.drawLine({
      start: { x: SIGNATURE_LEFT_X, y: topY - 36 },
      end: { x: SIGNATURE_LEFT_X + SIGNATURE_COL_WIDTH, y: topY - 36 },
      thickness: 0.75,
      color: SLATE_DARK,
    });

    const displayIssuer = params.hrSignatoryName || params.issuerName;
    this.page.drawText(sanitizeWinAnsi(displayIssuer), {
      x: SIGNATURE_LEFT_X,
      y: topY - 49,
      size: 9.5,
      font: this.bold,
      color: SLATE_DARK,
    });
    this.page.drawText(sanitizeWinAnsi(params.issuerTitle), {
      x: SIGNATURE_LEFT_X,
      y: topY - 62,
      size: 8.5,
      font: this.regular,
      color: SLATE_MUTED,
    });

    if (params.hrSignedAt) {
      this.page.drawText(
        sanitizeWinAnsi(`Signed electronically: ${formatManilaDateTime(params.hrSignedAt)}`),
        {
          x: SIGNATURE_LEFT_X,
          y: topY - 74,
          size: 7.5,
          font: this.regular,
          color: NAVY,
        }
      );
    }

    // Right: Employee Acknowledgment
    this.page.drawText("RECEIVED / ACKNOWLEDGED BY:", {
      x: SIGNATURE_RIGHT_X,
      y: topY,
      size: 8.5,
      font: this.bold,
      color: SLATE_MUTED,
    });
    this.page.drawLine({
      start: { x: SIGNATURE_RIGHT_X, y: topY - 36 },
      end: { x: SIGNATURE_RIGHT_X + SIGNATURE_COL_WIDTH, y: topY - 36 },
      thickness: 0.75,
      color: SLATE_DARK,
    });
    this.page.drawText(sanitizeWinAnsi(params.employeeName), {
      x: SIGNATURE_RIGHT_X,
      y: topY - 49,
      size: 9.5,
      font: this.bold,
      color: SLATE_DARK,
    });
    this.page.drawText("Signature over Printed Name & Date", {
      x: SIGNATURE_RIGHT_X,
      y: topY - 62,
      size: 8.5,
      font: this.regular,
      color: SLATE_MUTED,
    });

    this.y = topY - 82;
  }

  async finalizeWithIntegrityFooter(caseNumber: string): Promise<GeneratedDisciplinaryPdf> {
    // Compute pre-footer digest to embed a 16-char document integrity reference in the footer,
    // then save the final PDF and return its exact SHA-256 digest.
    const preFooterBytes = await this.doc.save();
    const preHashShort = computePdfSha256(preFooterBytes).slice(0, 16);

    const footerText = sanitizeWinAnsi(
      `Doc Ref: ${caseNumber} \u00B7 SHA-256: ${preHashShort}... \u00B7 Generated electronically via Kayod HRIS`
    );

    const pages = this.doc.getPages();
    for (const p of pages) {
      p.drawLine({
        start: { x: MARGIN_X, y: FOOTER_Y + 12 },
        end: { x: PAGE_WIDTH - MARGIN_X, y: FOOTER_Y + 12 },
        thickness: 0.5,
        color: BORDER_COLOR,
      });
      p.drawText(footerText, {
        x: MARGIN_X,
        y: FOOTER_Y,
        size: 7.5,
        font: this.regular,
        color: SLATE_MUTED,
      });
    }

    const pdfBytes = await this.doc.save();
    return {
      pdfBytes,
      sha256: computePdfSha256(pdfBytes),
    };
  }
}

export async function generateNoticeToExplainPdf(
  data: NoticeToExplainPdfInput
): Promise<GeneratedDisciplinaryPdf> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const cursor = new PdfCursor(doc, regular, bold);

  cursor.drawHeader(
    data.tenantName || "Company",
    data.tenantAddress,
    "NOTICE TO EXPLAIN (FIRST NOTICE)",
    data.caseNumber
  );

  cursor.drawKeyValueGrid([
    ["Date Issued:", formatManilaDateTime(data.issuedAt)],
    [
      "To (Employee):",
      `${data.employeeName}${data.employeeNumber ? ` (${data.employeeNumber})` : ""}`,
    ],
    ["Position / Dept:", `${data.employeePosition} - ${data.employeeDepartment}`],
    ["Immediate Supervisor:", data.supervisorName || "N/A"],
    ["Incident Date:", formatManilaDate(data.incidentDate)],
    ["Offense Category:", data.offenseCategory],
    ["Policy / Rule Cited:", data.policyViolated || "Company Code of Conduct / HR Policy"],
  ]);

  cursor.drawSectionHeading("I. STATEMENT OF FACTS & ALLEGATIONS");
  cursor.drawParagraphs(data.description);
  cursor.y -= 6;

  cursor.drawSectionHeading("II. STATUTORY DIRECTIVE TO SUBMIT WRITTEN EXPLANATION");
  cursor.drawCalloutBox(
    `FIVE (5) CALENDAR DAY RESPONSE DEADLINE: ${formatManilaDateTime(data.deadlineAt)}`,
    `Pursuant to the Twin-Notice Rule under the Labor Code of the Philippines (DOLE D.O. No. 147-15), you are hereby directed to submit a written explanation within five (5) calendar days from receipt of this Notice, on or before ${formatManilaDateTime(data.deadlineAt)}, explaining why no disciplinary action should be taken against you regarding the above-cited incident.\n\nFailure to submit your written explanation within the prescribed five (5) calendar day period shall be deemed a waiver of your right to be heard, and Management shall resolve this matter based on the evidence on record.`
  );

  await cursor.drawSignatureBlocks({
    issuerName: data.issuedByName,
    issuerTitle: data.issuedByTitle || "Human Resources",
    employeeName: data.employeeName,
    hrSignaturePngBase64: data.hrSignaturePngBase64,
    hrSignatoryName: data.hrSignatoryName,
    hrSignedAt: data.hrSignedAt,
  });

  return cursor.finalizeWithIntegrityFooter(data.caseNumber);
}

export async function generateNoticeOfDecisionPdf(
  data: NoticeOfDecisionPdfInput
): Promise<GeneratedDisciplinaryPdf> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const cursor = new PdfCursor(doc, regular, bold);

  cursor.drawHeader(
    data.tenantName || "Company",
    data.tenantAddress,
    "NOTICE OF DECISION (SECOND NOTICE)",
    data.caseNumber
  );

  const sanctionLabel = SANCTION_META[data.sanctionType]?.label ?? data.sanctionType;
  let suspensionDetail = "";
  if (data.sanctionType === "suspension" && data.suspensionDays) {
    suspensionDetail = ` (${data.suspensionDays} day${data.suspensionDays > 1 ? "s" : ""}${data.suspensionStartDate && data.suspensionEndDate
      ? `: ${formatManilaDate(data.suspensionStartDate)} to ${formatManilaDate(data.suspensionEndDate)}`
      : ""
      })`;
  }

  const explanationRef = data.lapsedWithoutResponse
    ? "Lapse of 5-calendar-day NTE period without written response"
    : data.explanationSubmittedAt
      ? `Submitted on ${formatManilaDateTime(data.explanationSubmittedAt)}`
      : "On record";

  const rows: Array<[string, string]> = [
    ["Date of Decision:", formatManilaDateTime(data.resolvedAt)],
    [
      "To (Employee):",
      `${data.employeeName}${data.employeeNumber ? ` (${data.employeeNumber})` : ""}`,
    ],
    ["Position / Dept:", `${data.employeePosition} - ${data.employeeDepartment}`],
    ["NTE Issued Date:", formatManilaDateTime(data.nteIssuedAt)],
  ];

  // Non-Refusal / Waiver Safeguard: note unreturned employee acknowledgment without blocking Decision
  if (data.nteIssuedAt && !data.nteAcknowledgedAt) {
    rows.push([
      "NTE Service Note:",
      `Notice to Explain served electronically via Kayod Portal on ${formatManilaDateTime(data.nteIssuedAt)}; employee acknowledgment unreturned.`,
    ]);
  } else if (data.nteAcknowledgedAt) {
    rows.push(["NTE Acknowledged:", formatManilaDateTime(data.nteAcknowledgedAt)]);
  }

  rows.push(
    ["Written Explanation:", explanationRef],
    ["Incident Date:", formatManilaDate(data.incidentDate)],
    ["Offense Category:", data.offenseCategory],
    ["Policy / Rule Cited:", data.policyViolated || "Company Code of Conduct / HR Policy"]
  );

  cursor.drawKeyValueGrid(rows);

  cursor.drawSectionHeading("I. FINDINGS & EVALUATION");
  cursor.drawParagraphs(data.resolutionNotes);
  cursor.y -= 6;

  cursor.drawSectionHeading("II. FINAL DISPOSITION & SANCTION");
  cursor.drawCalloutBox(
    `FINAL DISPOSITION: ${sanctionLabel.toUpperCase()}${suspensionDetail}`,
    `Effective Date: ${formatManilaDate(data.resolvedAt)}\n\nAfter careful evaluation of the incident report, supporting evidence, and ${data.lapsedWithoutResponse
      ? "the employee's failure to submit a written explanation within the five (5) calendar day statutory period"
      : "the employee's written explanation"
    }, Management hereby imposes the above-stated disposition. A copy of this Notice shall form part of your official 201 employment file.`,
    TINT_BG,
    NAVY
  );

  await cursor.drawSignatureBlocks({
    issuerName: data.resolvedByName,
    issuerTitle: data.resolvedByTitle || "Human Resources",
    employeeName: data.employeeName,
    hrSignaturePngBase64: data.hrSignaturePngBase64,
    hrSignatoryName: data.hrSignatoryName,
    hrSignedAt: data.hrSignedAt,
  });

  return cursor.finalizeWithIntegrityFooter(data.caseNumber);
}

/**
 * Loads an existing NTE or Decision PDF from `disciplinary-docs`, embeds the employee's
 * receipt signature PNG onto the Employee Acknowledgment block on the final page,
 * stamps the PHT timestamp, and returns the updated PDF bytes + new SHA-256 hash.
 */
export async function stampEmployeeAcknowledgmentOnPdf(
  input: StampEmployeeAcknowledgmentInput
): Promise<GeneratedDisciplinaryPdf> {
  const doc = await PDFDocument.load(input.existingPdfBytes);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  const pages = doc.getPages();
  if (pages.length === 0) {
    throw new Error("Cannot stamp acknowledgment on an empty PDF document.");
  }
  const lastPage = pages[pages.length - 1];

  const pngImage = await doc.embedPng(
    decodePngDataUrl(input.employeeSignaturePngBase64)
  );
  const maxSigW = SIGNATURE_COL_WIDTH - 16;
  const maxSigH = 28;
  const scale = Math.min(maxSigW / pngImage.width, maxSigH / pngImage.height, 1);
  const drawW = pngImage.width * scale;
  const drawH = pngImage.height * scale;

  lastPage.drawImage(pngImage, {
    x: SIGNATURE_RIGHT_X + 4,
    y: SIGNATURE_TOP_Y - 34,
    width: drawW,
    height: drawH,
  });

  const stampText = `Acknowledged by ${input.employeeName} on ${formatManilaDateTime(
    input.acknowledgedAt
  )} (Receipt Only)`;
  const wrappedStamp = wrapParagraphs(
    stampText,
    regular,
    7.5,
    SIGNATURE_COL_WIDTH
  );

  let stampY = SIGNATURE_TOP_Y - 74;
  for (const line of wrappedStamp.slice(0, 2)) {
    lastPage.drawText(line, {
      x: SIGNATURE_RIGHT_X,
      y: stampY,
      size: 7.5,
      font: regular,
      color: NAVY,
    });
    stampY -= 9.5;
  }

  const pdfBytes = await doc.save();
  return {
    pdfBytes,
    sha256: computePdfSha256(pdfBytes),
  };
}
