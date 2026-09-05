import type { StudyCase } from "./studies";
import type { OptothermalResult } from "./types";
import { assertValidResult, isOptothermalConfig } from "./validation";

export const CASE_STORAGE_KEY = "optothermal-simulator:cases";
export const CASES_SCHEMA = "optothermal-simulator/cases@1";
export const CASES_MODEL = "axisymmetric-rz-local-tmm-thermal@0.3";
export const MAX_CASES = 8;
export const MAX_JSON_CHARS = 4 * 1024 * 1024;

const emptyWarning = "";

interface StoredCases {
  schema: typeof CASES_SCHEMA;
  model: typeof CASES_MODEL;
  cases: StudyCase[];
}

type ReadStorage = Pick<Storage, "getItem">;
type WriteStorage = Pick<Storage, "setItem">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function validateStudyCase(value: unknown, index: number): StudyCase {
  if (!isRecord(value)) {
    throw new Error(`Case ${index + 1} must be an object.`);
  }
  if (typeof value.id !== "string" || value.id.trim().length === 0 || value.id.length > 80) {
    throw new Error(`Case ${index + 1} id must be a non-empty string of at most 80 characters.`);
  }
  if (typeof value.name !== "string" || value.name.trim().length === 0 || value.name.length > 80) {
    throw new Error(`Case ${index + 1} name must be a non-empty string of at most 80 characters.`);
  }
  if (!isOptothermalConfig(value.config)) {
    throw new Error(`Case ${index + 1} has an invalid configuration.`);
  }
  if (!isRecord(value.result)) {
    throw new Error(`Case ${index + 1} has an invalid result.`);
  }
  if (value.result.engine !== "Rust/WASM") {
    throw new Error(`Case ${index + 1} has an invalid result engine.`);
  }
  try {
    assertValidResult(value.config, value.result as unknown as OptothermalResult);
  } catch (error) {
    throw new Error(`Case ${index + 1} has an invalid result: ${errorMessage(error)}`, { cause: error });
  }
  return value as unknown as StudyCase;
}

function validateCases(value: unknown): StudyCase[] {
  if (!Array.isArray(value)) {
    throw new Error("The stored cases value must be an array.");
  }
  if (value.length > MAX_CASES) {
    throw new Error(`A maximum of ${MAX_CASES} study cases can be stored.`);
  }
  const ids = new Set<string>();
  const validated: StudyCase[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const candidate = value[index];
    const studyCase = validateStudyCase(candidate, index);
    if (ids.has(studyCase.id)) {
      throw new Error(`Study case id "${studyCase.id}" is duplicated.`);
    }
    ids.add(studyCase.id);
    validated.push(studyCase);
  }
  return validated;
}

function parseStoredCases(value: unknown): StudyCase[] {
  if (!isRecord(value) || value.schema !== CASES_SCHEMA || value.model !== CASES_MODEL) {
    throw new Error(`The stored study-case schema must be ${CASES_SCHEMA} for model ${CASES_MODEL}.`);
  }
  return validateCases(value.cases);
}

function invalidStorageWarning(reason: string): string {
  return `Saved study cases were ignored because the stored data is invalid: ${reason}`;
}

export function loadCases(storage?: ReadStorage): { cases: StudyCase[]; warning: string } {
  let raw: string | null;
  try {
    raw = (storage ?? window.localStorage).getItem(CASE_STORAGE_KEY);
  } catch (error) {
    return { cases: [], warning: `Saved study cases could not be read: ${errorMessage(error)}` };
  }
  if (raw === null) return { cases: [], warning: emptyWarning };
  if (typeof raw !== "string") {
    return { cases: [], warning: invalidStorageWarning("the storage value is not a string.") };
  }
  if (raw.length > MAX_JSON_CHARS) {
    return {
      cases: [],
      warning: invalidStorageWarning(`the JSON payload exceeds the ${MAX_JSON_CHARS}-character limit.`),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    return { cases: [], warning: invalidStorageWarning(`JSON parsing failed: ${errorMessage(error)}`) };
  }
  try {
    return { cases: parseStoredCases(parsed), warning: emptyWarning };
  } catch (error) {
    return { cases: [], warning: invalidStorageWarning(errorMessage(error)) };
  }
}

export function saveCases(cases: StudyCase[], storage?: WriteStorage): void {
  let validated: StudyCase[];
  try {
    validated = validateCases(cases);
  } catch (error) {
    throw new Error(`Study cases were not saved: ${errorMessage(error)}`, { cause: error });
  }

  let serialized: string;
  try {
    const envelope: StoredCases = { schema: CASES_SCHEMA, model: CASES_MODEL, cases: validated };
    serialized = JSON.stringify(envelope);
  } catch (error) {
    throw new Error(`Study cases were not saved because they are not JSON serializable: ${errorMessage(error)}`, { cause: error });
  }
  if (serialized.length > MAX_JSON_CHARS) {
    throw new Error(`Study cases were not saved because the JSON payload exceeds the ${MAX_JSON_CHARS}-character limit.`);
  }

  try {
    (storage ?? window.localStorage).setItem(CASE_STORAGE_KEY, serialized);
  } catch (error) {
    throw new Error(`Study cases were not saved because browser storage rejected the write (quota or access error): ${errorMessage(error)}`, { cause: error });
  }
}
