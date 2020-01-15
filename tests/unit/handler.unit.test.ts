import { handler } from "../../src/handler";
import { CloudWatchLogsDecodedData } from "aws-lambda";
import { gzip } from "node-gzip";
import { Dynamo } from "../../src/dynamodb";
import { CW } from "../../src/cloudwatch";
import mockContext = require("aws-lambda-mock-context");


const event: CloudWatchLogsDecodedData = {
  messageType: "DATA_MESSAGE",
  owner: "123456789123",
  logGroup: "testLogGroup",
  logStream: "testLogStream",
  subscriptionFilters: ["testFilter"],
  logEvents: [
    { id: "eventId1", timestamp: 1440442987000, message: "[ERROR] First test message" },
    { id: "eventId2", timestamp: 1440442987001, message: "[ERROR] Second test message" }
  ]
};

async function encodeEvent(ev: CloudWatchLogsDecodedData) {
  return (await gzip(JSON.stringify(ev))).toString("base64");
}

const getVisitsMock = jest.fn().mockImplementation(() => 0);
const getOldVisitsMock = jest.fn().mockImplementation(() => 0);
const getOpenVisitsMock = jest.fn().mockImplementation(() => 0);
const sendVisitsMock = jest.fn().mockImplementation(() => "visits: 0, oldVisits: 0");
let sendTimeoutsMock = jest.fn().mockImplementation(() => "testLogGroup: 0");

describe("The lambda handler", () => {
  process.env.BRANCH = "local";
  const ctx = mockContext();
  Dynamo.prototype.getVisits = getVisitsMock;
  Dynamo.prototype.getOldVisits = getOldVisitsMock;
  Dynamo.prototype.getOpenVisits = getOpenVisitsMock;
  CW.prototype.sendVisits = sendVisitsMock;
  CW.prototype.sendTimeouts = sendTimeoutsMock;

  describe("with a valid event", () => {
    it("should handle the incoming event", async () => {
      await handler({ awslogs: { data: await encodeEvent(event) } }, ctx, () => void 0);
      expect(getVisitsMock).not.toHaveBeenCalled();
      expect(getOldVisitsMock).not.toHaveBeenCalled();
      expect(getOpenVisitsMock).not.toHaveBeenCalled();
      expect(sendTimeoutsMock).toHaveBeenCalledWith(event.logGroup, event.logEvents);
    });
  });
  describe("when it is handling the activities logs", () => {
    const act: CloudWatchLogsDecodedData = { ...event };
    act.logGroup = "/aws/lambda/activities-develop";
    sendTimeoutsMock = jest.fn().mockImplementation(() => "/aws/lambda/activities-develop: 0");
    CW.prototype.sendTimeouts = sendTimeoutsMock;
    it("should retrieve the visit stats", async () => {
      await handler({ awslogs: { data: await encodeEvent(act) } }, ctx, () => void 0);
      expect(getVisitsMock).toHaveBeenCalled();
      expect(getOldVisitsMock).toHaveBeenCalled();
      expect(getOpenVisitsMock).toHaveBeenCalled();
      expect(sendTimeoutsMock).toHaveBeenCalledWith(act.logGroup, act.logEvents);
    });
  });
});

