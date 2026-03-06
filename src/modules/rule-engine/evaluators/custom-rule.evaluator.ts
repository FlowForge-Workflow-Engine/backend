import { Injectable } from "@nestjs/common";
import {
  CustomRuleDefinition,
  RuleContext,
  RuleDefinition,
  RuleEvaluationResult,
  WorkflowRuleDefinition,
} from "../interfaces/rule.interfaces";

type CustomStrategyHandler = (
  params: Readonly<Record<string, unknown>>,
  context: RuleContext
) => string | null;

@Injectable()
export class CustomRuleEvaluator {
  private readonly strategies: Record<string, CustomStrategyHandler> = {
    "date-range-matches-days": (params, context) => this.evaluateDateRangeMatchesDays(params, context),
    "user-has-any-role": (params, context) => this.evaluateUserHasAnyRole(params, context),
  };

  isCustomRule(rule: RuleDefinition): boolean {
    return this.isCustomRuleDefinition(rule.ruleDefinition);
  }

  async evaluate(rule: RuleDefinition, context: RuleContext): Promise<RuleEvaluationResult> {
    const definition = rule.ruleDefinition;

    if (!this.isCustomRuleDefinition(definition)) {
      return { passed: true, failedRules: [] };
    }

    const strategy = this.strategies[definition.strategy];
    if (!strategy) {
      return {
        passed: false,
        failedRules: [
          {
            ruleName: rule.ruleName,
            reason: `No custom rule evaluator registered for strategy \"${definition.strategy}\"`,
          },
        ],
      };
    }

    const reason = strategy(definition.params ?? {}, context);
    if (!reason) {
      return { passed: true, failedRules: [] };
    }

    return {
      passed: false,
      failedRules: [{ ruleName: rule.ruleName, reason }],
    };
  }

  private evaluateUserHasAnyRole(
    params: Readonly<Record<string, unknown>>,
    context: RuleContext
  ): string | null {
    const roles = Array.isArray(params["roles"])
      ? params["roles"].filter((value): value is string => typeof value === "string")
      : [];

    if (roles.length === 0) {
      return 'Custom strategy "user-has-any-role" requires a non-empty "roles" array';
    }

    const allowed = roles.some((role) => context.user.roles.includes(role));
    return allowed ? null : `User must have at least one of these roles: ${roles.join(", ")}`;
  }

  private evaluateDateRangeMatchesDays(
    params: Readonly<Record<string, unknown>>,
    context: RuleContext
  ): string | null {
    const startField = this.getString(params["startDateField"]) ?? "startDate";
    const endField = this.getString(params["endDateField"]) ?? "endDate";
    const daysField = this.getString(params["daysField"]) ?? "days";

    const startValue = this.readPayloadField(context.payload, startField);
    const endValue = this.readPayloadField(context.payload, endField);
    const daysValue = this.readPayloadField(context.payload, daysField);

    const startDate = this.toDate(startValue);
    const endDate = this.toDate(endValue);
    const days = this.toNumber(daysValue);

    if (!startDate || !endDate || days === null) {
      return `Custom strategy \"date-range-matches-days\" requires payload fields \"${startField}\", \"${endField}\", and \"${daysField}\"`;
    }

    const expectedDays = this.calculateInclusiveDays(startDate, endDate);
    if (expectedDays === null) {
      return `Payload date range \"${startField}\" -> \"${endField}\" is invalid`;
    }

    return days === expectedDays
      ? null
      : `Payload field \"${daysField}\" must equal ${expectedDays} for the selected date range, received ${days}`;
  }

  private calculateInclusiveDays(startDate: Date, endDate: Date): number | null {
    const millisecondsPerDay = 24 * 60 * 60 * 1000;
    const utcStart = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate());
    const utcEnd = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());
    const difference = utcEnd - utcStart;

    if (difference < 0) {
      return null;
    }

    return Math.floor(difference / millisecondsPerDay) + 1;
  }

  private readPayloadField(payload: Record<string, unknown>, path: string): unknown {
    const normalizedPath = path.startsWith("$.") ? path.slice(2) : path.replace(/^\$/, "");
    if (!normalizedPath) {
      return payload;
    }

    return normalizedPath.split(".").reduce<unknown>((current, segment) => {
      if (!current || typeof current !== "object") {
        return undefined;
      }

      return (current as Record<string, unknown>)[segment];
    }, payload);
  }

  private toDate(value: unknown): Date | null {
    if (typeof value !== "string") {
      return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  private getString(value: unknown): string | null {
    return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
  }

  private isCustomRuleDefinition(definition: WorkflowRuleDefinition): definition is CustomRuleDefinition {
    return definition["type"] === "custom" && typeof definition["strategy"] === "string";
  }
}
