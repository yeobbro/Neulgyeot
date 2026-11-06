/**
 * Input boundary + privacy helpers for every prompt that carries untrusted text (care records, transcripts).
 *
 * - `toPromptJson` serialises data as JSON and escapes `<`, `>`, `&`, U+2028 / U+2029 as \uXXXX. The model still reads the same
 *   JSON values, but no record text can ever produce a literal `</records>` (or any tag) that would close the data block.
 * - `dataBlock` wraps that JSON in `<tag>` … `</tag>`. Because of the escaping above the closing tag can only appear once, at the end.
 * - `maskPii` removes common direct identifiers before text leaves the server. It is a safety net, NOT anonymisation:
 *   names and free-text addresses can still remain, which is why real (non-synthetic) data is never sent (see policy.ts).
 */
export function toPromptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function dataBlock(tag: string, value: unknown): { text: string; open: string; close: string } {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  return { text: `${open}\n${toPromptJson(value)}\n${close}`, open, close };
}

const PII_PATTERNS: [RegExp, string][] = [
  [/\b\d{6}\s*-\s*[1-8]\d{6}\b/g, "[주민번호]"],                                 // resident registration number
  [/\b01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}\b/g, "[전화번호]"],                   // mobile
  [/\b0(?:2|[3-6][1-5])[-.\s]?\d{3,4}[-.\s]?\d{4}\b/g, "[전화번호]"],            // landline
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[이메일]"],
  [/\b(?:\d{4}[-\s]?){3}\d{4}\b/g, "[카드번호]"],
  [/[가-힣]+(?:로|길)\s?\d+(?:-\d+)?(?:번길\s?\d+)?/g, "[도로명주소]"],          // road-name address with number
];

export function maskPii(text: string): { text: string; masked: number } {
  let masked = 0;
  let out = text;
  for (const [re, label] of PII_PATTERNS) out = out.replace(re, () => { masked += 1; return label; });
  return { text: out, masked };
}

/** Numbers that appear in a text (digits, optionally with a decimal part). */
export function numbersIn(text: string): string[] {
  return text.match(/\d+(?:\.\d+)?/g) ?? [];
}

/** Clinical terms the model must not introduce unless the cited records already contain them. */
export const DIAGNOSIS_TERMS = ["치매", "우울증", "조현병", "파킨슨", "뇌졸중", "중풍", "당뇨", "고혈압", "폐렴", "심부전", "골절", "섬망", "학대", "자살", "욕창", "탈수", "영양실조"];
