import { CloudWatchLogsDecodedData, Context, FirehoseTransformationEvent, FirehoseTransformationResult } from "aws-lambda";
import { Logger } from "tslog";
import { ungzip } from "node-gzip";
import AWSXRay from "aws-xray-sdk";
import RE2 from "re2";
import { Dynamo } from "./dynamodb";
import { CW } from "./cloudwatch";

export const logger = new Logger({ name: "Handler", minLevel: "warn" });

/**
 * Decodes the base64 event data and decompresses it.
 *
 * @param {string} data Base64 encoded data from firehose
 * @returns {CloudWatchLogsDecodedData} The decoded data
 */
async function decodeEventData(data: string): Promise<CloudWatchLogsDecodedData> {
  const unzipped = (await ungzip(Buffer.from(data, "base64"))).toString();
  logger.info(unzipped);
  return JSON.parse(unzipped) as CloudWatchLogsDecodedData;
}

/**
 * The lambda handler for metrics collector, no transformation of the data happens as this only generates metrics.
 *
 * @param {FirehoseTransformationEvent} event The expected event from Firehose
 * @param {Context | undefined} context The context of the running lambda
 * @returns {FirehoseTransformationResult} The result to return to Firehose after processing.
 */
export const handler = async (event: FirehoseTransformationEvent, context: Context): Promise<FirehoseTransformationResult> => {
  try {
    const decodeSS = AWSXRay.getSegment()?.addNewSubsegment("decodeEvent");
    logger.info(`context: ${JSON.stringify(context)}`);
    const logs: CloudWatchLogsDecodedData[] = await Promise.all(event.records.map((record) => decodeEventData(record.data)));
    decodeSS?.addMetadata("decodedEvent", logs);
    decodeSS?.close();
    const cw = new CW(logger);
    const promises: Promise<number | [number, number, number]>[] = [];
    const activityPattern = new RE2(/\/aws\/lambda\/activities-[\w-]+/);
    const sendMetricsSS = AWSXRay.getSegment()?.addNewSubsegment("sendMetrics");
    // Prevent activities metrics being sent more than once.
    let activitiesSent = false;
    logs.forEach((log) => {
      if (!activitiesSent && activityPattern.test(log.logGroup)) {
        const visitsSS = AWSXRay.getSegment()?.addNewSubsegment("getVisits");
        const dynamo = new Dynamo(logger);
        promises.push(cw.sendVisits(dynamo.getVisits(visitsSS), dynamo.getOldVisits(visitsSS), dynamo.getOpenVisits(visitsSS), sendMetricsSS));
        activitiesSent = true;
        visitsSS?.close();
      }
      promises.push(cw.sendTimeouts(log.logGroup, log.logEvents, sendMetricsSS));
    });
    await Promise.all(promises);
    sendMetricsSS?.close();
    return {
      records: event.records.map((record) => ({
        recordId: record.recordId,
        result: "Ok",
        data: record.data,
      })),
    } as FirehoseTransformationResult;
  } catch (e) {
    logger.error("Handler error:", e);
    logger.info(JSON.stringify(event));
    AWSXRay.getSegment()?.addError(e);
    return {
      records: event.records.map((record) => ({
        recordId: record.recordId,
        result: "ProcessingFailed",
        data: record.data,
      })),
    } as FirehoseTransformationResult;
  }
};
