import { Module } from "@nestjs/common";
import { RuleContextBuilder } from "./evaluators/rule-context.builder";
import { ConditionEvaluator } from "./evaluators/condition.evaluator";
import { RuleEngineService } from "./services/rule-engine.service";

/**
 * Stateless module wrapping json-rules-engine.
 *
 * NO imports from other modules — this module has no DB tables to guard.
 * RuleEngineService is exported directly (no Symbol contract needed)
 * because it is a pure computational service.
 */
@Module({
  providers: [RuleContextBuilder, ConditionEvaluator, RuleEngineService],
  exports: [RuleEngineService],
})
export class RuleEngineModule {}
