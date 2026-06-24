/**
 * Graph API client module - handles Microsoft Graph interactions
 */
const { ClientSecretCredential } = require("@azure/identity");
const { htmlToText } = require("html-to-text");

/**
 * Initialize Graph credential
 * @returns {ClientSecretCredential}
 */
function createCredential() {
    const tenantId = process.env.GRAPH_TENANT_ID;
    const clientId = process.env.GRAPH_CLIENT_ID;
    const clientSecret = process.env.GRAPH_CLIENT_SECRET;

    if (!tenantId || !clientId || !clientSecret) {
        throw new Error("Missing Graph credentials: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, or GRAPH_CLIENT_SECRET");
    }

    return new ClientSecretCredential(tenantId, clientId, clientSecret);
}

/**
 * Acquire Graph API token
 * @param {ClientSecretCredential} credential
 * @returns {Promise<string>} Bearer token
 */
async function getGraphToken(credential) {
    const tokenResponse = await credential.getToken("https://graph.microsoft.com/.default");
    if (!tokenResponse || !tokenResponse.token) {
        throw new Error("Failed to acquire Graph token");
    }
    return tokenResponse.token;
}

/**
 * Fetch email from Microsoft Graph
 * @param {string} token - Graph API token
 * @param {string} messageId - Message ID to fetch
 * @returns {Promise<Object>} Email object with subject and body
 */
async function fetchEmailFromGraph(token, messageId) {
    const mailbox = process.env.MONITORED_MAILBOX;
    if (!mailbox) {
        throw new Error("Missing MONITORED_MAILBOX environment variable");
    }

    const url = `https://graph.microsoft.com/v1.0/users/${mailbox}/messages/${messageId}?$select=subject,body,from`;
    
    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Graph API failed: ${response.status} - ${text}`);
    }

    let emailJson;
    try {
        emailJson = await response.json();
    } catch (err) {
        throw new Error(`Failed to parse Graph response: ${err.message}`);
    }

    return emailJson;
}

/**
 * Extract and clean email body from Graph response
 * @param {Object} emailJson - Email object from Graph
 * @returns {string} Cleaned email body
 */
function extractEmailBody(emailJson) {
    let emailBody = emailJson.body?.content || "";

    if (emailBody && emailBody.trim().length > 0) {
        try {
            emailBody = htmlToText(emailBody, { wordwrap: 130 });
        } catch (err) {
            // If HTML parsing fails, use raw content
        }
    }

    if (!emailBody || emailBody.trim().length === 0) {
        const subject = emailJson.subject || "No subject available";
        emailBody = `Subject: ${subject}`;
    }

    return emailBody;
}

/**
 * Sends a reply to an email via Microsoft Graph
 */
async function sendReply(token, messageId, content, recipient) {
    const mailbox = process.env.MONITORED_MAILBOX;
    if (!mailbox) {
        throw new Error("Missing MONITORED_MAILBOX environment variable");
    }
    const url = `https://graph.microsoft.com/v1.0/users/${mailbox}/sendMail`;
    console.log("[REPLY] Sending to:", recipient, "| content length:", (content || "").length, "| via:", mailbox);

    const fetchOptions = {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: {
                subject: "Your request has been processed",
                body: {
                    contentType: "Text",
                    content: content || ""
                },
                toRecipients: [{ emailAddress: { address: recipient } }]
            },
            saveToSentItems: true
        })
    };

    let response;
    for (let attempt = 1; attempt <= 3; attempt++) {
        const response = await fetch(url, fetchOptions);
        
        // Success
        if (response.ok) {
            console.log("[REPLY] Sent successfully.");
            return; 
        }

        // Retry on 429 (Throttling) or 5xx (Server Error)
        if (response.status === 429 || (response.status >= 500 && response.status <= 599)) {
            const retryAfter = parseInt(response.headers.get('Retry-After') || '5', 10);
            console.warn(`[REPLY] Retrying (${attempt}/3) after ${retryAfter}s due to status ${response.status}`);
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            continue;
        }

        // Permanent failure (e.g., 400, 401, 403, 404)
        const errorText = await response.text();
        throw new Error(`Permanent Failure: ${response.status} - ${errorText}`);
    }
    throw new Error("Failed to send email after 3 attempts.");
}

module.exports = {
    createCredential,
    getGraphToken,
    fetchEmailFromGraph,
    extractEmailBody,
    sendReply
};
