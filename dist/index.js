//imports
import isValidPath from "is-valid-path";
import fs from "fs";
import { EOL as endOfLineChar } from "os";
//*********************
//LOWDB setup
import { join, dirname } from "path";
import * as lowdb from "lowdb";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const file = join(__dirname, "db.json");
const adapter = new lowdb.JSONFile(file);
const db = new lowdb.Low(adapter);
await db.read();
db.data = db.data || { days: [] };
db.write();
const days = db.data.days;
//************************************
//constants, later could be exported to configuration file
const timeoutS = 10; //600
//arguments guard
if (process.argv.length !== 4 ||
    (process.argv[2] !== "sync" && process.argv[2] !== "watch")) {
    console.log("Not valid arguments!\nPlease choose from the following:\nWatch file: npm start watch <mounted_log_directory path>\nSync day:npm start sync <log_file_path>");
    process.exit(1);
}
//filepath format guard
if (!isValidPath(process.argv[3])) {
    console.log(process.argv[3] + " is not a valid file system path.");
    process.exit(1);
}
//main
async function main() {
    if (process.argv[2] === "watch") {
        establishConnection();
    }
    if (process.argv[2] === "sync") {
        syncFile(process.argv[3]);
    }
}
//functions
async function establishConnection() {
    let folderExists = false;
    while (!folderExists) {
        console.log("Trying to reach destination folder: " + process.argv[3]);
        if (fs.existsSync(process.argv[3])) {
            folderExists = true;
            console.log("Target folder found!");
        }
        else {
            console.log("Target folder not found, trying again in " + timeoutS + " seconds...");
            await sleep(timeoutS * 1000);
            continue;
        }
    }
    //start to watch todays log file, and after the watch started sync it
    watchLogFile(new Date());
    //sync the files of missing days, expect todays file
    syncPastDays();
}
async function syncPastDays() {
    let lastLoggedTime = getLastLogTime().setHours(12, 0, 0, 0);
    let todayTime = new Date().setHours(12, 0, 0, 0);
    let daysThatNeedSync = [];
    let currentTime = lastLoggedTime;
    while (currentTime < todayTime) {
        //get the first day
        let currentDate = new Date(currentTime);
        daysThatNeedSync.push(getDayString(currentDate));
        //move a day forward
        currentTime += 1000 * 3600 * 24;
    }
    console.log("The following past days need to be synced: " +
        (daysThatNeedSync.length > 0 ? daysThatNeedSync.join(", ") : "none"));
    for (let i = 0; i < daysThatNeedSync.length; i++) {
        syncFile(getFilePath(daysThatNeedSync[i]));
    }
}
function syncFile(filePath) {
    console.log("Syncing file: " + filePath);
    if (!fs.existsSync(filePath)) {
        console.log("File doesn't exist: " + filePath);
        return;
    }
    let records = [];
    const fileContents = fs.readFileSync(filePath, "utf-8");
    fileContents.split(endOfLineChar).forEach((line) => {
        let record = parseLine(line);
        if (!record) {
            return;
        }
        records.push(record);
    });
    postData(records);
}
//todo:get the last logged date from the server
function getLastLogTime() {
    let maxDate = new Date();
    if (days.length === 0) {
        return maxDate;
    }
    else {
        maxDate = new Date(days[0].date);
        for (let i = 1; i < days.length; i++) {
            if (getDayString(new Date()) === days[i].date)
                continue;
            if (new Date(days[i].date).getTime() > maxDate.getTime()) {
                maxDate = new Date(days[i].date);
            }
        }
    }
    return maxDate;
}
function watchLogFile(date) {
    //get the day string of the given date parameter: format: YYYY-MM-dd
    let dayString = getDayString(date);
    //get the log file path to the day string
    let logFilePath = getFilePath(dayString);
    //check if the file exists
    //if file not found return to the main entry point
    if (!fs.existsSync(logFilePath)) {
        console.log("Log file of " +
            dayString +
            " doesn't exists yet, checking again in " +
            timeoutS +
            " seconds...");
        setTimeout(() => {
            establishConnection();
        }, timeoutS * 1000);
        return;
    }
    //setTImeout to stop file watch at midnight and go back to main entry point
    let d = new Date().setUTCHours(24, 1, 0, 0);
    let msTillNewDay = d - new Date().getTime();
    setTimeout(() => {
        console.log("Stopped watching " + logFilePath);
        fs.unwatchFile(logFilePath);
        establishConnection();
    }, msTillNewDay);
    //set the file size to always read the new lines only
    let fileSize = fs.statSync(logFilePath).size;
    //set up the file watch
    console.log("Watching " + logFilePath);
    fs.watchFile(logFilePath, function (current, previous) {
        // Check if file modified time is less than last time.
        // If so, nothing changed so don't bother parsing.
        if (current.mtime <= previous.mtime) {
            return;
        }
        // We're only going to read the portion of the file that
        // we have not read so far. Obtain new file size.
        var newFileSize = fs.statSync(logFilePath).size;
        // Calculate size difference.
        var sizeDiff = newFileSize - fileSize;
        // Create a buffer to hold only the data we intend to read.
        var buffer = Buffer.alloc(sizeDiff);
        // Obtain reference to the file's descriptor.
        var fileDescriptor = fs.openSync(logFilePath, "r");
        // Synchronously read from the file starting from where we read
        // to last time and store data in our buffer.
        fs.readSync(fileDescriptor, buffer, 0, sizeDiff, fileSize);
        fs.closeSync(fileDescriptor); // close the file
        // Set old file size to the new size for next read.
        fileSize = newFileSize;
        // Parse the line(s) in the buffer.
        parseBuffer(buffer);
    });
    //sync the file after the watch was set
    syncFile(logFilePath);
}
function parseBuffer(buffer) {
    // Iterate over each line in the buffer.
    let records = [];
    buffer
        .toString()
        .split(endOfLineChar)
        .forEach(function (line) {
        let record = parseLine(line);
        if (!record) {
            return;
        }
        records.push(record);
    });
    postData(records);
}
function postData(producedFrames) {
    let dayString = getDayString(new Date(producedFrames[0].timestamp));
    let dayIndex = days.findIndex((record) => record.date === dayString);
    if (dayIndex !== -1) {
        for (let i = 0; i < producedFrames.length; i++) {
            let day = days[dayIndex];
            let producedFrame = producedFrames[i];
            let frameIndex = day.frames.findIndex((frame) => {
                return frame.time === producedFrame.time;
            });
            if (frameIndex !== -1) {
                days[dayIndex].frames[frameIndex] = producedFrame;
            }
            else {
                days[dayIndex].frames.push(producedFrame);
            }
        }
    }
    else {
        days.push({
            date: dayString,
            frames: producedFrames,
        });
    }
    db.write();
}
//helper functions
function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
function getDayString(date) {
    return (date.getFullYear() +
        "-" +
        ("0" + (date.getMonth() + 1)).slice(-2) +
        "-" +
        ("0" + date.getDate()).slice(-2));
}
function getFilePath(dayString) {
    return process.argv[3] + "/Produced frames - " + dayString + ".csv";
}
function parseLine(line) {
    let splittedLine = line.split(";");
    if (splittedLine.length !== 10)
        return null;
    let frameRecord = {
        time: splittedLine[0],
        timestamp: splittedLine[1].replace(/^\"/, "").replace(/\"$/, ""),
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
//execute program
main();
//# sourceMappingURL=index.js.map