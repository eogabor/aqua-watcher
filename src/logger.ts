import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import { AquaLoggerConfig } from "./config.model";

export function initWinston(config: AquaLoggerConfig) {
  //create normal logger
  const fileTransport: DailyRotateFile = new DailyRotateFile({
    level: "http",
    filename: "%DATE%.log",
    dirname: config.logFolderPath,
    datePattern: "YYYY-MM-DD",
    zippedArchive: true,
    maxSize: "20m",
    maxFiles: "14d",
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.align(),
      winston.format.printf(
        (info) => `${info.timestamp} ${info.level}: ${info.message}`
      )
    ),
    handleExceptions: true,
  });

  const consoleTransport = new winston.transports.Console({
    level: "http",
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp(),
      winston.format.align(),
      winston.format.printf(
        (info) => `${info.timestamp} ${info.level}: ${info.message}`
      )
    ),
    handleExceptions: true,
  });

  const logger = winston.createLogger({
    level: "http",
    transports: [consoleTransport, fileTransport],
  });

  return logger;
}
