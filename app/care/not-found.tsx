import Link from "next/link";

export default function NotFound() {
  return (
    <div className="cw-panel">
      <h3>찾을 수 없거나 볼 권한이 없는 항목입니다</h3>
      <p>담당 지역 밖의 사례는 존재 여부를 알려 드리지 않습니다.</p>
      <Link className="btn btn-outline" href="/care">대시보드로</Link>
    </div>
  );
}
