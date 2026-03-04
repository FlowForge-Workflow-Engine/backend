import { WinstonModuleOptions } from "nest-winston";
import * as winston from "winston";

export const winstonLoggerConfig: WinstonModuleOptions = {
  levels: winston.config.npm.levels,
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.json(),
    winston.format.prettyPrint(),
    winston.format.splat(),
  ),
  transports:
    // Simple for Non-Prod Environments
    process.env.NODE_ENV !== "PROD"
      ? [
          new winston.transports.File({
            filename: `logs/${new Date().toISOString().split("T")[0].replace(/-/g, "/")}/application.log`,
            format: winston.format.combine(
              winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
              winston.format.printf(({ timestamp, level, message, ...meta }) => {
                return `[${timestamp}] ${level}: ${message} ${
                  Object.keys(meta).length ? JSON.stringify(meta) : ""
                }`;
              }),
            ),
          }),
        ]
      : // Detail JSON based for production Environment
        [
          new winston.transports.File({
            // prettier-ignore
            filename: `logs/application-errors/${new Date().toISOString().split("T")[0].replace(/-/g, "/")}/error.log`,
            level: "error",
          }),
          new winston.transports.File({
            filename: `logs/${new Date().toISOString().split("T")[0].replace(/-/g, "/")}/application.log`,
            level: "info",
          }),
        ],
};
