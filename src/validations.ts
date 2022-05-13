import fs from "fs";
import isValidPath from "is-valid-path";

//validate the arguments:
//TODO rework, starts to become too complex, should check gurads, checks executed in order
let config = {};
export function validateArguments(armguments: any) {
  if (process.argv[2] === "watch") {
    if (
      process.argv.length === 4 &&
      fs.existsSync(process.argv[3]) &&
      process.argv[3].split(".")[process.argv[3].split(".").length - 1] ===
        "json"
    ) {
      let configArgumentValue = JSON.parse(
        fs.readFileSync(process.argv[3]).toString()
      );
      if (validateConfigJSON(configArgumentValue)) {
        config = JSON.parse(fs.readFileSync(process.argv[3]).toString());
      } else {
        console.log("The given config files format or content, was not valid!");
        process.exit(1);
      }
    } else {
      console.log(
        `To watch a file provide a valid JSON file with configuration data.\n
          1. WATCH|args: watch <config_file_absolute_path> - Watches the log file of todayday, and sends data tot the server.\n
          `
      );
      process.exit(1);
    }
  } else if (process.argv[2] === "sync") {
    if (
      process.argv.length === 5 &&
      fs.existsSync(process.argv[3]) &&
      process.argv[3].split(".")[process.argv[3].split(".").length - 1] ===
        "json" &&
      Date.parse(process.argv[4])
    ) {
      let configArgumentValue = JSON.parse(
        fs.readFileSync(process.argv[3]).toString()
      );
      if (validateConfigJSON(configArgumentValue)) {
        config = JSON.parse(fs.readFileSync(process.argv[3]).toString());
      } else {
        console.log("The given config files format or content, was not valid!");
        process.exit(1);
      }
    } else {
      console.log(
        `To sync a file provide a valid JSON file with configuration data and a valid date to sync.\n
          2. SYNC|args: sync <config_file_absolute_path> <syncable_date_as_string> - Syncs the log file of the day given as parameter. \n
          `
      );
      process.exit(1);
    }
  } else {
    console.log(`This program has 2 operation modes:\n
      1. WATCH|args: watch <config_file_absolute_path> - Watches the log file of todayday, and sends data tot the server.\n
      2. SYNC|args: sync <config_file_absolute_path> <syncable_date_as_string> - Syncs the log file of the day given as parameter. \n
      Please provide the valid arguments for one of them.\n
      For more info see the readme file.\n`);
    process.exit(1);
  }
}

//TODO
function validateConfigJSON(configObject: any): Boolean {
  return true;
}
