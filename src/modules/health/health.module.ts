import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { HealthController } from "./health.controller";

@Module({
  imports: [TerminusModule.forRoot({ errorLogStyle: "pretty", logger: true })],
  controllers: [HealthController],
})
export class HealthModule {}
