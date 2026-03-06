import { Module } from "@nestjs/common";
import { RULE_ENGINE_CONTRACT } from "@app/shared/interfaces/contracts/rule-engine.contract";
import { RuleContextBuilder } from "./evaluators/rule-context.builder";
import { ConditionEvaluator } from "./evaluators/condition.evaluator";
import { RuleEngineService } from "./services/rule-engine.service";

/**
 * Stateless module wrapping json-rules-engine.
 *
 * NO imports from other modules — this module has no DB tables to guard.
 * The implementation stays internal; only the rule-engine contract crosses
 * the module boundary so consumers stay decoupled from the concrete service.
 */
@Module({
  providers: [
    RuleContextBuilder,
    ConditionEvaluator,
    RuleEngineService,
    { provide: RULE_ENGINE_CONTRACT, useClass: RuleEngineService },
  ],
  exports: [RULE_ENGINE_CONTRACT],
})
export class RuleEngineModule {}
