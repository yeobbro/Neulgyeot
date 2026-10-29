/**
 * Browser smoke test against a running server (default http://localhost:3000).
 *   node scripts/e2e-smoke.mjs [baseUrl] [screenshotDir]
 * Requires Playwright with a Chromium build available (not a project dependency).
 * Logs in as each demo role, visits every main screen at desktop and mobile
 * widths, and fails on HTTP errors, console errors or horizontal overflow.
 */
import fs from "node:fs";
import { createRequire } from "node:module";

// require() also resolves a globally installed Playwright (NODE_PATH), unlike ESM import.
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = process.argv[3];
if (OUT) fs.mkdirSync(OUT, { recursive: true });

const staffPages = [
  "/care",
  "/care/map",
  "/care/map?regionId=RG-MIR-2",
  "/care/recipients",
  "/care/recipients/R-0002",
  "/care/recipients/R-0002?tab=timeline",
  "/care/recipients/R-0003?tab=services",
  "/care/signals",
  "/care/services",
  "/care/services?tab=referrals",
  "/care/tasks",
  "/care/voice",
  "/care/reports",
  "/care/requests",
  "/care/notifications",
];
const plan = [
  { user: "U-ADMIN", pages: [...staffPages, "/care/audit"] },
  { user: "U-W1", pages: staffPages },
  { user: "U-P1", pages: ["/care/services?tab=referrals", "/care/notifications"] },
  { user: "U-F7", pages: ["/portal"] },
  { user: "U-F9", pages: ["/portal"] },
];

const failures = [];
const browser = await chromium.launch();
for (const [vpName, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  for (const { user, pages } of plan) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    const res = await page.request.post(`${BASE}/api/auth/demo-login`, { data: { userId: user } });
    if (!res.ok()) failures.push(`${user}: login ${res.status()}`);
    for (const path of pages) {
      errors.length = 0;
      const r = await page.goto(BASE + path, { waitUntil: "networkidle" });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const status = r?.status() ?? 0;
      const line = `${vpName} ${user} ${path} → ${status}${overflow > 1 ? ` overflow ${overflow}px` : ""}${errors.length ? ` errors: ${errors.join(" | ")}` : ""}`;
      console.log(line);
      if (status >= 400 || overflow > 1 || errors.length) failures.push(line);
      if (OUT && (vpName === "desktop" || ["/care", "/care/map", "/portal", "/care/recipients/R-0002"].includes(path))) {
        const name = `${vpName}-${user}-${path.replace(/[/?=&]+/g, "_").replace(/^_/, "") || "root"}.png`;
        await page.screenshot({ path: `${OUT}/${name}`, fullPage: vpName === "desktop" });
      }
    }
    await ctx.close();
  }
}

// Family portal must never show internal staff notes.
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.request.post(`${BASE}/api/auth/demo-login`, { data: { userId: "U-F7" } });
  await page.goto(`${BASE}/portal`);
  const html = await page.content();
  if (html.includes("내부 메모(가상)")) failures.push("portal leaks staff note");
  const staff = await page.goto(`${BASE}/care/recipients/R-0007`);
  if (!page.url().endsWith("/portal")) failures.push(`family user reached staff page (${staff?.status()})`);
  await ctx.close();
}

// Interactive flows through the real UI (writes to the database).
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.request.post(`${BASE}/api/auth/demo-login`, { data: { userId: "U-W1" } });
  const step = async (name, fn) => {
    try {
      await fn();
      console.log(`flow ok: ${name}`);
    } catch (e) {
      failures.push(`flow ${name}: ${e.message.split("\n")[0]}`);
    }
  };

  await step("save a consultation record", async () => {
    await page.goto(`${BASE}/care/recipients/R-0008?tab=records`);
    const note = `E2E 상담 기록 ${Date.now()}`;
    await page.getByLabel(/내용 \(공식 기록/).fill(note);
    await page.getByRole("button", { name: "기록 저장" }).click();
    await page.getByText("기록을 저장했습니다").waitFor();
    await page.getByText(note).first().waitFor();
  });

  await step("run analysis and review it", async () => {
    await page.goto(`${BASE}/care/recipients/R-0002?tab=assessments`);
    await page.getByRole("button", { name: "규칙 기반 분석 실행" }).click();
    await page.waitForURL(/\/care\/assessments\//);
    await page.getByText("규칙 기반 신호").waitFor();
    await page.getByRole("button", { name: "검토 저장" }).click();
    await page.getByText("검토 결과를 저장했습니다").waitFor();
  });

  await step("complete a task", async () => {
    await page.goto(`${BASE}/care/tasks?status=active`);
    await page.locator("table a.row-link").first().click();
    await page.locator("#focus select").first().selectOption("completed");
    await page.locator("#focus textarea").fill("E2E 완료 처리");
    await page.locator("#focus").getByRole("button", { name: "변경 저장" }).click();
    await page.locator("#focus").getByText("저장했습니다").waitFor();
  });

  await step("voice page falls back to typed input", async () => {
    await page.goto(`${BASE}/care/voice?recipientId=R-0008`);
    await page.locator("textarea").first().fill("방문했다. 식사 지원을 계속 원하신다. 다음 주에 다시 확인할 예정.");
    await page.getByRole("button", { name: /기록 초안 만들기/ }).click();
    await page.getByText("초안 검토·수정").waitFor();
    await page.getByLabel("초안 내용을 검토했고 공식 기록으로 저장합니다").check();
    await page.getByRole("button", { name: "공식 기록으로 저장" }).click();
    await page.getByText(/저장했습니다/).first().waitFor();
  });

  await step("generate report and download CSV", async () => {
    await page.goto(`${BASE}/care/reports`);
    await page.getByRole("button", { name: "보고서 초안 생성" }).click();
    await page.waitForURL(/\/care\/reports\/RPT-/);
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByText("CSV 내려받기").click()]);
    if (!download.suggestedFilename().endsWith(".csv")) throw new Error("not a csv");
  });

  await page.request.post(`${BASE}/api/auth/demo-login`, { data: { userId: "U-F7" } });
  await step("family sends a request", async () => {
    await page.goto(`${BASE}/portal`);
    await page.getByLabel("제목").fill("E2E 문의");
    await page.getByLabel("내용").fill("방문 시간을 알고 싶어요.");
    await page.getByRole("button", { name: "문의 보내기" }).click();
    await page.getByText("문의를 보냈어요").waitFor();
  });
  if (errors.length) failures.push(`flow page errors: ${errors.join(" | ")}`);
  await ctx.close();
}

await browser.close();
if (failures.length) {
  console.error(`\nFAILED (${failures.length}):\n${failures.join("\n")}`);
  process.exit(1);
}
console.log("\nE2E smoke passed");
