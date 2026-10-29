import { z } from "zod";
import { parseQuery, route } from "@/lib/server/http";
import { getReport, reportToCsv } from "@/lib/server/services/reports";

const q = z.object({ format: z.enum(["csv", "json"]).default("csv") });

export const GET = route<{ id: string }>(async ({ db, actor, params, req }) => {
  const { format } = parseQuery(req, q);
  const report = await getReport(db, actor, params.id);
  if (format === "json") return report;
  return new Response(reportToCsv(report), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="neulgyeot-report-${report.id}.csv"`,
      "cache-control": "no-store",
    },
  });
});
