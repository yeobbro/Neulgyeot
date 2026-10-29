"use client";

/** Browser print dialog; users can choose "PDF로 저장" there. No PDF library is bundled. */
export function PrintButton() {
  return (
    <button type="button" className="btn btn-outline no-print" onClick={() => window.print()}>
      인쇄·PDF 저장
    </button>
  );
}
