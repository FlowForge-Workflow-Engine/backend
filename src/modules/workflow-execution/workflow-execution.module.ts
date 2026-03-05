import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CqrsModule } from "@nestjs/cqrs";
import { ConfigService } from "@nestjs/config";
import { connect } from "nats";
import { NATS_CLIENT } from "../../infra";
import { RuleEngineModule } from "../rule-engine/rule-engine.module";
import { WorkflowDefinitionModule } from "../workflow-definition/workflow-definition.module";

// Entities
import { WorkflowInstance } from "./entities/workflow-instance.entity";
import { WeUserShadow } from "./entities/we-user-shadow.entity";

// Repositories
import { WorkflowInstanceRepository } from "./repositories/workflow-instance.repository";
import { UserShadowRepository } from "./repositories/user-shadow.repository";

// Command Handlers
import { CreateInstanceHandler } from "./handlers/create-instance.handler";
import { ExecuteTransitionHandler } from "./handlers/execute-transition.handler";
import { CancelInstanceHandler } from "./handlers/cancel-instance.handler";

// Query Handlers
import { GetInstanceDetailHandler } from "./handlers/get-instance-detail.handler";
import { GetInstanceListHandler } from "./handlers/get-instance-list.handler";
import { GetAllowedTransitionsHandler } from "./handlers/get-allowed-transitions.handler";

// Services, Publisher, Subscriber, Controller
import { WorkflowExecutionService } from "./services/workflow-execution.service";
import { ExecutionPublisher } from "./publishers/execution.publisher";
import { AuthEventsSubscriber } from "./subscribers/auth-events.subscriber";
import { WorkflowExecutionController } from "./controllers/workflow-execution.controller";

const CommandHandlers = [CreateInstanceHandler, ExecuteTransitionHandler, CancelInstanceHandler];
const QueryHandlers = [GetInstanceDetailHandler, GetInstanceListHandler, GetAllowedTransitionsHandler];

@Module({
  imports: [
    CqrsModule,
    RuleEngineModule,
    WorkflowDefinitionModule,
    TypeOrmModule.forFeature([WorkflowInstance, WeUserShadow]),
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
    WorkflowInstanceRepository,
    UserShadowRepository,
    // Handlers
    ...CommandHandlers,
    ...QueryHandlers,
    // Services & Publishers
    WorkflowExecutionService,
    ExecutionPublisher,
    // Subscriber (also a @Controller for MessagePattern)
    AuthEventsSubscriber,
  ],
  controllers: [WorkflowExecutionController, AuthEventsSubscriber],
})
export class WorkflowExecutionModule {}
