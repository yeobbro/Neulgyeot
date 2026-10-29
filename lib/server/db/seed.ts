import { SERVICE_TYPES, SERVICE_TYPE_LABEL, type ServiceType } from "../../domain/constants";
import type { Db } from "./client";
import { setCounter } from "./ids";

/**
 * Synthetic demo dataset for the fictional city "늘봄시". Every name, place,
 * organization and coordinate is invented. Dates are relative to `now` so the
 * scenarios stay meaningful whenever the demo is (re)seeded.
 *
 * Fixed scenario recipients:
 *  NG-0001 A 정상 사례 · NG-0002 B 미완료 방문 · NG-0003 C 서비스 중단
 *  NG-0004 D 조치 지연 · 별빛동 E 지역 공백 · NG-0006 F 조치 완료 시연
 *  NG-0007 G 가족 문의 · NG-0008 H 음성 기록
 */

const DAY = 86_400_000;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Dong = { id: string; name: string; parent: string; box: [number, number, number, number] };

const DISTRICTS = [
  { id: "RG-HAESOL", name: "해솔구", code: "99110", x: 0, dongs: ["해솔1동", "해솔2동", "은빛동", "솔숲동"] },
  { id: "RG-DAON", name: "다온구", code: "99120", x: 40, dongs: ["다온동", "너울동", "가람동", "새벽동"] },
  { id: "RG-MIR", name: "미르구", code: "99130", x: 80, dongs: ["미르동", "별빛동", "노을동", "바람동"] },
] as const;

const SURNAMES = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오", "서", "신", "권", "황"];

const PROVIDER_NAMES: Record<ServiceType, string[]> = {
  meal: ["나눔도시락센터", "든든밥상", "따뜻한식탁"],
  home_care: ["늘봄재가돌봄", "이웃방문돌봄센터", "온기돌봄"],
  mobility: ["동행이동지원단", "마을동행차"],
  daily_living: ["생활도움센터", "살림지원단"],
  housing: ["집수리협동조합", "주거개선지원센터"],
  community_program: ["마을복지관", "어울림경로센터"],
  health_welfare_counsel: ["건강복지상담소", "마음이음상담센터"],
  family_support: ["가족돌봄쉼터", "보호자지원센터"],
};

const RECORD_TEXT = {
  consultation: [
    "정기 상담 진행. 최근 생활에 큰 변화는 없다고 말씀하심.",
    "상담 중 식사 준비가 번거롭다고 하심. 식사 지원 서비스 이용을 계속 희망.",
    "보호자와 통화 후 상담. 다음 달 일정 조율 예정.",
    "지역 프로그램 참여 의사를 물었으나 아직 결정하지 않으심.",
  ],
  visit: [
    "방문하여 안부 확인. 집안 정리 상태 양호.",
    "방문 시 난방이 약하다고 말씀하심. 주거 지원 문의 필요.",
    "정기 방문 완료. 복약 기록지 확인함(기록 여부만 확인).",
    "방문 돌봄 서비스 이용 상황 확인. 만족한다고 하심.",
  ],
  phone: ["전화로 안부 확인. 특이사항 없음.", "전화 안부 확인. 다음 방문 일정 안내함.", "전화 연결이 짧게 이루어짐. 다음 주 방문 때 다시 확인."],
  observation: ["주민센터 방문 시 안부를 전해 들음.", "이웃 주민이 최근 외출이 줄었다고 전함 (확인 필요)."],
};

export async function isSeeded(db: Db) {
  const [r] = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM regions`);
  return r.n > 0;
}

export async function seedIfEmpty(db: Db, now = new Date()) {
  if (await isSeeded(db)) return false;
  await seed(db, now);
  return true;
}

/** Deletes all rows (demo database only) so the seed can be re-run. */
export async function resetData(db: Db) {
  const tables = [
    "audit_logs", "reports", "support_requests", "family_links", "notification_preferences", "notifications", "voice_record_drafts",
    "action_tasks", "risk_assessments", "record_revisions", "care_records", "service_referrals", "service_catalog",
  ];
  await db.transaction(async (tx) => {
    for (const t of tables) await tx.query(`DELETE FROM ${t}`);
    await tx.query(`UPDATE users SET recipient_id = NULL`);
    await tx.query(`DELETE FROM care_recipients`);
    await tx.query(`DELETE FROM users`);
    await tx.query(`DELETE FROM service_providers`);
    await tx.query(`DELETE FROM regions WHERE parent_id IS NOT NULL AND level = 'eupmyeondong'`);
    await tx.query(`DELETE FROM regions WHERE level = 'sigungu'`);
    await tx.query(`DELETE FROM regions`);
    await tx.query(`DELETE FROM id_counters`);
  });
}

export async function seed(db: Db, now = new Date()) {
  const rand = rng(20261029);
  const pick = <T>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
  const chance = (p: number) => rand() < p;
  const ago = (days: number, hour = 10) => {
    const d = new Date(now.getTime() - days * DAY);
    d.setUTCHours(hour - 9 + Math.floor(rand() * 6), Math.floor(rand() * 60), 0, 0);
    return d;
  };

  await db.transaction(async (tx) => {
    // ── Regions: fictional city on an abstract 120×80 plane (not real boundaries)
    const rect = (x0: number, y0: number, x1: number, y1: number) => ({
      type: "Polygon",
      coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
      properties: { coordinate_space: "demo_plane_120x80", note: "개발용 단순 도형 — 실제 행정경계 아님" },
    });
    await tx.query(`INSERT INTO regions (id, parent_id, name, region_code, level, boundary_geojson) VALUES ('RG-CITY', NULL, '늘봄시(가상)', '99000', 'sido', $1)`, [JSON.stringify(rect(0, 0, 120, 80))]);
    const dongs: Dong[] = [];
    for (const d of DISTRICTS) {
      await tx.query(`INSERT INTO regions (id, parent_id, name, region_code, level, boundary_geojson) VALUES ($1, 'RG-CITY', $2, $3, 'sigungu', $4)`, [d.id, d.name, d.code, JSON.stringify(rect(d.x, 0, d.x + 40, 80))]);
      for (let i = 0; i < d.dongs.length; i++) {
        const box: Dong["box"] = [d.x + (i % 2) * 20, Math.floor(i / 2) * 40, d.x + (i % 2) * 20 + 20, Math.floor(i / 2) * 40 + 40];
        const id = `${d.id}-${i + 1}`;
        await tx.query(`INSERT INTO regions (id, parent_id, name, region_code, level, boundary_geojson) VALUES ($1, $2, $3, $4, 'eupmyeondong', $5)`, [id, d.id, d.dongs[i], `${d.code}${i + 1}`, JSON.stringify(rect(...box))]);
        dongs.push({ id, name: d.dongs[i], parent: d.id, box });
      }
    }
    const byulbit = dongs.find((d) => d.name === "별빛동")!;

    // ── Providers & catalog
    type Svc = { id: string; providerId: string; type: ServiceType; regions: string[] };
    const services: Svc[] = [];
    let pIdx = 0;
    let sIdx = 0;
    for (const d of DISTRICTS) {
      const districtDongs = dongs.filter((x) => x.parent === d.id);
      for (const type of SERVICE_TYPES) {
        const count = type === "meal" || type === "home_care" ? 2 : 1;
        for (let k = 0; k < count; k++) {
          // Scenario E: 별빛동 is outside most 미르구 meal/home-care coverage.
          if (d.id === "RG-MIR" && k === 1 && (type === "meal" || type === "home_care")) continue;
          pIdx++;
          const pid = `P-${String(pIdx).padStart(3, "0")}`;
          const home = districtDongs[(pIdx + k) % districtDongs.length];
          const [x0, y0, x1, y1] = home.box;
          const name = `${d.name.replace("구", "")} ${PROVIDER_NAMES[type][k % PROVIDER_NAMES[type].length]}`;
          await tx.query(
            `INSERT INTO service_providers (id, region_id, name, service_types, address_label, latitude, longitude, availability_status, contact_label)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [pid, home.id, `${name}(가상)`, [type], `${d.name} ${home.name} (가상 주소)`, y0 + 4 + rand() * (y1 - y0 - 8), x0 + 3 + rand() * (x1 - x0 - 6), pick(["open", "open", "waitlist", "unknown"]), "가상 연락처 — 시연용"],
          );
          let coverage = d.id === "RG-MIR" && (type === "meal" || type === "home_care") ? districtDongs.filter((x) => x.id !== byulbit.id).map((x) => x.id) : [d.id];
          if (type === "community_program" && d.id === "RG-DAON") coverage = ["RG-CITY"];
          sIdx++;
          const sid = `SVC-${String(sIdx).padStart(3, "0")}`;
          const eligibility =
            type === "meal" ? { minAge: 65, livingAlone: true } : type === "family_support" ? { requiresCaregiver: true } : type === "mobility" ? { minAge: 65, notes: ["의료기관 동행은 사전 예약 필요"] } : type === "housing" ? { notes: ["소득 기준은 기관 확인"] } : {};
          const operating = !(type === "housing" && d.id === "RG-DAON");
          await tx.query(
            `INSERT INTO service_catalog (id, provider_id, name, service_type, service_region_ids, eligibility_rules, description, application_method, schedule_label,
               is_operating, capacity_status, capacity_verified, contact_method, data_source, source_updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
            [
              sid, pid, `${SERVICE_TYPE_LABEL[type]} · ${name}`, type, coverage, JSON.stringify(eligibility),
              `${d.name} 지역 ${SERVICE_TYPE_LABEL[type]} (시연용 가상 서비스)`,
              pick(["담당자 의뢰 후 기관 전화 상담", "주민센터 신청서 접수", "기관 방문 신청"]),
              pick(["평일 09:00–18:00", "주 3회 (월·수·금)", "매주 화요일", "상시 접수"]),
              operating,
              operating ? pick(["open", "open", "waitlist", "unknown", "closed"]) : "closed",
              chance(0.4),
              "가상 연락 방법 — 시연용",
              "시연용 가상 데이터",
              ago(Math.floor(rand() * 40)),
            ],
          );
          services.push({ id: sid, providerId: pid, type, regions: coverage });
        }
      }
    }

    // ── Users (all fictional demo accounts)
    const users: [string, string, string, string, string | null, string | null][] = [
      ["U-ADMIN", "늘봄시 관리자(가상)", "admin@demo.neulgyeot.invalid", "admin", "RG-CITY", null],
      ["U-W1", "해솔구 담당자 A(가상)", "worker.a@demo.neulgyeot.invalid", "worker", "RG-HAESOL", null],
      ["U-W2", "다온구 담당자 B(가상)", "worker.b@demo.neulgyeot.invalid", "worker", "RG-DAON", null],
      ["U-W3", "미르구 담당자 C(가상)", "worker.c@demo.neulgyeot.invalid", "worker", "RG-MIR", null],
      ["U-W4", "미르구 담당자 D(가상)", "worker.d@demo.neulgyeot.invalid", "worker", "RG-MIR", null],
      ["U-P1", "해솔 나눔도시락센터 담당자(가상)", "provider.a@demo.neulgyeot.invalid", "provider", null, "P-001"],
      ["U-P2", "해솔 늘봄재가돌봄 담당자(가상)", "provider.b@demo.neulgyeot.invalid", "provider", null, "P-003"],
    ];
    for (const u of users) await tx.query(`INSERT INTO users (id, name, email, role, region_id, provider_id) VALUES ($1,$2,$3,$4,$5,$6)`, u);
    const workerFor = (district: string) => (district === "RG-HAESOL" ? "U-W1" : district === "RG-DAON" ? "U-W2" : rand() < 0.5 ? "U-W3" : "U-W4");

    // ── Recipients
    type Rec = { id: string; code: string; dong: Dong; worker: string; needs: ServiceType[]; age: number; livingAlone: boolean };
    const recipients: Rec[] = [];
    const total = 180;
    for (let i = 1; i <= total; i++) {
      // Scenario recipients live in 해솔구 so worker A can demo them; 22 people live in 별빛동.
      const dong = i <= 8 ? (i === 5 ? byulbit : dongs[i % 2 === 0 ? 0 : 2]) : i <= 30 ? byulbit : dongs[(i * 7) % dongs.length];
      const age = 66 + Math.floor(rand() * 28);
      const livingAlone = i === 1 || i === 7 ? true : chance(0.55);
      const needs = new Set<ServiceType>();
      if (i === 3) needs.add("home_care");
      needs.add(pick(["meal", "home_care", "daily_living", "community_program", "health_welfare_counsel"] as const));
      if (chance(0.5)) needs.add(pick(SERVICE_TYPES));
      if (dong.id === byulbit.id) needs.add(chance(0.5) ? "meal" : "home_care");
      if (i === 1) {
        needs.clear();
        needs.add("community_program");
      }
      const id = `R-${String(i).padStart(4, "0")}`;
      const code = `NG-${String(i).padStart(4, "0")}`;
      const name = `${pick(SURNAMES)}○○`;
      recipients.push({ id, code, dong, worker: workerFor(dong.parent), needs: [...needs], age, livingAlone });
      await tx.query(
        `INSERT INTO care_recipients (id, display_code, display_name, age_band, region_id, assigned_user_id, care_status, needs, attributes, staff_note, next_check_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)`,
        [
          id, code, name, `${Math.floor(age / 10) * 10}대`, dong.id, i <= 8 ? "U-W1" : workerFor(dong.parent),
          chance(0.05) && i > 8 ? "closed" : "active",
          [...needs],
          JSON.stringify({ age, livingAlone, usesMobilityAid: chance(0.3), hasCaregiver: i === 7 ? true : chance(0.4) }),
          chance(0.3) ? "담당자 내부 메모(가상): 오전 방문 선호" : null,
          new Date(now.getTime() + Math.floor(rand() * 14 + 1) * DAY),
          ago(60 + Math.floor(rand() * 300)),
        ],
      );
    }
    // Scenario G: a fixed internal note so tests can prove it never reaches the family portal.
    await tx.query(`UPDATE care_recipients SET staff_note = '담당자 내부 메모(가상): 보호자와 통화는 오후가 편하다고 함' WHERE id = 'R-0007'`);
    // Fix scenario recipients to worker A (해솔구) — dongs[0] and dongs[2] are in 해솔구; NG-0005 lives in 별빛동 (미르구).
    await tx.query(`UPDATE care_recipients SET assigned_user_id = 'U-W3' WHERE id = 'R-0005'`);

    // ── Referrals
    let refIdx = 0;
    const referralFor = async (r: Rec, svc: Svc, status: string, changedDaysAgo: number, failure?: string) => {
      refIdx++;
      const id = `SR-${String(refIdx).padStart(6, "0")}`;
      const changed = ago(changedDaysAgo);
      const referred = new Date(changed.getTime() - Math.floor(rand() * 20 + 3) * DAY);
      await tx.query(
        `INSERT INTO service_referrals (id, recipient_id, service_id, provider_id, status, referred_by, referred_at, status_changed_at, failure_reason, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$8)`,
        [id, r.id, svc.id, svc.providerId, status, r.worker, referred, changed, failure ?? null],
      );
      await tx.query(
        `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, recipient_id, metadata, created_at) VALUES ($1,'referral.status_changed','referral',$2,$3,$4,$5)`,
        [r.worker, id, r.id, JSON.stringify({ from: null, to: "requested", seed: true }), referred],
      );
      if (status !== "requested") {
        await tx.query(
          `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, recipient_id, metadata, created_at) VALUES ($1,'referral.status_changed','referral',$2,$3,$4,$5)`,
          [null, id, r.id, JSON.stringify({ from: "requested", to: status, seed: true }), changed],
        );
      }
      return id;
    };
    const servicesFor = (r: Rec, type: ServiceType) => services.filter((s) => s.type === type && (s.regions.includes(r.dong.id) || s.regions.includes(r.dong.parent) || s.regions.includes("RG-CITY")));

    for (const r of recipients) {
      const n = Number(r.id.slice(2));
      for (const need of r.needs) {
        const opts = servicesFor(r, need);
        if (!opts.length) continue;
        const svc = opts[0];
        if (n === 1) {
          await referralFor(r, svc, "in_service", 40);
          continue;
        }
        if (n === 3 && need === "home_care") {
          await referralFor(r, svc, "suspended", 12);
          continue;
        }
        if (n <= 8) {
          await referralFor(r, svc, "in_service", 30);
          continue;
        }
        const pConnect = r.dong.id === byulbit.id ? 0.25 : 0.78;
        if (!chance(pConnect)) continue;
        const roll = rand();
        const status = roll < 0.55 ? "in_service" : roll < 0.65 ? "completed" : roll < 0.75 ? "in_progress" : roll < 0.82 ? "requested" : roll < 0.87 ? "received" : roll < 0.94 ? "failed" : "suspended";
        await referralFor(r, svc, status, Math.floor(rand() * 50) + 1, status === "failed" ? pick(["수용 인원 초과", "대상자 연락 두절", "이용 조건 불일치(기관 확인)"]) : undefined);
      }
    }

    // ── Records (≥500)
    let recIdx = 0;
    const record = async (r: Rec, f: { type: "consultation" | "visit" | "phone" | "observation"; visit?: string | null; daysAgo: number; scheduledDaysAgo?: number; flags?: string[]; text?: string }) => {
      recIdx++;
      const id = `REC-${String(recIdx).padStart(6, "0")}`;
      const at = ago(f.daysAgo);
      const scheduled = f.scheduledDaysAgo !== undefined ? ago(f.scheduledDaysAgo) : f.visit === "scheduled" ? null : null;
      await tx.query(
        `INSERT INTO care_records (id, recipient_id, record_type, visit_status, scheduled_at, recorded_at, content, flags, created_by, source_type, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'seed',$6,$6)`,
        [id, r.id, f.type, f.type === "visit" ? (f.visit ?? "completed") : null, scheduled, at, f.text ?? pick(RECORD_TEXT[f.type]), f.flags ?? [], r.worker],
      );
      return id;
    };
    for (const r of recipients) {
      const n = Number(r.id.slice(2));
      if (n === 1) {
        // A: steady, recent contact, nothing unusual
        await record(r, { type: "visit", visit: "completed", daysAgo: 3, text: "정기 방문 완료. 지역 프로그램에 즐겁게 참여하고 계심." });
        await record(r, { type: "phone", daysAgo: 10 });
        await record(r, { type: "consultation", daysAgo: 18 });
        await record(r, { type: "visit", visit: "completed", daysAgo: 25 });
        continue;
      }
      if (n === 2) {
        // B: two scheduled visits not completed
        await record(r, { type: "visit", visit: "completed", daysAgo: 24 });
        await record(r, { type: "visit", visit: "missed", daysAgo: 9, scheduledDaysAgo: 9, text: "예정 방문 시 부재. 전화 연결되지 않음." });
        await record(r, { type: "visit", visit: "scheduled", daysAgo: 6, scheduledDaysAgo: 3, text: "방문 일정 등록 (완료 기록 없음)." });
        await record(r, { type: "phone", daysAgo: 15, text: "전화 짧게 연결. 다음 방문 날짜 안내." });
        continue;
      }
      if (n === 3) {
        await record(r, { type: "visit", visit: "completed", daysAgo: 13, text: "방문 돌봄 서비스가 기관 사정으로 중단되었다고 말씀하심." });
        await record(r, { type: "phone", daysAgo: 5, flags: ["needs_support"], text: "청소와 식사 준비가 어렵다고 하심. 추가 지원 필요 표시." });
        continue;
      }
      if (n === 8) {
        await record(r, { type: "consultation", daysAgo: 7 });
        await record(r, { type: "visit", visit: "completed", daysAgo: 14 });
        continue;
      }
      const count = 2 + Math.floor(rand() * 4);
      const recent = chance(0.85);
      for (let k = 0; k < count; k++) {
        const daysAgo = k === 0 && recent ? 1 + Math.floor(rand() * 15) : 5 + Math.floor(rand() * 55);
        const type = pick(["visit", "visit", "consultation", "phone", "observation"] as const);
        const missed = type === "visit" && chance(0.07);
        const flags = chance(0.06) ? [pick(["condition_worse", "needs_support"])] : [];
        await record(r, { type, visit: missed ? "missed" : "completed", daysAgo, scheduledDaysAgo: missed ? daysAgo : undefined, flags });
      }
      // Upcoming scheduled visit for the portal schedule
      if (chance(0.6) || n === 7) {
        recIdx++;
        const at = new Date(now.getTime() + Math.floor(rand() * 12 + 1) * DAY);
        at.setUTCHours(1 + Math.floor(rand() * 6), 0, 0, 0);
        await tx.query(
          `INSERT INTO care_records (id, recipient_id, record_type, visit_status, scheduled_at, recorded_at, content, created_by, source_type)
           VALUES ($1,$2,'visit','scheduled',$3,$4,'정기 방문 예정',$5,'seed')`,
          [`REC-${String(recIdx).padStart(6, "0")}`, r.id, at, ago(1), r.worker],
        );
      }
    }

    // ── Tasks (≥50): history for completion-rate stats + open work
    let taskIdx = 0;
    const task = async (r: Rec, f: { type: string; title: string; status: string; createdDaysAgo: number; dueInDays: number | null; completedDaysAgo?: number; priority?: string; result?: string }) => {
      taskIdx++;
      const id = `TASK-${String(taskIdx).padStart(6, "0")}`;
      const created = ago(f.createdDaysAgo);
      const due = f.dueInDays === null ? null : new Date(now.getTime() + f.dueInDays * DAY);
      const completed = f.status === "completed" ? ago(f.completedDaysAgo ?? 0) : null;
      await tx.query(
        `INSERT INTO action_tasks (id, recipient_id, task_type, title, description, priority, status, assignee_id, due_at, completed_at, result_note, created_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,'',$5,$6,$7,$8,$9,$10,$7,$11,$11)`,
        [id, r.id, f.type, f.title, f.priority ?? pick(["high", "medium", "low"]), f.status, r.worker, due, completed, f.result ?? (f.status === "completed" ? "확인 완료 (가상 기록)" : null), created],
      );
      if (f.status === "completed") {
        await tx.query(`INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, recipient_id, metadata, created_at) VALUES ($1,'task.status_changed','task',$2,$3,$4,$5)`, [r.worker, id, r.id, JSON.stringify({ from: "open", to: "completed", seed: true }), completed]);
      }
      return id;
    };
    const rec = (n: number) => recipients[n - 1];
    await task(rec(4), { type: "overdue_followup", title: "보호자 연락처 재확인", status: "open", createdDaysAgo: 16, dueInDays: -6, priority: "high" });
    await task(rec(4), { type: "manual", title: "주거 환경 개선 신청 서류 안내", status: "waiting", createdDaysAgo: 20, dueInDays: -2, priority: "medium" });
    await task(rec(6), { type: "manual", title: "식사 지원 만족도 확인 전화", status: "in_progress", createdDaysAgo: 5, dueInDays: 2, priority: "medium" });
    for (let k = 0; k < 64; k++) {
      const r = recipients[8 + Math.floor(rand() * (recipients.length - 8))];
      const created = 2 + Math.floor(rand() * 75);
      const roll = rand();
      const status = roll < 0.5 ? "completed" : roll < 0.65 ? "open" : roll < 0.8 ? "in_progress" : roll < 0.9 ? "waiting" : "cancelled";
      const completedAgo = Math.max(0, created - 1 - Math.floor(rand() * 10));
      await task(r, {
        type: pick(["manual", "missed_visit", "overdue_followup", "service_interruption"]),
        title: pick(["안부 확인 방문 일정 조율", "서비스 이용 상황 확인", "보호자 상담 일정 잡기", "주민센터 연계 서류 확인", "대체 서비스 문의"]),
        status,
        createdDaysAgo: created,
        dueInDays: status === "completed" || status === "cancelled" ? -created + 7 : Math.floor(rand() * 20) - 8,
        completedDaysAgo: completedAgo,
        result: status === "cancelled" ? "대상자 요청으로 취소 (가상 기록)" : undefined,
      });
    }

    // ── Portal accounts and family links (scenario G)
    await tx.query(`INSERT INTO users (id, name, email, role, recipient_id) VALUES ('U-R7', 'NG-0007 본인 계정(가상)', 'recipient.7@demo.neulgyeot.invalid', 'recipient', 'R-0007')`);
    await tx.query(`INSERT INTO users (id, name, email, role) VALUES ('U-F7', 'NG-0007 가족 계정(가상)', 'family.7@demo.neulgyeot.invalid', 'family')`);
    await tx.query(`INSERT INTO users (id, name, email, role) VALUES ('U-F9', '동의 철회 가족 계정(가상)', 'family.revoked@demo.neulgyeot.invalid', 'family')`);
    await tx.query(
      `INSERT INTO family_links (id, recipient_id, user_id, relationship_label, consent_status, permissions) VALUES
       ('FL-001', 'R-0007', 'U-F7', '자녀', 'granted', '{"view_services":true,"view_schedule":true,"create_requests":true}'),
       ('FL-002', 'R-0007', 'U-F9', '친척', 'revoked', '{"view_services":true,"view_schedule":true,"create_requests":true}')`,
    );
    await tx.query(`UPDATE family_links SET revoked_at = $1 WHERE id = 'FL-002'`, [ago(10)]);
    await tx.query(
      `INSERT INTO support_requests (id, recipient_id, created_by, request_type, title, content, status, assigned_user_id, response_content, created_at, updated_at) VALUES
       ('REQ-000001', 'R-0007', 'U-F7', 'schedule', '다음 방문 시간 변경 가능할까요?', '오전 대신 오후 방문이 가능한지 궁금합니다. (가상 문의)', 'answered', 'U-W1', '다음 방문부터 오후 2시로 조정했습니다. (가상 답변)', $1, $2),
       ('REQ-000002', 'R-0007', 'U-R7', 'service', '식사 지원 메뉴 문의', '식사 지원 메뉴를 미리 알 수 있을까요? (가상 문의)', 'received', 'U-W1', NULL, $3, $3)`,
      [ago(8), ago(6), ago(1)],
    );

    await setCounter(tx, "SR", refIdx);
    await setCounter(tx, "REC", recIdx);
    await setCounter(tx, "TASK", taskIdx);
    await setCounter(tx, "R", total);
    await setCounter(tx, "REQ", 2);
  });

  // ── Assessments: run the real rule engine on scenario recipients and every recipient with signals.
  const { runAssessment, loadRuleInput } = await import("../services/assessments");
  const { evaluateRules } = await import("../../domain/rules/engine");
  const ids = (await db.query<{ id: string }>(`SELECT id FROM care_recipients WHERE care_status <> 'closed' ORDER BY id`)).map((r) => r.id);
  let created = 0;
  for (const id of ids) {
    const n = Number(id.slice(2));
    const outcome = evaluateRules(await loadRuleInput(db, id, now));
    const scenario = n <= 8;
    if (scenario || outcome.priority === "high" || outcome.priority === "medium" || (outcome.priority === "low" && created < 40)) {
      await runAssessment(db, null, id, { now: new Date(now.getTime() - (scenario ? 3_600_000 : Math.floor(rand() * 5) * DAY)) });
      created++;
    }
  }
  // A few reviewed results so the review history and dismissed state are visible.
  const reviewed = await db.query<{ id: string; recipient_id: string }>(
    `SELECT a.id, a.recipient_id FROM risk_assessments a WHERE a.recipient_id NOT IN ('R-0002','R-0003','R-0004','R-0006') AND a.priority = 'low' ORDER BY a.id LIMIT 6`,
  );
  for (const [i, a] of reviewed.entries()) {
    await db.query(`UPDATE risk_assessments SET review_status = $2, review_note = $3, reviewed_by = (SELECT assigned_user_id FROM care_recipients WHERE id = $4), reviewed_at = created_at + interval '4 hours' WHERE id = $1`, [
      a.id,
      i % 2 ? "dismissed" : "accepted",
      i % 2 ? "최근 전화 확인으로 상황 파악됨 (가상 검토)" : null,
      a.recipient_id,
    ]);
  }
  // Scenario F: a review task linked to NG-0006's assessment that the demo completes.
  const [f] = await db.query<{ id: string }>(`SELECT id FROM risk_assessments WHERE recipient_id = 'R-0006' ORDER BY created_at DESC LIMIT 1`);
  if (f) {
    const [{ value }] = await db.query<{ value: number }>(`UPDATE id_counters SET value = value + 1 WHERE prefix = 'TASK' RETURNING value`);
    await db.query(
      `INSERT INTO action_tasks (id, recipient_id, assessment_id, task_type, title, description, priority, status, assignee_id, due_at, created_by)
       VALUES ($1,'R-0006',$2,'assessment_review','분석 결과 검토 후 안부 방문','시연 시나리오 F: 완료 처리하면 대시보드 완료율이 갱신됩니다.','medium','open','U-W1', now() + interval '1 day','U-W1')`,
      [`TASK-${String(value).padStart(6, "0")}`, f.id],
    );
  }
  const { syncTaskDueNotifications } = await import("../services/notifications");
  await syncTaskDueNotifications(db, now);
}
