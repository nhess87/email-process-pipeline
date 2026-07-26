/**
 * Azure Function: HTTP Trigger for Microsoft Graph email notifications
 *
 * Responsibilities:
 * 1. Validate Graph webhook tokens
 * 2. Accept email notifications
 * 3. Respond immediately to Graph (<5s)
 * 4. Queue deduplicated notifications for async processing
 */

const validation = require("./validation");

// Simple in-memory deduplication cache
const recentMessages = new Set();

function isDuplicate(messageId) {
    if (recentMessages.has(messageId)) {
        return true;
    }

    recentMessages.add(messageId);
    setTimeout(() => recentMessages.delete(messageId), 60000);
    return false;
}

module.exports = async function (context, req) {
    try {
        context.log("[WEBHOOK] Function triggered");

        if (req.query.validationToken) {
            context.log("Validation token received");
            context.res = {
                status: 200,
                headers: { "Content-Type": "text/plain" },
                body: req.query.validationToken
            };
            return;
        }

        if (!req.body || !req.body.value) {
            context.log("[WEBHOOK] Ignoring non-Graph request");
            return { status: 200 };
        }

        if (req.method !== "POST") {
            context.log("[WEBHOOK] Ignoring non-POST request");
            context.res = { status: 200 };
            return;
        }
        if (!req.headers["validation-token"] && (!req.body || !req.body.value)) {
            context.log("[WEBHOOK] Ignoring non-Graph POST");
            context.res = { status: 200 };
            return;
        }


        // Step 1: Graph validation token
        const validationToken = validation.getValidationToken(req);
        if (validationToken) {
            context.log("[WEBHOOK] Validation token received");
            context.res = validation.buildValidationResponse(validationToken);
            return;
        }

        // Step 2: Validate all notifications in the envelope
        context.log("[WEBHOOK] Validating notifications...");
        const validNotifications = validation.getValidNotifications(req.body);

        if (validNotifications.length === 0) {
            context.log("[WEBHOOK] No valid notification found");
            context.res = { status: 202, body: "Accepted" };
            return;
        }

        // Step 3: Deduplicate and queue valid items
        const queueItems = [];

        for (const notification of validNotifications) {
            const messageId = notification.messageId;

            if (isDuplicate(messageId)) {
                context.log("[WEBHOOK] Duplicate messageId detected, skipping:", messageId);
                continue;
            }


            //  Extract original sender BEFORE Exchange rewrites it
            const sender =
                notification.resourceData?.from?.emailAddress?.address ||
                notification.resourceData?.sender?.emailAddress?.address ||
                notification.resourceData?.replyTo?.[0]?.emailAddress?.address ||
                null;

            context.log("[WEBHOOK] Extracted original sender:", sender);

            queueItems.push({
                messageId,
                sender, 
                timestamp: new Date().toISOString()
            });
        }

        if (queueItems.length === 0) {
            context.log("[WEBHOOK] No new messages to queue after deduplication");
            context.res = { status: 202, body: "Accepted" };
            return;
        }

        // Step 4: Queue all valid items
        // If your queue binding does not support arrays, switch to a queue collector/client.
        context.bindings.outputQueueItem = queueItems;

        context.log(`[WEBHOOK] Queued ${queueItems.length} message(s) for processing`);
        context.res = { status: 202, body: "Accepted" };

    } catch (err) {
        context.log.error("[WEBHOOK] Unhandled error:", err?.message || err);
        context.log.error("[WEBHOOK] Stack:", err?.stack || "<no-stack>");

        context.res = {
            status: 500,
            body: err?.message || "Internal error"
        };
    }
};