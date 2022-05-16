#!/usr/bin/env node
//imports
import fs from "fs";
import axios from "axios";
import { validateArguments } from "./validations.js";
import { initWinston } from "./logger.js";
import { execSync } from "child_process";
var config;
var logger;
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
    //after this config should be valid, so set it
    config = JSON.parse(fs.readFileSync(process.argv[3]).toString());
    //Winston Logger setup
    logger = initWinston(config);
    logger.info(`Program started. Mode:  ${process.argv[2]}`);
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
    await mountDrive();
    //start to watch todays log file, and after the watch started sync it
    let watchSuccess = await watchLogFile(new Date());
    //sync the files of missing days, expect todays file
    if (watchSuccess) {
        syncPastDays();
    }
    //syncing must happen after the watch started, to not let any records slip
}
/**
 * Check's if the target drive is mounted on LINUX, and if the target folder is available on WINDOWS.
 *
 * If the drive is not mounted, it tries to mount it. If mount is unsuccesful try again after the configured timeout passed.
 *
 * If the drive is mounted to the wrong folder, correct it.
 
 */
async function mountDrive() {
    if (process.platform === "win32") {
        //on windows the drive shouldnt be explicitly mounted, but should be able to see the folder on the network
        let folderExists = false;
        //loop until the folder is found
        while (!folderExists) {
            logger.info(`Trying to reach destination folder: ${config.sourceFolderPath}`);
            if (fs.existsSync(config.sourceFolderPath)) {
                //if folder found exit the loop
                folderExists = true;
                logger.info("Target folder found!");
            }
            else {
                //if folder not found try again in configured time, considering offline window
                logger.warn(`Target folder not found, trying again at ${getWakeUpTime().toLocaleString()}.`);
                await sleepUntil(getWakeUpTime());
                continue;
            }
        }
        return;
    }
    if (process.platform === "linux") {
        //on linux the target folder should be mounted
        let driveMounted = false;
        //loop until the folder is found
        while (!driveMounted) {
            logger.info(`Check if source folder is mounted:  ${config.sourceFolderPath}`);
            //the mounted path, initally empty
            let mountedPath = "";
            //get the mounted path if any
            try {
                let mountGrepResponse = execSync(`mount | grep ${config.sourceFolderPath}`).toString("utf-8");
                //get the mount destination from the response
                mountedPath = mountGrepResponse.split("type")[0].split("on")[1].trim();
                //Drive mounted can exit loop
                logger.info(`Source folder is mounted on: ${mountedPath}`);
                driveMounted = true;
            }
            catch (error) {
                //if grep value not found it throws an error, that means no drive is mounted from the sourcePath
                logger.warn(`Drive isn't mounted.\n
        ${JSON.stringify(error)}
        `);
            }
            //if drive is not mounted try to mount it
            if (mountedPath.length === 0) {
                logger.info(`Trying to mount: ${config.sourceFolderPath} at destination ${config.mountFolderPath}`);
                try {
                    execSync(`sudo mount -t cifs -o username=guest,password= ${config.sourceFolderPath} ${config.mountFolderPath}`);
                    //on succesful mount execution wont stop, if mount unsuccesful throws error
                    //get the mount destionation
                    let mountGrepResponse = execSync(`mount | grep ${config.sourceFolderPath}`).toString("utf-8");
                    mountedPath = mountGrepResponse
                        .split("type")[0]
                        .split("on")[1]
                        .trim();
                    //drive mounted, can exit loop
                    logger.info(`Target folder is mounted at: ${mountedPath}`);
                    driveMounted = true;
                }
                catch (error) {
                    //on error sleep until the configured time
                    logger.warn(`Couldn't mount ${config.sourceFolderPath} on ${config.mountFolderPath}, trying again at ${getWakeUpTime().toLocaleString()}\n
            ${JSON.stringify(error)}`);
                    await sleepUntil(getWakeUpTime());
                    continue;
                }
            }
            //if drive is mounted at the wrong target folder, unmount it, and try to mount it again
            if (mountedPath.length > 0 && mountedPath !== config.mountFolderPath) {
                logger.warn(`Drive is mounted at wrong target. Current target: ${mountedPath} and it should be at: ${config.mountFolderPath}`);
                logger.info(`Trying to mount: ${config.sourceFolderPath} at destination ${config.mountFolderPath}`);
                try {
                    //unmount the drive
                    execSync(`sudo umount ${mountedPath}`);
                    logger.info(`Unmounted ${mountedPath}.`);
                    execSync(`sudo mount -t cifs -o username=guest,password= ${config.sourceFolderPath} ${config.mountFolderPath}`);
                    //on succesful mount execution wont stop, if mount unsuccesful throws error
                    //get the mount destionation
                    let mountGrepResponse = execSync(`mount | grep ${config.sourceFolderPath}`).toString("utf-8");
                    mountedPath = mountGrepResponse
                        .split("type")[0]
                        .split("on")[1]
                        .trim();
                    //drive mounted, can exit loop
                    logger.info(`Target folder is mounted at: ${mountedPath}`);
                    driveMounted = true;
                }
                catch (error) {
                    //on error sleep until the configured time
                    logger.warn(`Couldn't mount ${config.sourceFolderPath} on ${config.mountFolderPath}, trying again at ${getWakeUpTime().toLocaleString()}\n
            ${JSON.stringify(error)}`);
                    await sleepUntil(getWakeUpTime());
                    continue;
                }
            }
        }
        return;
    }
    //if not on windows or linux exit the program
    logger.error("This app is only optimalized for windows and linux systems. Your system is: " +
        process.platform);
    process.exit(1);
}
/**
 * Gets the last logged day from the server. If its prior to today, sync it and the days between toddys date.(Don't sync todays file)
 */
async function syncPastDays() {
    logger.info("Scan start for syncable past days...");
    //get the last logged time and set it to exact midnight
    let lastLoggedDate = await getLastLogTime();
    let lastLoggedTime = lastLoggedDate.setHours(12, 0, 0, 0);
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
    logger.info("The following past days need to be synced: " +
        (daysThatNeedSync.length > 0 ? daysThatNeedSync.join(", ") : "none"));
    //sync the days, including weekends, but they wont sync if the related file is not found
    for (let i = 0; i < daysThatNeedSync.length; i++) {
        await syncFile(getFilePath(daysThatNeedSync[i]));
    }
}
/**
 * Syncs the file at the given path. If the file doesnt exist return.
 * @param filePath - Path to the file that needs to be synced.
 */
async function syncFile(filePath) {
    logger.info("Tryig to syncing file: " + filePath);
    //file exists guard
    if (!fs.existsSync(filePath)) {
        logger.warn("File doesn't exist: " + filePath);
        return;
    }
    let records = [];
    const fileContents = fs.readFileSync(filePath, "utf-8");
    fileContents.split(config.endOfLineChar).forEach((line) => {
        let record = parseLine(line);
        if (!record) {
            return;
        }
        records.push(record);
    });
    //post the content of the file
    await postData(records);
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
async function watchLogFile(date) {
    //get the day string of the given date parameter: format: YYYY-MM-dd
    let dayString = getDayString(date);
    //get the log file path to the day string
    let logFilePath = getFilePath(dayString);
    logger.info("Try to watch log file of day: " + dayString);
    //check if the file exists
    //if file not found return to the main entry point
    if (!fs.existsSync(logFilePath)) {
        logger.warn(`Log file of ${dayString} doesn't exists yet, checking again at ${getWakeUpTime()}`);
        setTimeout(() => {
            establishConnection();
        }, getWakeUpTime().getTime() - new Date().getTime());
        return false;
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
        let buffer = Buffer.alloc(sizeDiff);
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
    return true;
}
/**
 * Parse the passed raw log lines, into JSON format, then post them to the server.
 * @param buffer - Buffer containing the frehsly read file contents.
 */
function parseBuffer(buffer) {
    // Iterate over each line in the buffer.
    let records = [];
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
 * @param time - Time(number representing ms) value, that the program should sleep until.
 */
function sleepUntil(wakeUpDate) {
    let currentTime = new Date().getTime();
    let wakeUpTime = wakeUpDate.getTime();
    let ms = wakeUpTime > currentTime ? wakeUpTime - currentTime : 0;
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
/**
 * Returns the date of the next try, considering the offline Window.
 *
 * @returns Date - date of the next operation
 */
function getWakeUpTime() {
    let currHour = new Date().getHours();
    let currMinute = new Date().getMinutes();
    //if in the offline window, return the offline windows end
    if (currHour >= config.offlineWindowStart.H &&
        currHour <= config.offlineWindowEnd.H &&
        currMinute >= config.offlineWindowStart.M &&
        currMinute <= config.offlineWindowEnd.M) {
        let wakeUpDate = new Date();
        wakeUpDate = new Date(wakeUpDate.setHours(config.offlineWindowEnd.H));
        wakeUpDate = new Date(wakeUpDate.setMinutes(config.offlineWindowEnd.M));
        return wakeUpDate;
    }
    else {
        let wakeUpDate = new Date();
        wakeUpDate = new Date(wakeUpDate.getTime() + config.timeout * 1000);
        return wakeUpDate;
    }
}
//configurable functions, later to be exported to config file
/**
 * Convert the given date, to the log file names date format.
 * @param date - Date that needs to be converted to logfilename date format
 */
function getDayString(date) {
    return (date.getFullYear() +
        "-" +
        ("0" + (date.getMonth() + 1)).slice(-2) +
        "-" +
        ("0" + date.getDate()).slice(-2));
}
/**
 * Returns the log files name, based on the given day srting.
 * @param dayString - The string format fitting the date format in the log file names.
 */
function getFilePath(dayString) {
    //on linux systems
    if (process.platform === "linux") {
        return config.mountFolderPath + "/Produced frames - " + dayString + ".csv";
    }
    //on other systems
    return config.sourceFolderPath + "/Produced frames - " + dayString + ".csv";
}
/**
 * Parses the line and returns a FrameRecord or null if a frame couldnt be constructed.
 * @param line - raw line of the log file
 */
function parseLine(line) {
    let splittedLine = line.split(";");
    if (splittedLine.length !== 10)
        return null;
    let frameRecord = {
        time: splittedLine[0],
        timestamp: splittedLine[1].replace(/^\"/, "").replace(/\"$/, ""),
        productId: Number(splittedLine[2]),
        machineId: config.machineId,
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
async function getLastLogTime() {
    let maxDate = new Date();
    await axios
        .get(config.getLastLogDateURL)
        .then((res) => {
        logger.http(`[GET]:${config.getLastLogDateURL} [STATUS]:${res.status}\n  RESPONSE:${JSON.stringify(res.data)}`);
        //todo log the http get
        if (res.data.maxDate !== null) {
            maxDate = res.data.maxDate;
        }
    })
        .catch((error) => {
        logger.error(JSON.stringify(error));
    });
    return new Date(maxDate);
}
/**
 * Posts an array of {@link FrameRecord} to the server.
 * @param producedFrames - Data to be post to the server
 */
async function postData(producedFrames) {
    await axios
        .post(config.postDataUrl, producedFrames)
        .then((res) => {
        logger.http(`[POST]:${config.getLastLogDateURL} [STATUS]:${res.status}\n
          BODY: ${JSON.stringify(producedFrames)}
          RESPONSE:${JSON.stringify(res.data)}`);
    })
        .catch((error) => {
        logger.error(JSON.stringify(error));
    });
    await axios
        .post("http://192.168.0.239:9000/event", producedFrames)
        .catch((error) => {
        logger.error(JSON.stringify(error));
    });
}
//execute program
main();
//# sourceMappingURL=index.js.map