/**
 * Shared SQL definitions so lists, the map, the dashboard and reports count
 * "unconnected" and "needs review" the same way. `r` must alias care_recipients.
 */

/** At least one registered need has no active referral of that service type. */
export const UNCONNECTED_SQL = `EXISTS (
  SELECT 1 FROM unnest(r.needs) AS need(t)
  WHERE NOT EXISTS (
    SELECT 1 FROM service_referrals sr JOIN service_catalog sc ON sc.id = sr.service_id
    WHERE sr.recipient_id = r.id AND sc.service_type = need.t
      AND sr.status IN ('requested','received','in_progress','in_service')
  )
)`;

/** The latest assessment is "우선 확인"/"확인 권장" and still awaiting review. */
export const NEEDS_REVIEW_SQL = `EXISTS (
  SELECT 1 FROM risk_assessments a
  WHERE a.recipient_id = r.id AND a.review_status = 'pending' AND a.priority IN ('high','medium')
    AND a.created_at = (SELECT max(a2.created_at) FROM risk_assessments a2 WHERE a2.recipient_id = r.id)
)`;

/** Recipients counted as registered (not closed). */
export const ACTIVE_RECIPIENT_SQL = `r.care_status <> 'closed'`;
