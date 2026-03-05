import { HttpService } from "@nestjs/axios";
import { Injectable, Logger } from "@nestjs/common";
import { firstValueFrom } from "rxjs";
import { AxiosError } from "axios";

import { MAX_RETRIES, RATE_LIMIT_DELAY } from "../../constants/constants";
import { InjectLogger } from "../../decorators/logger.decorator";

@Injectable()
export class HttpClientService {
  constructor(
    private readonly httpService: HttpService,
    @InjectLogger() private readonly logger: Logger
  ) {}

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async get(
    url: string,
    headers?: Record<string, string>,
    params?: any,
    body?: any,
    retryCount: number = 1
  ): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers,
          params,
          data: body,
        })
      );
      return response.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        // Check if it's a rate limit error
        if (error.response?.status === 429 && retryCount < MAX_RETRIES) {
          this.logger.warn(
            `Rate limit hit, retrying in ${RATE_LIMIT_DELAY}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`
          );
          await this.delay(RATE_LIMIT_DELAY * (retryCount + 1)); // Exponential backoff
          return this.get(url, headers, params, body, retryCount + 1);
        }
        this.logger.error(`API Error: ${error.message}`, {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
        });
      }
      throw error;
    }
  }

  async post(
    url: string,
    body?: any,
    headers?: Record<string, string>,
    params?: any,
    retryCount: number = 0
  ): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(url, body, {
          headers,
          params,
        })
      );
      return response.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        // Check if it's a rate limit error
        if (error.response?.status === 429 && retryCount < MAX_RETRIES) {
          this.logger.warn(
            `Rate limit hit, retrying in ${RATE_LIMIT_DELAY}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`
          );
          await this.delay(RATE_LIMIT_DELAY * (retryCount + 1)); // Exponential backoff
          return this.post(url, body, headers, params, retryCount + 1);
        }
        this.logger.error(`API Error: ${error.message}`, {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
        });
      }
      throw error;
    }
  }
}
