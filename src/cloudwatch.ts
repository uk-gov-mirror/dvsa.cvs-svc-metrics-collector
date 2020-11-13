import CloudWatch, { ClientConfiguration as cwConfig, PutMetricDataInput } from "aws-sdk/clients/cloudwatch";
import { DateTime } from "luxon";
// eslint-disable-next-line import/no-extraneous-dependencies
import { CloudWatchLogsLogEvent } from "aws-lambda";
import AWSXRay, { Subsegment } from "aws-xray-sdk";
import { Logger } from "tslog";
import RE2 = require("re2");

export class CW {
  private readonly config: cwConfig = { region: "eu-west-1", retryDelayOptions: { base: 500 } };

  private readonly branch: string = (process.env.BRANCH ?? "local").toLocaleLowerCase();

  private readonly now: DateTime = DateTime.utc();

  private logger: Logger;

  constructor(handlerLogger: Logger) {
    this.logger = handlerLogger.getChildLogger({ name: "Cloudwatch" });
  }

  /**
   * Pushes the visit metrics to CloudWatch.
   *
   * @public
   * @async
   * @param {number} visitsToday Number of visits since 00:00 UTC today.
   * @param {number} oldVisits Number of visits since now UTC-10 hours.
   * @param {number} openVisits Amount of open visits right now.
   * @param {Subsegment} parentSubSeg The parent AWS X-Ray subsegment
   * @returns {[number, number, number]} Tuple of the visit stats.
   */
  public async sendVisits(visitsToday: Promise<number>, oldVisits: Promise<number>, openVisits: Promise<number>, parentSubSeg?: Subsegment): Promise<[number, number, number]> {
    let sendVisitsSS: Subsegment | undefined;
    if (parentSubSeg) {
      sendVisitsSS = parentSubSeg.addNewSubsegment("sendVisits");
    }
    const client = AWSXRay.captureAWSClient(new CloudWatch(this.config));
    const timestamp: Date = this.now.toJSDate();
    const [today, old, open] = await Promise.all([visitsToday, oldVisits, openVisits]);
    const params: PutMetricDataInput = {
      Namespace: "CVS",
      MetricData: [
        {
          MetricName: "VisitsToday",
          Dimensions: [
            {
              Name: "Environment",
              Value: this.branch,
            },
          ],
          Timestamp: timestamp,
          Value: today,
          Unit: "Count",
        },
        {
          MetricName: "OldVisits",
          Dimensions: [
            {
              Name: "Environment",
              Value: this.branch,
            },
          ],
          Timestamp: timestamp,
          Value: old,
          Unit: "Count",
        },
        {
          MetricName: "OpenVisits",
          Dimensions: [
            {
              Name: "Environment",
              Value: this.branch,
            },
          ],
          Timestamp: timestamp,
          Value: open,
          Unit: "Count",
        },
      ],
    };
    if (sendVisitsSS) {
      sendVisitsSS.addMetadata("metricsParams", params);
    }
    await client.putMetricData(params).promise();
    this.logger.info(`visits: ${today}, oldVisits: ${old}, openVisits: ${open}`);
    if (sendVisitsSS) {
      sendVisitsSS.close();
    }
    return [today, old, open];
  }

  /**
   * Pushes Timeout metrics to CloudWatch
   *
   * @public
   * @async
   * @param {string} logGroup The service to be measured
   * @param {CloudWatchLogsLogEvent[]} logEvents An array of logs to check
   * @param {Subsegment} parentSubSeg The parent AWS X-Ray subsegment
   * @returns {number} The timeout count of the log event
   */
  public async sendTimeouts(logGroup: string, logEvents: CloudWatchLogsLogEvent[], parentSubSeg?: Subsegment): Promise<number> {
    let sendTimeoutsSS: Subsegment | undefined;
    if (parentSubSeg) {
      sendTimeoutsSS = parentSubSeg.addNewSubsegment("sendTimeouts");
    }
    const client = AWSXRay.captureAWSClient(new CloudWatch(this.config));
    const timestamp: Date = this.now.toJSDate();
    let timeoutCount = 0;
    const timeOutRegex = new RE2(".*Task timed out.*");
    logEvents.forEach((logEvent) => {
      if (timeOutRegex.test(logEvent.message)) {
        timeoutCount += 1;
      }
    });
    const params: PutMetricDataInput = {
      Namespace: "CVS",
      MetricData: [
        {
          MetricName: "Timeouts",
          Dimensions: [
            {
              Name: "Environment",
              Value: this.branch,
            },
            {
              Name: "Service",
              Value: logGroup,
            },
          ],
          Timestamp: timestamp,
          Value: timeoutCount,
          Unit: "Count",
        },
      ],
    };
    if (sendTimeoutsSS) {
      sendTimeoutsSS.addMetadata("metricsParams", params);
    }
    await client.putMetricData(params).promise();
    this.logger.info(`${logGroup}: ${timeoutCount}`);
    if (sendTimeoutsSS) {
      sendTimeoutsSS.close();
    }
    return timeoutCount;
  }
}
