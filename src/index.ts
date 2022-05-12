#!/usr/bin/env node

//imports
import fs from "fs";

import { AquaLoggerConfig, validateArguments } from "./validations.js";
import { initWinston } from "./logger.js";
import { db } from "./lowdb-config.js";
import winston from "winston";

export type FrameRecord = {
  time: string;
  timestamp: string;
  productId: number;
  itemNo: number;
  width: number;
  height: number;
  frameType: string;
  currentlyProduced: number;
  total: number;
  printedName: string;
};

const days = db!.data!.days;
var config: AquaLoggerConfig;
var logger: winston.Logger;

//main
/**
 * Main entry point for the program.
 *
 * Checks arguments, inits logger and config.
 * 
 * Detects which mode is active:
 *
 * 1:Sync a standalone file, filepath given as argument.
 *
 * 2:Start watching the current days logfile, in the log directory given as argument.
 */
async function main() {
  //validate the arguments
  validateArguments(process.argv);
  config = JSON.parse(fs.readFileSync(process.argv[3]).toString());
  //Winston Logger setup
  logger = initWinston(config!);
  logger.info("Program started. Mode: " + process.argv[2]);

  if (process.argv[2] === "watch") {
    establishConnection();
  }

  if (process.argv[2] === "sync") {
    syncFile(getFilePath(getDayString(new Date(process.argv[4]))));
  }
}

//functions
/**
 * Checks if the target folder exists. If it doesn`t exist, tries again in {@link config.timeout} seconds. (file host may be off.)
 *
 * If the target folder exists, starts to watch the current days log file, and after that syncs the unlogged days, if theres any.
 */
async function establishConnection() {
  let folderExists = false;
  while (!folderExists) {
    logger.info(
      "Trying to reach destination folder: " + config.targetFolderPath
    );
    if (fs.existsSync(config.targetFolderPath)) {
      //if folder found exit the loop
      folderExists = true;
      logger.info("Target folder found!");
    } else {
      //if folder not found try again in config.timeout seconds
      logger.warn(
        "Target folder not found, trying again in " +
          config.timeout +
          " seconds..."
      );
      await sleep(config.timeout * 1000);
      continue;
    }
  }
  //start to watch todays log file, and after the watch started sync it
  watchLogFile(new Date());
  //sync the files of missing days, expect todays file
  syncPastDays();
  //syncing must happen after the watch started, to not let any records slip
}

/**
 * Gets the last logged day from the server. If its prior to today, sync it and the days between toddys date.(Don't sync todays file)
 */
async function syncPastDays() {
  logger.info("Scan start for syncable past days...");

  //get the last logged time and set it to exact midnight
  let lastLoggedTime = getLastLogTime().setHours(12, 0, 0, 0);

  //get todays time and set it to exact midnight, to be able to calculate the days between accurately
  let todayTime = new Date().setHours(12, 0, 0, 0);

  let daysThatNeedSync = [];
  //iterator value
  let currentTime = lastLoggedTime;
  // <: dont count today
  while (currentTime < todayTime) {
    //get the first day
    let currentDate = new Date(currentTime);
    daysThatNeedSync.push(getDayString(currentDate));

    //move a day forward
    currentTime += 1000 * 3600 * 24;
  }

  logger.info(
    "The following past days need to be synced: " +
      (daysThatNeedSync.length > 0 ? daysThatNeedSync.join(", ") : "none")
  );

  //sync the days, including weekends, but they wont sync if the related file is not found
  for (let i = 0; i < daysThatNeedSync.length; i++) {
    syncFile(getFilePath(daysThatNeedSync[i]));
  }
}

/**
 * Syncs the file at the given path. If the file doesnt exist return.
 * @param filePath - Path to the file that needs to be synced.
 */
function syncFile(filePath: string) {
  logger.info("Tryig to syncing file: " + filePath);
  //file exists guard
  if (!fs.existsSync(filePath)) {
    logger.warn("File doesn't exist: " + filePath);
    return;
  }

  let records: FrameRecord[] = [];
  const fileContents = fs.readFileSync(filePath, "utf-8");
  fileContents.split(config.endOfLineChar).forEach((line) => {
    let record = parseLine(line);
    if (!record) {
      return;
    }
    records.push(record);
  });

  //post the content of the file
  postData(records);
  logger.info("File: " + filePath + " synced, data posted.");
}

/**
 * Starts watching the log file, of the date given as parameter. If the log file doesn't exist returns to {@link establishConnection}.
 *
 * After the watch started, syncs today file, providing no data loss on unexpected crash during the day.
 *
 * At every midnight, the watching of the logFile stops, and returns to {@link establishConnection},
 * thus starting to watch todays file as soon as its available.
 *
 * @param date - date of the log file to be watched, only the day will be extarcted
 */
function watchLogFile(date: Date) {
  //get the day string of the given date parameter: format: YYYY-MM-dd
  let dayString = getDayString(date);
  //get the log file path to the day string
  let logFilePath = getFilePath(dayString);

  logger.info("Try to watch log file of day: " + dayString);

  //check if the file exists
  //if file not found return to the main entry point
  if (!fs.existsSync(logFilePath)) {
    logger.warn(
      "Log file of " +
        dayString +
        " doesn't exists yet, checking again in " +
        config.timeout +
        " seconds..."
    );
    setTimeout(() => {
      establishConnection();
    }, config.timeout * 1000);
    return;
  }

  //setTImeout to stop file watch at midnight and go back to main entry point
  let d = new Date().setUTCHours(24, 1, 0, 0);
  let msTillNewDay = d - new Date().getTime();
  setTimeout(() => {
    logger.info("Stopped watching " + logFilePath);
    fs.unwatchFile(logFilePath);
    establishConnection();
  }, msTillNewDay);

  //set the file size to always read the new lines only
  let fileSize = fs.statSync(logFilePath).size;

  //set up the file watch
  fs.watchFile(logFilePath, function (current, previous) {
    // Check if file modified time is less than last time.
    // If so, nothing changed so don't bother parsing.
    if (current.mtime <= previous.mtime) {
      return;
    }

    // We're only going to read the portion of the file that
    // we have not read so far. Obtain new file size.
    let newFileSize = fs.statSync(logFilePath).size;
    // Calculate size difference.
    let sizeDiff = newFileSize - fileSize;

    // Create a buffer to hold only the data we intend to read.
    let buffer: Buffer = Buffer.alloc(sizeDiff);
    // Obtain reference to the file's descriptor.
    let fileDescriptor = fs.openSync(logFilePath, "r");
    // Synchronously read from the file starting from where we read
    // to last time and store data in our buffer.
    fs.readSync(fileDescriptor, buffer, 0, sizeDiff, fileSize);
    fs.closeSync(fileDescriptor); // close the file
    // Set old file size to the new size for next read.
    fileSize = newFileSize;

    // Parse the line(s) in the buffer.
    parseBuffer(buffer);
  });
  logger.info("Started watching file: " + logFilePath);
  //sync the file after the watch was set
  syncFile(logFilePath);
}

/**
 * Parse the passed raw log lines, into JSON format, then post them to the server.
 * @param buffer - Buffer containing the frehsly read file contents.
 */
function parseBuffer(buffer: Buffer) {
  // Iterate over each line in the buffer.
  let records: FrameRecord[] = [];
  buffer
    .toString()
    .split(config.endOfLineChar)
    .forEach(function (line) {
      let record = parseLine(line);
      if (!record) {
        return;
      }
      records.push(record);
    });

  postData(records);
}

//helper functions
/**
 * Stops the program execution, if awaited in an async function.
 * @param ms - ms that the program execution stops for.
 */
function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

//configurable functions, later to be exported to config file
/**
 * Convert the given date, to the log file names date format.
 * @param date - Date that needs to be converted to logfilename date format
 */
function getDayString(date: Date): string {
  return (
    date.getFullYear() +
    "-" +
    ("0" + (date.getMonth() + 1)).slice(-2) +
    "-" +
    ("0" + date.getDate()).slice(-2)
  );
}

/**
 * Returns the log files name, based on the given day srting.
 * @param dayString - The string format fitting the date format in the log file names.
 */
function getFilePath(dayString: string) {
  return config.targetFolderPath + "/Produced frames - " + dayString + ".csv";
}

/**
 * Parses the line and returns a FrameRecord or null if a frame couldnt be constructed.
 * @param line - raw line of the log file
 */
function parseLine(line: string): FrameRecord | null {
  let splittedLine = line.split(";");
  if (splittedLine.length !== 10) return null;
  let frameRecord: FrameRecord = {
    time: splittedLine[0],
    timestamp: splittedLine[1].replace(/^\"/, "").replace(/\"$/, ""), //delete " but only if its on the end or the bigining of the line
    productId: Number(splittedLine[2]),
    itemNo: Number(splittedLine[3]),
    width: Number(splittedLine[4].split("-")[0]),
    height: Number(splittedLine[4].split("-")[1]),
    frameType: splittedLine[5],
    currentlyProduced: Number(splittedLine[7]) + 1,
    total: Number(splittedLine[8]),
    printedName: splittedLine[9].replace(/^\"/, "").replace(/\"$/, ""), //delete " but only if its on the end or the bigining of the line
  };

  return frameRecord;
}

//todo:get the last logged date from the server
/**
 * Gets the last log time from the server. If no logged time found returns null.
 */
function getLastLogTime() {
  let maxDate = new Date();

  if (days.length === 0) {
    return maxDate;
  } else {
    maxDate = new Date(days[0].date);
    for (let i = 1; i < days.length; i++) {
      if (getDayString(new Date()) === days[i].date) continue;
      if (new Date(days[i].date).getTime() > maxDate.getTime()) {
        maxDate = new Date(days[i].date);
      }
    }
  }

  return maxDate;
}

/**
 * Posts an array of {@link FrameRecord} to the server.
 * @param producedFrames - Data to be post to the server
 */
function postData(producedFrames: FrameRecord[]) {
  let dayString = getDayString(new Date(producedFrames[0].timestamp));

  let dayIndex = days.findIndex((record) => record.date === dayString);

  if (dayIndex !== -1) {
    for (let i = 0; i < producedFrames.length; i++) {
      let day = days[dayIndex];
      let producedFrame = producedFrames[i];
      let frameIndex = day.frames.findIndex((frame: FrameRecord) => {
        return frame.time === producedFrame.time;
      });

      if (frameIndex !== -1) {
        days[dayIndex].frames[frameIndex] = producedFrame;
      } else {
        days[dayIndex].frames.push(producedFrame);
      }
    }
  } else {
    days.push({
      date: dayString,
      frames: producedFrames,
    });
  }
  logger.http("Data sent: " + JSON.stringify(producedFrames));
  db.write();
}

//execute program
main();
