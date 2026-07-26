/**
 * Azure Function: Queue Trigger for email processing
 * 
 * This runs AFTER webhook returns 202
 */

const emailProcessor = require("../EmailProcess/emailProcessor");
module.exports = async function (context, queueItem) {
    try {
        context.log("[QUEUE] Processing queued message:", queueItem.messageId);

        // Run the full email processing pipeline
        await emailProcessor.processEmailInBackground(context, queueItem);

        context.log("[QUEUE] Message processed successfully");

    } catch (err) {
        context.log.error("[QUEUE] Queue processing failed:", err?.message || err);
        context.log.error("[QUEUE] Stack:", err?.stack || "<no-stack>");
        
        throw err;
    }
};
