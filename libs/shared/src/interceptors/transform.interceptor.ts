import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from "@nestjs/common";
import { instanceToPlain } from "class-transformer";
import { map } from "rxjs/operators";

/**
 * TransformInterceptor to transform outgoing objects into plain js objects
 * @category Core
 */
@Injectable()
export class TransformInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler<any>) {
        return next.handle().pipe(
            map((data) => {
                return instanceToPlain(data);
            }),
        );
    }
}
