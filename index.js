var isValidPath = require("is-valid-path");
var ping = require("ping");
const fs = require("fs");

const timeoutS = 20;

//arguments guard
var arguments = process.argv;
if (arguments.length !== 4) {
  console.log(
    "Please provide the IP and Log directory path as arguments.\nExample:\nnpm start 192.168.0.118 C\\Data\\Log"
  );
  process.exit();
}

//ip format guard
if (!validateIPaddress(arguments[2])) {
  console.log(arguments[2] + " is not a valid IP Address.");
  process.exit();
}

//filepath format guard
if (!isValidPath(arguments[3])) {
  console.log(arguments[3] + " is not a valid file system path.");
  process.exit();
}

//main loop

//functions
async function main() {
  while (true) {
    //try to establish connection
    let hostAvaialble = false;
    console.log("Trying to reach host: " + process.argv[2]);
    let response = await ping.promise.probe(process.argv[2]);
    if (response.alive) {
      console.log("Host reached!");
      hostAvaialble = true;
    } else {
      console.log(
        "Host is unreachable...Trying again in " + timeoutS + " seconds."
      );
      await sleep(timeoutS * 1000);
      continue;
    }

    //trying to reach folder
    let folderExists = false;
    console.log(
      "Trying to reach destination folder: " +
        process.argv[2] +
        "\\" +
        process.argv[3]
    );
    if (fs.existsSync("\\\\" + process.argv[2] + "\\" + process.argv[3])) {
      folderExists = true;
      console.log("Target folder found!");
    } else {
      console.log("Target folder not found, trying again in 10 seconds...");
      await sleep(timeoutS * 1000);
      continue;
    }

    process.exit();
  }
  //try to
}

//helper functions
function validateIPaddress(ipaddress) {
  if (
    /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(
      ipaddress
    )
  ) {
    return true;
  }
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

//execute program
main();
