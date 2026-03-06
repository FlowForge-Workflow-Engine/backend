import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ApiSuccessResponse } from "@app/shared/decorators/swagger-generic-response.decorator";
import { ApiResponseDto } from "@app/shared/dto/base-response.dto";
import { RuleMetadataResponseDto } from "../dto/rule-metadata-response.dto";
import { RuleMetadataService } from "../services/rule-metadata.service";

@ApiTags("Workflow Rules")
@ApiBearerAuth()
@Controller("workflow-rules")
export class RuleMetadataController {
  constructor(private readonly service: RuleMetadataService) {}

  @Get("metadata")
  @ApiOperation({ summary: "Get fixed rule-authoring metadata for frontend rule builders" })
  @ApiSuccessResponse(RuleMetadataResponseDto, "Workflow rule metadata retrieved successfully")
  getMetadata(): ApiResponseDto<RuleMetadataResponseDto> {
    const data = RuleMetadataResponseDto.fromMetadata(this.service.getMetadata());
    return { status: "success", data };
  }
}