import { Injectable } from "@nestjs/common";
import { RuleMetadata, RULE_METADATA } from "@app/shared/interfaces/contracts/rule-engine.contract";

@Injectable()
export class RuleMetadataService {
  getMetadata(): RuleMetadata {
    return RULE_METADATA;
  }
}