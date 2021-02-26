import { CloudWatch } from "aws-sdk";
import { Logger } from "tslog";
import { CW } from "../../src/cloudwatch";

describe("The CloudWatch class", () => {
  const cw = new CW(new Logger({ name: "cloudwatchUnit" }));
  jest.mock("aws-sdk/clients/cloudwatch");
  const mockFn = jest.fn().mockImplementation(() => ({
    promise: () => {
      return;
    },
  }));
  CloudWatch.prototype.putMetricData = mockFn;
  process.env.BRANCH = "local";

  it("should send visit metrics and return resolved visit values", async () => {
    expect.assertions(2);
    const visitsTodayMock = Promise.resolve(42);
    const oldVisitsMock = Promise.resolve(0);
    const openVisitsMock = Promise.resolve(5);
    await expect(cw.sendVisits(visitsTodayMock, oldVisitsMock, openVisitsMock)).resolves.toStrictEqual([42, 0, 5]);
    expect(mockFn).toHaveBeenCalled();
  }, 30000);

  it("should send timeout metrics", async () => {
    expect.assertions(2);
    await expect(cw.sendTimeouts("testGroup", [{ id: "asdf", timestamp: 0, message: "[ERROR] Task timed out" }])).resolves.toBe(1);
    expect(mockFn).toHaveBeenCalled();
  });

  it("should send timeout metrics even when none returned", async () => {
    expect.assertions(2);
    await expect(cw.sendTimeouts("testGroup", [{ id: "asdf", timestamp: 0, message: "[ERROR] Fatal error" }])).resolves.toBe(0);
    expect(mockFn).toHaveBeenCalled();
  });
});
