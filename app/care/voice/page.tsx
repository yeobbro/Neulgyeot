import { VoiceRecorder } from "@/components/client/voice-recorder";
import { Heading, Panel } from "@/components/ui";
import { aiConfigured } from "@/lib/server/ai/client";
import { requirePageActor } from "@/lib/server/auth/current";
import { getDb } from "@/lib/server/db/client";
import { readParams, type SearchParams } from "@/lib/server/page";
import { listRecipients } from "@/lib/server/services/recipients";

export default async function VoicePage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor(["admin", "worker"]);
  const db = await getDb();
  const p = await readParams(searchParams);
  const recipients = await listRecipients(db, actor, { sort: "code_asc", page: 1, pageSize: 100 });
  return (
    <>
      <Heading kicker="Field notes" title="현장 담당자용 음성 기록">
        말로 기록하면 텍스트 초안과 구조화된 기록 초안을 만듭니다. 저장 전 반드시 담당자가 검토·수정하며, 초안이 공식 기록으로 자동 확정되지 않습니다.
      </Heading>
      <Panel title="기록 작성">
        <VoiceRecorder
          recipients={recipients.data.map((r) => ({ id: r.id, label: `${r.displayCode} · ${r.displayName}` }))}
          initialRecipientId={p.recipientId}
          aiConfigured={aiConfigured()}
        />
      </Panel>
      <Panel title="개인정보 처리 안내">
        <ul style={{ paddingLeft: 18, margin: 0, fontSize: 14 }}>
          <li>녹음 파일은 서버에 업로드하거나 저장하지 않습니다. 텍스트 초안만 저장되며, 폐기하면 텍스트도 지웁니다.</li>
          <li>브라우저 음성 인식(Web Speech API)은 브라우저 제조사의 음성 인식 서버로 음성을 보낼 수 있습니다 (예: Chrome은 Google 서버). 민감한 내용은 직접 입력을 권장합니다.</li>
          <li>서버 측 음성 인식 서비스는 연결되어 있지 않습니다.</li>
          <li>{aiConfigured() ? "AI 구조화를 선택하면 텍스트(이름·지역 제외)만 서버를 통해 AI API로 전송됩니다. API 키는 서버에만 있습니다." : "AI API가 설정되지 않아 구조화는 규칙 기반(문장 분류)으로만 동작합니다."}</li>
        </ul>
      </Panel>
    </>
  );
}
