import * as m001 from "./001_init";

export type Migration = { version: string; up: string; down: string };

/** Ordered list. Add new migrations at the end; never edit an applied one. */
export const migrations: Migration[] = [m001];
