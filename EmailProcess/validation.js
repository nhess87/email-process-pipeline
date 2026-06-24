/**
 * Validation module - handles Graph webhook validation tokens
 */

/**
 * Check if request contains a Graph validation token (query or body)
 * @param {Object} req - Azure Function request object
 * @returns {string|null} Validation token or null
 */
function getValidationToken( req) {
    return req.query?.validationToken || req.body?.validationToken || null;
}

/**
 * Build validation response for Graph
 * @param {string} token - Validation token
 * @returns {Object} Response object for Azure Function
 */
function buildValidationResponse(token) {
    return {
        status: 200,
        headers: { "Content-Type": "text/plain" },
        body: token
    };
}

/**
 * Validate notification structure
 * @param {Object} body - Request body
 * @returns {Object|null} Notification object or null if invalid
 */
function validateNotification(body) {
    if (!body || !body.value || body.value.length === 0) {
        return null;
    }
    return body.value[0];
}

/**
 * Extract and validate messageId from notification
 * @param {Object} notification - Graph notification object
 * @returns {string|null} Message ID or null if missing
 */
function extractMessageId(notification) {
    const messageId = notification?.resourceData?.id;
    return messageId || null;
}

module.exports = {
    getValidationToken,
    buildValidationResponse,
    validateNotification,
    extractMessageId
};
