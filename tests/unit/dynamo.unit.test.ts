import { Dynamo } from "../../src/dynamodb";
import { ScanInput } from "aws-sdk/clients/dynamodb";
import { DynamoDB } from "aws-sdk";

describe("The dynamodb class", () => {
  const ddb = new Dynamo();
  jest.mock("aws-sdk/clients/dynamodb");
  let mockFn = jest.fn().mockImplementation(() => ({ promise: () => Promise.resolve({ Count: 1 }) }));
  DynamoDB.prototype.scan = mockFn;
  process.env.BRANCH = "local";
  it("should scan a dynamodb table", async () => {
    const input: ScanInput = { TableName: "testTable" };
    const res = await ddb.scanCount(input);
    expect(res).toBe(4);
    expect(mockFn.mock.calls.length).toBe(4);
  });
  it("should return with 0, if ScanOutput.Count is undefined", async () => {
    mockFn = jest.fn().mockImplementation(() => ({ promise: () => Promise.resolve({ Count: undefined }) }));
    DynamoDB.prototype.scan = mockFn;
    const input: ScanInput = { TableName: "testTable" };
    const res = await ddb.scanCount(input);
    expect(res).toBe(0);
    expect(mockFn.mock.calls.length).toBe(4);
  });
  it("should return a count of the total visits for the day", async () => {
    mockFn = jest.fn().mockImplementation(() => 1);
    Dynamo.prototype.scanCount = mockFn;
    const res = await ddb.getVisits();
    expect(res).toBe(1);
    expect(mockFn.mock.calls.length).toBe(1);
  });
  it("should return a count of old visits for the day", async () => {
    mockFn = jest.fn().mockImplementation(() => 1);
    Dynamo.prototype.scanCount = mockFn;
    const res = await ddb.getOldVisits();
    expect(res).toBe(1);
    expect(mockFn.mock.calls.length).toBe(1);
  });
  it("should return a count of open visits", async () => {
    mockFn = jest.fn().mockImplementation(() => 1);
    Dynamo.prototype.scanCount = mockFn;
    const res = await ddb.getOpenVisits();
    expect(res).toBe(1);
    expect(mockFn.mock.calls.length).toBe(1);
  });
})
;
