import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
export function initWinston(config) {
    const fileTransport = new DailyRotateFile({
        filename: "%DATE%.log",
        dirname: config.logFolderPath,
        datePattern: "YYYY-MM-DD",
        zippedArchive: true,
        maxSize: "20m",
        maxFiles: "14d",
        format: winston.format.combine(winston.format.timestamp(), winston.format.align(), winston.format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}`)),
        handleExceptions: true,
    });
    const consoleTransport = new winston.transports.Console({
        format: winston.format.combine(winston.format.colorize(), winston.format.timestamp(), winston.format.align(), winston.format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}`)),
        handleExceptions: true,
        level: "http",
    });
    const logger = winston.createLogger({
        transports: [consoleTransport, fileTransport],
    });
    return logger;
}
//# sourceMappingURL=logger.js.map