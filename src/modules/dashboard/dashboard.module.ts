import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { WorkflowDefinitionModule } from "../workflow-definition/workflow-definition.module";
import { WorkflowExecutionModule } from "../workflow-execution/workflow-execution.module";
import { DashboardController } from "./controllers/dashboard.controller";
import { DashboardService } from "./services/dashboard.service";

@Module({
  imports: [AuthModule, WorkflowDefinitionModule, WorkflowExecutionModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
