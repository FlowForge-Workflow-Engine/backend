import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { connect } from "nats";
import { WORKFLOW_QUERY_CONTRACT } from "@app/shared/interfaces/contracts/workflow-query.contract";
import { NATS_CLIENT } from "../../infra";

// Entities
import { WorkflowDefinition } from "./entities/workflow-definition.entity";
import { WorkflowDefinitionVersion } from "./entities/workflow-definition-version.entity";
import { WorkflowState } from "./entities/workflow-state.entity";
import { WorkflowTransition } from "./entities/workflow-transition.entity";
import { TransitionRule } from "./entities/transition-rule.entity";
import { InstanceFormSchema } from "./entities/instance-form-schema.entity";

// Repositories
import { WorkflowDefinitionRepository } from "./repositories/workflow-definition.repository";
import { WorkflowVersionRepository } from "./repositories/workflow-version.repository";
import { WorkflowStateRepository } from "./repositories/workflow-state.repository";
import { WorkflowTransitionRepository } from "./repositories/workflow-transition.repository";
import { TransitionRuleRepository } from "./repositories/transition-rule.repository";
import { InstanceFormSchemaRepository } from "./repositories/instance-form-schema.repository";

// Services
import { WorkflowDefinitionService } from "./services/workflow-definition.service";
import { WorkflowVersionService } from "./services/workflow-version.service";
import { WorkflowStateService } from "./services/workflow-state.service";
import { WorkflowTransitionService } from "./services/workflow-transition.service";
import { WorkflowQueryService } from "./services/workflow-query.service";

// Publisher
import { WorkflowDefinitionPublisher } from "./publishers/workflow-definition.publisher";

// Controllers
import { WorkflowDefinitionController } from "./controllers/workflow-definition.controller";
import { WorkflowStateController } from "./controllers/workflow-state.controller";
import { WorkflowTransitionController } from "./controllers/workflow-transition.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkflowDefinition,
      WorkflowDefinitionVersion,
      WorkflowState,
      WorkflowTransition,
      TransitionRule,
      InstanceFormSchema,
    ]),
  ],
  providers: [
    {
      provide: NATS_CLIENT,
      useFactory: async (configService: ConfigService) => {
        const natsUrl = configService.get<string>("NATS_URL", "nats://localhost:4222");
        return connect({ servers: [natsUrl] });
      },
      inject: [ConfigService],
    },
    // Repositories
    WorkflowDefinitionRepository,
    WorkflowVersionRepository,
    WorkflowStateRepository,
    WorkflowTransitionRepository,
    TransitionRuleRepository,
    InstanceFormSchemaRepository,
    // Publisher
    WorkflowDefinitionPublisher,
    // Services
    WorkflowVersionService,
    WorkflowDefinitionService,
    WorkflowStateService,
    WorkflowTransitionService,
    WorkflowQueryService,
    /** Contract binding — only this token leaves the module boundary */
    { provide: WORKFLOW_QUERY_CONTRACT, useClass: WorkflowQueryService },
  ],
  controllers: [WorkflowDefinitionController, WorkflowStateController, WorkflowTransitionController],
  exports: [WORKFLOW_QUERY_CONTRACT],
})
export class WorkflowDefinitionModule {}
