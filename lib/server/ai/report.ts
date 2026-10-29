import { z } from "zod";
import { buildTemplateNarrative, findUnsupportedNumbers, type ReportNarrative, type ReportStats } from "../../domain/report-template";
import { AiError, getAiGenerator } from "./client";

const narrativeSchema = z.object({
  sections: z.array(z.object({ title: z.string().max(60), body: z.string().max(1500) })).min(1).max(10),
});

const SYSTEM = `당신은 지자체 돌봄 운영 보고서 초안을 작성하는 보조 도구입니다.
- <stats>의 JSON 집계값만 사용합니다. 집계에 없는 숫자, 비율, 성과, 추세를 만들지 않습니다.
- 숫자를 쓸 때는 집계값을 그대로 씁니다. 반올림·합산·추정한 새 숫자를 쓰지 않습니다.
- 섹션: 요약, 주요 통계, 지역별 차이, 미연계 서비스 현황, 후속 조치 현황, 데이터에서 관찰되는 패턴, 추가 확인이 필요한 사항, 추천 운영 개선 과제.
- 개선 과제는 데이터에서 직접 관찰되는 사항에 근거한 제안으로만 씁니다. 효과를 단정하지 않습니다.
- 이 데이터는 시연용 가상 데이터입니다. 한국어로 작성합니다.`;

export type NarrativeResult = {
  method: "ai" | "template";
  narrative: ReportNarrative;
  validation: { aiStatus: "not_configured" | "succeeded" | "rejected" | "failed"; unsupportedNumbers?: string[]; error?: string };
};

/** AI narrative is accepted only if every number it contains exists in the stats. */
export async function draftNarrative(stats: ReportStats): Promise<NarrativeResult> {
  const template = buildTemplateNarrative(stats);
  const generate = getAiGenerator();
  if (!generate) return { method: "template", narrative: template, validation: { aiStatus: "not_configured" } };
  try {
    const { output } = await generate({
      system: SYSTEM,
      user: `<stats>\n${JSON.stringify(stats)}\n</stats>`,
      schema: narrativeSchema,
      maxTokens: 6000,
    });
    const narrative = narrativeSchema.parse(output);
    const unsupported = findUnsupportedNumbers(narrative.sections.map((s) => `${s.title} ${s.body}`).join(" "), stats);
    if (unsupported.length) {
      return { method: "template", narrative: template, validation: { aiStatus: "rejected", unsupportedNumbers: unsupported } };
    }
    return { method: "ai", narrative, validation: { aiStatus: "succeeded" } };
  } catch (err) {
    const error = err instanceof AiError ? err.message : "AI 보고서 생성에 실패했습니다.";
    return { method: "template", narrative: template, validation: { aiStatus: "failed", error } };
  }
}
