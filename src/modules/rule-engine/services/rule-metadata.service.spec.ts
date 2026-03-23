import { RuleMetadataService } from "./rule-metadata.service";
import { RULE_METADATA } from "@app/shared/interfaces/contracts/rule-engine.contract";

describe("RuleMetadataService", () => {
  it("returns fixed RULE_METADATA", () => {
    const service = new RuleMetadataService();
    expect(service.getMetadata()).toBe(RULE_METADATA);
  });
});

