import { Inject } from "@nestjs/common";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";

export const InjectLogger = () => Inject(WINSTON_MODULE_NEST_PROVIDER);
