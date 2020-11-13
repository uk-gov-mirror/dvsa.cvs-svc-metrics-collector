import { handler } from "../../src/handler";
import { CloudWatchLogsDecodedData, Context, FirehoseTransformationEvent } from "aws-lambda";
import { Dynamo } from "../../src/dynamodb";
import { CW } from "../../src/cloudwatch";
import { gzip } from "node-gzip";

const mockContext: Context = {
  awsRequestId: "",
  callbackWaitsForEmptyEventLoop: false,
  clientContext: undefined,
  functionName: "",
  functionVersion: "",
  identity: undefined,
  invokedFunctionArn: "",
  logGroupName: "",
  logStreamName: "",
  memoryLimitInMB: "",
  done: () => {
    return;
  },
  fail: () => {
    return;
  },
  getRemainingTimeInMillis: () => 0,
  succeed: () => {
    return;
  },
};

const FHEvent: FirehoseTransformationEvent = {
  deliveryStreamArn: "",
  invocationId: "",
  region: "",
  records: [
    {
      recordId: "",
      approximateArrivalTimestamp: 0,
      data: "",
    },
  ],
};

const logs: CloudWatchLogsDecodedData = {
  messageType: "DATA_MESSAGE",
  owner: "123456789123",
  logGroup: "testLogGroup",
  logStream: "testLogStream",
  subscriptionFilters: ["testFilter"],
  logEvents: [
    { id: "eventId1", timestamp: 1440442987000, message: "[ERROR] First test message" },
    { id: "eventId2", timestamp: 1440442987001, message: "[ERROR] Second test message" },
  ],
};

/**
 * Encodes the test event as if it was from Firehose
 *
 * @param {CloudWatchLogsDecodedData} ev The log data to be encoded
 * @returns {string} The encoded log data
 */
async function encodeEvent(ev: CloudWatchLogsDecodedData): Promise<string> {
  return (await gzip(JSON.stringify(ev))).toString("base64");
}

const getVisitsMock = jest.fn().mockImplementation(() => Promise.resolve(0));
const getOldVisitsMock = jest.fn().mockImplementation(() => Promise.resolve(0));
const getOpenVisitsMock = jest.fn().mockImplementation(() => Promise.resolve(0));
const sendVisitsMock = jest.fn().mockImplementation(() => Promise.resolve([0, 0, 0]));
const sendTimeoutsMock = jest.fn().mockImplementation(() => Promise.resolve(0));
const failTimeoutsMock = jest.fn().mockImplementation(() => Promise.reject("This is a fake error"));

describe("The lambda handler", () => {
  process.env.BRANCH = "local";
  Dynamo.prototype.getVisits = getVisitsMock;
  Dynamo.prototype.getOldVisits = getOldVisitsMock;
  Dynamo.prototype.getOpenVisits = getOpenVisitsMock;
  CW.prototype.sendVisits = sendVisitsMock;
  CW.prototype.sendTimeouts = sendTimeoutsMock;

  describe("with a valid event", () => {
    it("should handle the incoming event", async () => {
      const ev = { ...FHEvent };
      ev.records[0].data = await encodeEvent(logs);
      await handler(ev, mockContext);
      expect(getVisitsMock).not.toHaveBeenCalled();
      expect(getOldVisitsMock).not.toHaveBeenCalled();
      expect(getOpenVisitsMock).not.toHaveBeenCalled();
      expect(sendTimeoutsMock).toHaveBeenCalledWith(logs.logGroup, logs.logEvents, undefined);
    });
    it("when a function fails it should return the data with ProcessingFailed", async () => {
      CW.prototype.sendTimeouts = failTimeoutsMock;
      expect.assertions(2);
      const ev = { ...FHEvent };
      ev.records[0].data = await encodeEvent(logs);
      const resp = await handler(ev, mockContext);
      await expect(failTimeoutsMock).rejects.toStrictEqual("This is a fake error");
      expect(resp.records[0].result).toEqual("ProcessingFailed");
      CW.prototype.sendTimeouts = sendTimeoutsMock;
    });
    it("when handling the activities logs it should retrieve the visit stats", async () => {
      const activitiesMock = jest.fn().mockImplementation(() => "/aws/lambda/activities-develop: 0");
      CW.prototype.sendTimeouts = activitiesMock;
      const ev = { ...FHEvent };
      const actLogs = { ...logs };
      actLogs.logGroup = "/aws/lambda/activities-develop";
      ev.records[0].data = await encodeEvent(actLogs);
      await handler(ev, mockContext);
      expect(activitiesMock).toHaveBeenCalledWith(actLogs.logGroup, actLogs.logEvents, undefined);
    });
  });
});
