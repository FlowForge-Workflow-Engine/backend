import { ApiProperty } from "@nestjs/swagger";

export class DashboardStatsResponseDto {
  @ApiProperty({ example: 12, description: "Total workflow definitions owned by the tenant" })
  totalWorkflows: number;

  @ApiProperty({ example: 7, description: "Workflow definitions currently in published status" })
  publishedWorkflows: number;

  @ApiProperty({ example: 19, description: "Workflow instances currently in active status" })
  activeInstances: number;

  @ApiProperty({ example: 42, description: "Total users belonging to the tenant" })
  totalUsers: number;
}
