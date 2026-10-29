"use client";

export default function CareError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="cw-msg msg-error" role="alert">
      화면을 불러오지 못했습니다. 일시적인 문제일 수 있습니다.{" "}
      <button type="button" className="btn btn-outline btn-sm" onClick={reset}>다시 시도</button>
    </div>
  );
}
