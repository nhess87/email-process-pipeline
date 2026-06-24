/**
 * Email processor module - orchestrates email fetching and Foundry processing
 */

const graphClient = require("./graphClient");
//const foundryClient = require("./foundryClient");

/**
 * Process email in background: fetch from Graph, send to Foundry
 * @param {Object} context - Azure Function context
 * @param {string} messageId - Message ID to process
 */
async function processEmailInBackground(context, messageId) {
    try {
        context.log("[EMAIL] Starting background processing for messageId:", messageId);

        // Step 1: Get Graph credential and token
        context.log("[EMAIL] Acquiring Graph credentials...");
        const credential = graphClient.createCredential();
        const token = await graphClient.getGraphToken(credential);
        context.log("[EMAIL] Graph token acquired");

        // Step 2: Fetch email from Graph
        context.log("[EMAIL] Fetching email from Graph...");
        const emailJson = await graphClient.fetchEmailFromGraph(token, messageId);
        context.log("[EMAIL] Email fetched. Subject:", emailJson.subject || "<no-subject>");

        // Step 3: Extract and clean email body
        context.log("[EMAIL] Extracting and cleaning email body...");
        const emailBody = graphClient.extractEmailBody(emailJson);
        context.log("[EMAIL] Email body cleaned, length:", emailBody.length);

        // Step 4 & 5: Call Foundry agent
        context.log("[EMAIL] Calling Foundry agent...");
        //const agentResponse = await foundryClient.callWorkflow(emailBody);
        const agentResponse = "hardcoded_value for the test";
        context.log("[EMAIL] Foundry agent processing complete. Response length:", agentResponse.length);
        context.log("[EMAIL] Agent response:", agentResponse);
        // NEW Step 6: Reply to the user
        context.log("[EMAIL] Replying to user...");
        const sender = emailJson.from?.emailAddress?.address;
        const monitoredMailbox = process.env.MONITORED_MAILBOX?.toLowerCase();
        if (!sender) {
            context.log("[EMAIL] No sender found in email, skipping reply");
        } else if (sender.toLowerCase() === monitoredMailbox) {
            context.log("[EMAIL] Sender is the monitored mailbox, skipping reply to avoid loop");
        } else {
            context.log("[EMAIL] SENDER_UPN:", process.env.SENDER_UPN, "| to:", sender, "| content length:", agentResponse?.length);
            await graphClient.sendReply(token, messageId, agentResponse, sender);
            context.log("[EMAIL] Reply sent successfully to:", sender);
        }

        context.log("[EMAIL] Background processing completed successfully");
        return agentResponse;

    } catch (err) {
        context.log.error("[EMAIL] Background processing failed:", err?.message || err);
        context.log.error("[EMAIL] Stack:", err?.stack || "<no-stack>");
        // Don't re-throw - background processing should fail gracefully
    }
}

module.exports = {
    processEmailInBackground
};
