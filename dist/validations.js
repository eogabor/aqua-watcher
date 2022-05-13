import fs from "fs";
import isValidPath from "is-valid-path";
import validUrl from "valid-url";
const baseErrorMessage = `This program has 2 operation modes:\n
1. WATCH|args: watch <config_file_absolute_path> - Watches the log file of todayday, and sends data tot the server.\n
2. SYNC|args: sync <config_file_absolute_path> <syncable_date_as_string> - Syncs the log file of the day given as parameter. \n
Please provide the valid arguments for one of them.\n
For more info see the readme file.\n`;
export function validateArguments(armguments) {
    let errorString = "";
    //mode and arguments length
    if ((process.argv[2] === "watch" && process.argv.length !== 4) ||
        (process.argv[2] === "sync" && process.argv.length !== 5)) {
        //if not right mode, or not correct arguments length exit the program.
        console.error(baseErrorMessage);
        process.exit(1);
    }
    let configFilePath = process.argv[3];
    //validate path
    if (!fs.existsSync(configFilePath) ||
        configFilePath.split(".").pop() !== "json") {
        //if not valid path exit
        errorString += baseErrorMessage;
        errorString += "\nThe 2nd argument should be a valid filepath.";
        console.error(errorString);
        process.exit(1);
    }
    //validate json configs content
    let jsonErrors = validateConfigJSON(configFilePath);
    if (jsonErrors.length > 0) {
        errorString += "The config file's content was not valid:\n";
        errorString += jsonErrors;
    }
    //if in sync mode, check date argument
    if (process.argv[2] === "sync" && !Date.parse(process.argv[4])) {
        errorString += "The provided date in the 3rd argument is not valid.\n";
    }
    //If there were errors, concatenate them to the base message and exit
    if (errorString.length > 0) {
        console.error(baseErrorMessage);
        console.error("\nERRORS:\n");
        console.error(errorString);
        process.exit(1);
    }
}
//TODO
function validateConfigJSON(jsonPath) {
    let jsonErrors = "";
    //check if the Json object can be parsed, if not return with the error
    let config;
    try {
        config = JSON.parse(fs.readFileSync(process.argv[3]).toString());
    }
    catch (error) {
        jsonErrors += `JSON file content couldnt be parsed!\n ${JSON.stringify(error, Object.getOwnPropertyNames(error))}\n`;
        return jsonErrors;
    }
    //check sourcefolderPath
    if (!config.sourceFolderPath || !isValidPath(config.sourceFolderPath)) {
        jsonErrors += `Source folder path not provided, or not valid path: ${config.sourceFolderPath}\n`;
    }
    //check mountFolderPath
    if (!config.mountFolderPath || !isValidPath(config.mountFolderPath)) {
        jsonErrors += `Mount folder path not provided, or not valid path: ${config.mountFolderPath}\n`;
    }
    //check timeout
    if (!config.timeout || typeof config.timeout !== "number") {
        jsonErrors += `Timeout not provided or not a number: ${config.mountFolderPath}\n`;
    }
    //check logFolderPath
    if (!config.logFolderPath || !isValidPath(config.logFolderPath)) {
        jsonErrors += `Log folder path not provided, or not valid path: ${config.logFolderPath}\n`;
    }
    //check end of line char
    if (!config.endOfLineChar || typeof config.endOfLineChar !== "string") {
        jsonErrors += `End of Line char not provided, or not string: ${config.endOfLineChar}\n`;
    }
    //check machineId
    if (!config.machineId || typeof config.machineId !== "number") {
        jsonErrors += `MachineId not provided or not a number: ${config.mountFolderPath}\n`;
    }
    //check getLastLogged date url
    if (!config.getLastLogDateURL || !validUrl.isUri(config.getLastLogDateURL)) {
        jsonErrors += `Get last logged date API Url not provided, or not valid url: ${config.getLastLogDateURL}\n`;
    }
    //check post data  url
    if (!config.postDataUrl || !validUrl.isUri(config.postDataUrl)) {
        jsonErrors += `Get last logged date API Url not provided, or not valid url: ${config.postDataUrl}\n`;
    }
    //check offline window start
    if (!config.offlineWindowStart ||
        !config.offlineWindowStart.H === undefined ||
        typeof config.offlineWindowStart.H !== "number" ||
        !config.offlineWindowStart.M === undefined ||
        typeof config.offlineWindowStart.M !== "number") {
        jsonErrors += `Offline window START not provided or format not valid. Required format:{H:number;M:number}. Current value: ${JSON.stringify(config.offlineWindowStart)}\n`;
    }
    //check offline window end
    if (!config.offlineWindowEnd ||
        config.offlineWindowEnd.H === undefined ||
        typeof config.offlineWindowEnd.H !== "number" ||
        !config.offlineWindowEnd.M === undefined ||
        typeof config.offlineWindowEnd.M !== "number") {
        jsonErrors += `Offline window END not provided or format not valid. Required format:{H:number;M:number}. Current value: ${JSON.stringify(config.offlineWindowEnd)}\n`;
    }
    return jsonErrors;
}
//# sourceMappingURL=validations.js.map