/**
 * Azure Function: HTTP Trigger for Microsoft Graph email notifications
 * 
 * Responsibilities:
 * 1. Validate Graph webhook tokens
 * 2. Accept email notifications
 * 3. Respond immediately to Graph (webhook requirement: <5s)
 * 4. Queue notification for async processing
 */

const validation = require("./validation");

module.exports = async function (context, req) {
    try {
        context.log("[WEBHOOK] Function triggered");

        // Step 1: Check for Graph validation token
        const validationToken = validation.getValidationToken(req);
        if (validationToken) {
            context.log("[WEBHOOK] Validation token received");
            context.res = validation.buildValidationResponse(validationToken);
            return;
        }

        // Step 2: Validate incoming notification
        context.log("[WEBHOOK] Validating notification...");
        const notification = validation.validateNotification(req.body);
        if (!notification) {
            context.log("[WEBHOOK] No valid notification found");
            context.res = { status: 202, body: "Accepted" };
            return;
        }

        // Step 2.1: Only process "created" notifications
        if (notification.changeType && notification.changeType.toLowerCase() !== "created") {
            context.log(
                "[WEBHOOK] Ignoring non-created notification. changeType:",
                notification.changeType
            );
            context.res = { status: 202, body: "Accepted" };
            return;
        }

        // Step 3: Extract and validate messageId
        const messageId = validation.extractMessageId(notification);
        if (!messageId) {
            context.log("[WEBHOOK] No messageId in notification, skipping");
            context.res = { status: 202, body: "Accepted" };
            return;
        }

        // Step 3.1: Deduplicate by messageId within a short window
        if (isDuplicate(messageId)) {
            context.log("[WEBHOOK] Duplicate messageId detected, skipping:", messageId);
            context.res = { status: 202, body: "Accepted" };
            return;
        }

        context.log("[WEBHOOK] Valid notification received for messageId:", messageId);

        // Step 4: Queue the message for background processing
        // Use context.bindings to access the queue output binding
        context.bindings.outputQueueItem = {
            messageId: messageId,
            timestamp: new Date().toISOString()
        };
        context.log("[WEBHOOK] Message queued for processing");

        //  Return immediately (Graph expects <5s)
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

// Simple in-memory deduplication cache
const recentMessages = new Set();

function isDuplicate(messageId) {
    if (recentMessages.has(messageId)) {
        return true;
    }

    // Add to cache with 60-second TTL
    recentMessages.add(messageId);
    setTimeout(() => recentMessages.delete(messageId), 60000);

    return false;
}
