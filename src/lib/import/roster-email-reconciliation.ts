export type EmailRosterStudent = {
  displayName: string;
  studentNumber: string;
  currentEmail: string | null;
};

export type ParsedSchoolEmailList = {
  emails: string[];
  duplicateEmails: string[];
  invalidTokens: string[];
};

export type AutomaticEmailMatch = {
  studentNumber: string;
  email: string | null;
  status: "matched" | "already-linked" | "unmatched" | "ambiguous";
};

function normalizeNamePart(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function splitDisplayName(displayName: string) {
  const trimmed = displayName.trim();
  if (trimmed.includes(",")) {
    const [lastName, ...firstParts] = trimmed.split(",");
    return { firstName: firstParts.join(",").trim(), lastName: lastName.trim() };
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { firstName: "", lastName: "" };
  return { firstName: parts[0], lastName: parts[parts.length - 1] };
}

export function studentEmailMatchKey(displayName: string) {
  const { firstName, lastName } = splitDisplayName(displayName);
  const normalizedFirst = normalizeNamePart(firstName);
  const normalizedLast = normalizeNamePart(lastName);
  if (!normalizedFirst || !normalizedLast) return null;
  return `${normalizedFirst[0]}${normalizedLast}`;
}

export function emailMatchKey(email: string) {
  const localPart = email.trim().toLowerCase().split("@")[0] ?? "";
  const withoutTrailingDigits = localPart.replace(/\d+$/, "");
  return normalizeNamePart(withoutTrailingDigits) || null;
}

export function parseSchoolEmailList(raw: string): ParsedSchoolEmailList {
  const tokens = raw
    .split(/[;,\s]+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

  const invalidTokens = tokens.filter((token) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(token));
  const validTokens = tokens.filter((token) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(token));
  const counts = new Map<string, number>();
  validTokens.forEach((email) => counts.set(email, (counts.get(email) ?? 0) + 1));

  return {
    emails: [...new Set(validTokens)],
    duplicateEmails: [...counts.entries()].filter(([, count]) => count > 1).map(([email]) => email),
    invalidTokens: [...new Set(invalidTokens)],
  };
}

export function reconcileRosterEmails(students: EmailRosterStudent[], rawEmailList: string) {
  const parsed = parseSchoolEmailList(rawEmailList);
  const studentsByKey = new Map<string, EmailRosterStudent[]>();
  const emailsByKey = new Map<string, string[]>();

  for (const student of students) {
    const key = studentEmailMatchKey(student.displayName);
    if (!key) continue;
    const list = studentsByKey.get(key) ?? [];
    list.push(student);
    studentsByKey.set(key, list);
  }

  for (const email of parsed.emails) {
    const key = emailMatchKey(email);
    if (!key) continue;
    const list = emailsByKey.get(key) ?? [];
    list.push(email);
    emailsByKey.set(key, list);
  }

  const matches: AutomaticEmailMatch[] = students.map((student) => {
    const key = studentEmailMatchKey(student.displayName);
    if (!key) return { studentNumber: student.studentNumber, email: null, status: "unmatched" as const };

    const matchingStudents = studentsByKey.get(key) ?? [];
    const matchingEmails = emailsByKey.get(key) ?? [];
    if (matchingStudents.length > 1 || matchingEmails.length > 1) {
      return { studentNumber: student.studentNumber, email: null, status: "ambiguous" as const };
    }
    if (matchingEmails.length === 0) {
      return { studentNumber: student.studentNumber, email: null, status: "unmatched" as const };
    }

    const email = matchingEmails[0];
    return {
      studentNumber: student.studentNumber,
      email,
      status: student.currentEmail?.toLowerCase() === email ? "already-linked" as const : "matched" as const,
    };
  });

  const matchedEmails = new Set(matches.map((match) => match.email).filter((email): email is string => Boolean(email)));
  const unmatchedEmails = parsed.emails.filter((email) => !matchedEmails.has(email));

  return {
    ...parsed,
    matches,
    unmatchedEmails,
    exactMatchCount: matches.filter((match) => match.email).length,
    unresolvedStudentCount: matches.filter((match) => !match.email).length,
  };
}
