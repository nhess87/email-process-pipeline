/**
 * Email processor module - orchestrates email fetching and Foundry processing
 */

const graphClient = require("./graphClient");
const foundryClient = require("./foundryClient");

async function processEmailInBackground(context, queueItem) {
    try {
        const { messageId, sender } = queueItem; 
        context.log("[EMAIL] Starting background processing for messageId:", messageId);
        context.log("[EMAIL] Original sender from queue:", sender);

        // Step 1: Get Graph credential and token
        context.log("[EMAIL] Acquiring Graph credentials...");
        const credential = graphClient.createCredential();
        const token = await graphClient.getGraphToken(credential);
        context.log("[EMAIL] Graph token acquired");

        // Step 2: Fetch email from Graph
        context.log("[EMAIL] Fetching email from Graph...");
        const emailJson = await graphClient.fetchEmailFromGraph(token, messageId);
        context.log("[EMAIL] Email fetched. Subject:", emailJson.subject || "<no-subject>");

        // Extract sender from MIME headers (Exchange rewrites structured sender)
        const headers = emailJson.internetMessageHeaders || [];
        const rawFrom = headers.find(h => h.name.toLowerCase() === "from")?.value || null;
        const fromHeaderEmail = rawFrom?.match(/<([^>]+)>/)?.[1] ?? rawFrom?.trim() ?? null;

        const resolvedSender =
            fromHeaderEmail ||
            emailJson.from?.emailAddress?.address ||
            null;

        context.log("[EMAIL] All headers:", JSON.stringify(headers, null, 2));
        context.log("[EMAIL] internetMessageHeaders From:", rawFrom);
        context.log("[EMAIL] Sender resolved:", resolvedSender);

        // Shared mailbox protections
        const monitoredMailbox = process.env.MONITORED_MAILBOX?.toLowerCase();
        const monitoredAliases = (process.env.MONITORED_ALIASES || "")
            .split(",")
            .map(a => a.trim().toLowerCase())
            .filter(a => a.length > 0);

        const senderLower = resolvedSender?.toLowerCase() || "";

        const isSharedMailbox =
            senderLower === monitoredMailbox ||
            monitoredAliases.includes(senderLower);

        const isSystemSender =
            senderLower.startsWith("microsoftexchange") ||
            senderLower.includes("postmaster") ||
            senderLower.includes("mailer-daemon");

        // Skip system or shared mailbox messages
        if (!resolvedSender || isSharedMailbox || isSystemSender) {
            context.log("[EMAIL] Skipping reply. Reason:",
                !resolvedSender ? "No sender" :
                isSharedMailbox ? "Sender is shared mailbox" :
                "System sender"
            );
            return;
        }

        // Step 3: Extract and clean email body
        context.log("[EMAIL] Extracting and cleaning email body...");
        const emailBody = graphClient.extractEmailBody(emailJson);
        context.log("[EMAIL] Email body cleaned, length:", emailBody.length);

        // Step 4 & 5: Call Foundry agent
        context.log("[EMAIL] Calling Foundry agent...");
        const agentResponse = await foundryClient.callWorkflow(emailBody);
        context.log("[EMAIL] Foundry agent processing complete. Response length:", agentResponse.length);

        // Step 6: Reply to the user
        context.log("[EMAIL] Replying to user...");
        context.log("[EMAIL] SENDER_UPN:", process.env.SENDER_UPN, "| to:", resolvedSender);

        await graphClient.sendReply(token, messageId, agentResponse, resolvedSender);

        context.log("[EMAIL] Reply sent successfully to:", resolvedSender);
        context.log("[EMAIL] Background processing completed successfully");

        return agentResponse;

    } catch (err) {
        context.log.error("[EMAIL] Background processing failed:", err?.message || err);
        context.log.error("[EMAIL] Stack:", err?.stack || "<no-stack>");
    }
}

module.exports = {
    processEmailInBackground
};