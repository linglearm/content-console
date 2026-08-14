export type HofSection = {
  role?: unknown;
  heading?: unknown;
  paras?: unknown;
  image?: unknown;
};

export type HofFacebookComment = {
  role: "REFERENCE" | "SAFETY" | "HOW" | "WHY";
  message: string;
  imageUrl?: string;
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sectionMessage(section: HofSection): string {
  const paras = Array.isArray(section.paras) ? section.paras.map(cleanText).filter(Boolean) : [];
  return paras.join("\n\n");
}

/**
 * Facebook shows the newest Page comment first. Posting in this exact reverse
 * order makes the visible stack read 1/3, 2/3, 3/3, then REF.
 */
export function buildHofFacebookComments(sections: HofSection[]): HofFacebookComment[] {
  const byRole = new Map<string, HofSection>();
  for (const section of sections || []) {
    const role = cleanText(section.role || section.heading).toUpperCase();
    if (role) byRole.set(role, section);
  }

  const required = ["REFERENCE", "SAFETY", "HOW", "WHY"] as const;
  for (const role of required) {
    const section = byRole.get(role);
    if (!section || !sectionMessage(section)) throw new Error(`missing_${role.toLowerCase()}_comment`);
    if (role !== "REFERENCE" && !/^https:\/\//i.test(cleanText(section.image))) {
      throw new Error(`missing_${role.toLowerCase()}_image`);
    }
  }

  const ref = byRole.get("REFERENCE")!;
  const safety = byRole.get("SAFETY")!;
  const how = byRole.get("HOW")!;
  const why = byRole.get("WHY")!;
  return [
    { role: "REFERENCE", message: `REF\n${sectionMessage(ref)}` },
    { role: "SAFETY", message: `3/3\n${sectionMessage(safety)}`, imageUrl: cleanText(safety.image) },
    { role: "HOW", message: `2/3\n${sectionMessage(how)}`, imageUrl: cleanText(how.image) },
    { role: "WHY", message: `1/3\n${sectionMessage(why)}`, imageUrl: cleanText(why.image) },
  ];
}
