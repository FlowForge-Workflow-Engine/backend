import { RuleMetadataController } from "./rule-metadata.controller";
import { RuleMetadataService } from "../services/rule-metadata.service";
import { RULE_METADATA } from "@app/shared/interfaces/contracts/rule-engine.contract";

describe("RuleMetadataController", () => {
  it("wraps metadata response with success", () => {
    const service: Pick<RuleMetadataService, "getMetadata"> = {
      getMetadata: () => RULE_METADATA,
    };
    const controller = new RuleMetadataController(service as RuleMetadataService);

    const result = controller.getMetadata();
    expect(result.status).toBe("success");
    expect(result.data).toEqual(
      expect.objectContaining({
        facts: [...RULE_METADATA.facts],
        ruleTypes: [...RULE_METADATA.ruleTypes],
        customStrategies: [...RULE_METADATA.customStrategies],
      })
    );
  });
});

