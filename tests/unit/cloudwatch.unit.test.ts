import { CW } from "../../src/cloudwatch";
import { CloudWatch } from "aws-sdk";

describe("The CloudWatch class", () => {
  const cw = new CW();
  jest.mock("aws-sdk/clients/cloudwatch");
  const mockFn = jest.fn().mockImplementation(() => ({ promise: () => ({}) }));
  CloudWatch.prototype.putMetricData = mockFn;
  process.env.BRANCH = "local";

  it("should send visit metrics", async () => {
    const [visitsToday, oldVisits, openVisits] = [42, 0, 5];
    expect.assertions(2)
    await expect(cw.sendVisits(visitsToday, oldVisits, openVisits)).resolves.toBe(`visits: ${visitsToday}, oldVisits: ${oldVisits}, openVisits: ${openVisits}`);
    expect(mockFn).toHaveBeenCalled();
  });

  it("should send timeout metrics", async () => {
    expect.assertions(2)
    await expect(cw.sendTimeouts("testGroup", [{ id: "asdf", timestamp: 0, message: "[ERROR] Task timed out" }])).resolves.toBe("testGroup: 1");
    expect(mockFn).toHaveBeenCalled();
  });

  it("should send timeout metrics even when none returned", async () => {
    expect.assertions(2)
    await expect(cw.sendTimeouts("testGroup", [{ id: "asdf", timestamp: 0, message: "[ERROR] Fatal error" }])).resolves.toBe("testGroup: 0");
    expect(mockFn).toHaveBeenCalled();
  });
});
