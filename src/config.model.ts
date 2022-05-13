//type of the config file data
export type AquaLoggerConfig = {
  sourceFolderPath: string; //path to the source folder
  mountFolderPath: string; //used on linux systems, on windwos it can be empty
  timeout: number;
  logFolderPath: string;
  endOfLineChar: string;
  machineId: number;
  getLastLogDateURL: string;
  postDataUrl: string;
  offlineWindowStart: { H: number; M: number };
  offlineWindowEnd: { H: number; M: number };
};
