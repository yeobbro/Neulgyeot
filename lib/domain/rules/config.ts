/**
 * Risk-signal rule thresholds. Change values here, not in the rule code.
 * Bump RULE_VERSION whenever a threshold or rule changes so stored
 * assessments stay traceable to the logic that produced them.
 */
export const RULE_VERSION = "rules-2026.10.1";

export const RULE_CONFIG = {
  /** Look-back window for most rules. */
  windowDays: 30,
  /** A scheduled visit still open this many hours after its time counts as not completed. */
  scheduledGraceHours: 24,
  /** Number of missed visits in the window that makes the signal "repeated". */
  repeatedMissedVisits: 2,
  /** A service suspended at least this long is flagged. */
  suspendedServiceDays: 7,
  /** Window for structured "condition worse / needs support" flags on records. */
  recordFlagWindowDays: 14,
  /** No completed contact for this many days is flagged. */
  noContactDays: 21,
  /** Fewer records than this in the window marks the analysis as data-insufficient. */
  minRecordsForAnalysis: 2,
  /** Distinct independent signal types that add a compound signal. */
  multipleSignalTypes: 3,
  /** Work-priority score weights (not probabilities). */
  weights: {
    missed_visit: 20,
    repeated_missed_visits: 15,
    service_interruption: 25,
    referral_failure: 20,
    overdue_followup: 15,
    recorded_change: 20,
    no_recent_contact: 15,
    multiple_signals: 10,
    urgent_procedure_check: 40,
  },
  /** Score thresholds for the displayed priority band. */
  priorityThresholds: { high: 60, medium: 30 },
} as const;

export type RuleConfig = typeof RULE_CONFIG;
