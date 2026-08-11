import { Injectable, Logger } from "@nestjs/common";

export interface AbstainResult {
  shouldAbstain: boolean;
  reason?: string;
  category?: string;
  disclaimer?: string;
}

const CONFLICT_FIELDS = [
  {
    pattern: /retail\s*profit\s*(rate|percentage|%)/i,
    field: "retail_profit_rate",
    reason:
      "Retail profit rate has conflicting sources (30-50% vs up to 100%). Human review required.",
  },
  {
    pattern: /mentorship\s*(bonus|incentive|rate|percentage|%)/i,
    field: "mentorship_bonus_rate",
    reason:
      "Mentorship bonus rate has conflicting sources (100% of binary vs 50% of BMI). Human review required.",
  },
  {
    pattern: /business\s*matching\s*(incentive|structure|rate|amount)/i,
    field: "business_matching_structure",
    reason:
      "Business Matching Incentive structure has conflicting sources (flat Rs 500/pair vs tiered). Human review required.",
  },
];

const HEALTH_DISCLAIMER =
  "This is general product information from Dayjoy's own materials and hasn't been independently medically verified. It isn't medical advice — please consult a qualified professional for anything related to a health condition.";

const INCOME_DISCLAIMER =
  "Income results vary and are not guaranteed. This figure is illustrative only.";

const ABSTAIN_CATEGORIES = [
  {
    pattern: /(cure|treat|diagnose|fix|heal)\s+(my|this|the)/i,
    category: "medical_claim",
    reason: "Cannot provide medical diagnosis or treatment advice.",
  },
  {
    pattern: /(best.?selling|most popular|top selling)/i,
    category: "popularity_claim",
    reason: "Cannot confirm sales rankings — data is inferred, not verified.",
  },
  {
    pattern: /(guaranteed\s+income|earn\s+\$|will\s+I\s+earn|how\s+much\s+will\s+I\s+make)/i,
    category: "income_claim",
    reason: "Cannot guarantee specific income amounts.",
  },
];

@Injectable()
export class AbstainPolicyService {
  private readonly logger = new Logger(AbstainPolicyService.name);

  checkQuery(query: string): AbstainResult {
    for (const cf of CONFLICT_FIELDS) {
      if (cf.pattern.test(query)) {
        return {
          shouldAbstain: true,
          reason: cf.reason,
          category: "compensation_conflict",
          disclaimer:
            "I don't have a confirmed figure for this yet — the source documents disagree, and I don't want to guess. Let me flag this for the Dayjoy team to confirm.",
        };
      }
    }

    for (const cat of ABSTAIN_CATEGORIES) {
      if (cat.pattern.test(query)) {
        if (cat.category === "medical_claim") {
          return { shouldAbstain: true, reason: cat.reason, category: cat.category };
        }
        return {
          shouldAbstain: false,
          reason: cat.reason,
          category: cat.category,
          disclaimer: cat.category === "income_claim" ? INCOME_DISCLAIMER : undefined,
        };
      }
    }

    return { shouldAbstain: false };
  }

  checkResponse(response: string, query: string): { needsDisclaimer: boolean; disclaimer?: string } {
    if (
      /(benefit|ingredient|dosage|usage|how\s+to\s+use|side\s+effect)/i.test(query) &&
      /(health|wellness|supplement|vitamin|mineral|herbal)/i.test(response)
    ) {
      return { needsDisclaimer: true, disclaimer: HEALTH_DISCLAIMER };
    }

    if (
      /(earn|income|profit|rs\.|₹|incentive|bonus|reward)/i.test(response) &&
      /(per\s+month|per\s+week|monthly|weekly|annual|yearly)/i.test(response)
    ) {
      return { needsDisclaimer: true, disclaimer: INCOME_DISCLAIMER };
    }

    return { needsDisclaimer: false };
  }
}
