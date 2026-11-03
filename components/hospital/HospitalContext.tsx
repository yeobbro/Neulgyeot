"use client";

import { createContext, useContext, type Dispatch } from "react";
import type { Patient } from "@/lib/hospital/types";
import type { HospitalAction, HospitalState } from "@/lib/state/hospital-store";

export interface HospitalContextValue {
  state: HospitalState;
  dispatch: Dispatch<HospitalAction>;
  patients: Patient[];
  patient: Patient;
}

export const HospitalContext = createContext<HospitalContextValue | null>(null);

export function useHospital(): HospitalContextValue {
  const ctx = useContext(HospitalContext);
  if (!ctx) throw new Error("useHospital must be used inside <HospitalApp>");
  return ctx;
}
