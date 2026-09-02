type PowerSchoolConfig = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
};

type TokenResponse = {
  access_token?: unknown;
  token_type?: unknown;
  expires_in?: unknown;
};

type JsonRecord = Record<string, unknown>;

export type PowerSchoolTeacherSection = {
  sectionId: string;
  courseNumber: string | null;
  courseName: string | null;
  expression: string | null;
  room: string | null;
  rosterCount: number;
};

export type PowerSchoolTeacherDiscovery = {
  teacherEmail: string;
  teacherName: string | null;
  sections: PowerSchoolTeacherSection[];
};

const TEACHER_SECTIONS_QUERY = "com.unorth.teacher_grade_analytics.teacher_sections_by_email";
const SECTION_ROSTER_QUERY = "com.unorth.teacher_grade_analytics.section_roster_by_id";
const ALLOWED_POWERQUERIES = new Set([TEACHER_SECTIONS_QUERY, SECTION_ROSTER_QUERY]);
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_DISCOVERED_SECTIONS = 24;

export function getPowerSchoolConfigStatus() {
  const missing = [
    ["POWERSCHOOL_BASE_URL", process.env.POWERSCHOOL_BASE_URL],
    ["POWERSCHOOL_CLIENT_ID", process.env.POWERSCHOOL_CLIENT_ID],
    ["POWERSCHOOL_CLIENT_SECRET", process.env.POWERSCHOOL_CLIENT_SECRET],
  ].filter(([, value]) => !value).map(([name]) => name);

  let host: string | null = null;
  if (process.env.POWERSCHOOL_BASE_URL) {
    try {
      host = new URL(process.env.POWERSCHOOL_BASE_URL).host;
    } catch {
      host = null;
    }
  }

  return { configured: missing.length === 0, missing, host };
}

function getConfig(): PowerSchoolConfig {
  const status = getPowerSchoolConfigStatus();
  if (!status.configured) throw new Error(`PowerSchool connector is not configured (${status.missing.join(", ")}).`);

  const parsed = new URL(process.env.POWERSCHOOL_BASE_URL as string);
  if (parsed.protocol !== "https:") throw new Error("PowerSchool base URL must use HTTPS.");

  return {
    baseUrl: parsed.origin,
    clientId: process.env.POWERSCHOOL_CLIENT_ID as string,
    clientSecret: process.env.POWERSCHOOL_CLIENT_SECRET as string,
  };
}

async function fetchWithTimeout(url: URL, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("PowerSchool request timed out.");
    throw new Error("PowerSchool could not be reached.");
  } finally {
    clearTimeout(timeout);
  }
}

function safeStatusError(context: string, response: Response) {
  return new Error(`${context} failed with HTTP ${response.status}.`);
}

async function requestAccessToken(config: PowerSchoolConfig) {
  const url = new URL("/oauth/access_token/", config.baseUrl);
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`, "utf8").toString("base64");
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
  });
  if (!response.ok) throw safeStatusError("PowerSchool OAuth", response);

  let body: TokenResponse;
  try {
    body = await response.json() as TokenResponse;
  } catch {
    throw new Error("PowerSchool OAuth returned an unreadable response.");
  }
  if (typeof body.access_token !== "string" || !body.access_token) throw new Error("PowerSchool OAuth did not return an access token.");
  return body.access_token;
}

async function executeReadOnlyPowerQuery(config: PowerSchoolConfig, accessToken: string, queryName: string, args: JsonRecord) {
  if (!ALLOWED_POWERQUERIES.has(queryName)) throw new Error("PowerSchool query is not on the read-only allowlist.");

  const url = new URL(`/ws/schema/query/${queryName}`, config.baseUrl);
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!response.ok) throw safeStatusError("PowerSchool read-only query", response);

  try {
    return await response.json() as unknown;
  } catch {
    throw new Error("PowerSchool query returned an unreadable response.");
  }
}

function objectRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function flattenRecord(value: unknown): JsonRecord | null {
  const record = objectRecord(value);
  if (!record) return null;
  const tables = objectRecord(record.tables);
  if (!tables) return record;

  const flattened: JsonRecord = {};
  for (const tableValue of Object.values(tables)) {
    const table = objectRecord(tableValue);
    if (table) Object.assign(flattened, table);
  }
  return { ...record, ...flattened };
}

function extractRecords(payload: unknown): JsonRecord[] {
  if (Array.isArray(payload)) return payload.map(flattenRecord).filter((value): value is JsonRecord => Boolean(value));
  const root = objectRecord(payload);
  if (!root) return [];

  for (const key of ["record", "records", "results"]) {
    if (Array.isArray(root[key])) return (root[key] as unknown[]).map(flattenRecord).filter((value): value is JsonRecord => Boolean(value));
  }

  const single = flattenRecord(root);
  return single ? [single] : [];
}

function textValue(record: JsonRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

export async function discoverPowerSchoolTeacher(teacherEmail: string): Promise<PowerSchoolTeacherDiscovery> {
  const normalizedEmail = teacherEmail.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) throw new Error("Teacher account does not have a usable school email.");

  const config = getConfig();
  const accessToken = await requestAccessToken(config);
  const teacherPayload = await executeReadOnlyPowerQuery(config, accessToken, TEACHER_SECTIONS_QUERY, { teacher_email: normalizedEmail });
  const teacherRecords = extractRecords(teacherPayload).filter((record) => textValue(record, "teacher_email", "email_addr")?.toLowerCase() === normalizedEmail);

  const uniqueSectionRecords = new Map<string, JsonRecord>();
  for (const record of teacherRecords) {
    const sectionId = textValue(record, "section_id", "id");
    if (sectionId && !uniqueSectionRecords.has(sectionId)) uniqueSectionRecords.set(sectionId, record);
  }

  if (uniqueSectionRecords.size > MAX_DISCOVERED_SECTIONS) throw new Error("PowerSchool returned an unexpectedly large section set; discovery stopped for safety.");

  const sections: PowerSchoolTeacherSection[] = [];
  for (const [sectionId, record] of uniqueSectionRecords) {
    const rosterPayload = await executeReadOnlyPowerQuery(config, accessToken, SECTION_ROSTER_QUERY, { section_id: sectionId });
    const rosterRecords = extractRecords(rosterPayload);
    const studentNumbers = new Set(rosterRecords.flatMap((student) => {
      const studentNumber = textValue(student, "student_number");
      return studentNumber ? [studentNumber] : [];
    }));

    sections.push({
      sectionId,
      courseNumber: textValue(record, "course_number"),
      courseName: textValue(record, "course_name"),
      expression: textValue(record, "expression"),
      room: textValue(record, "room"),
      rosterCount: studentNumbers.size || rosterRecords.length,
    });
  }

  const first = teacherRecords[0];
  const firstName = first ? textValue(first, "teacher_first_name", "first_name") : null;
  const lastName = first ? textValue(first, "teacher_last_name", "last_name") : null;
  const teacherName = [firstName, lastName].filter(Boolean).join(" ") || null;

  return {
    teacherEmail: normalizedEmail,
    teacherName,
    sections: sections.sort((a, b) => (a.courseNumber ?? "").localeCompare(b.courseNumber ?? "") || (a.expression ?? "").localeCompare(b.expression ?? "")),
  };
}
