const { ClientSecretCredential } = require("@azure/identity");
const { SecretClient } = require("@azure/keyvault-secrets");

const GRAPH_SCOPE = "https://graph.microsoft.com/.default";

// Ensure required environment variables exist
const validateEnv = () => {
    const required = ["GRAPH_TENANT_ID", "GRAPH_CLIENT_ID", "GRAPH_CLIENT_SECRET", "KEYVAULT_URL"];
    for (const key of required) {
        if (!process.env[key]) throw new Error(`Missing environment variable: ${key}`);
    }
};

module.exports = async function (context, myTimer) {
    context.log("🔄 Subscription monitor started");

    try {
        validateEnv();
        
        const credential = new ClientSecretCredential(
            process.env.GRAPH_TENANT_ID,
            process.env.GRAPH_CLIENT_ID,
            process.env.GRAPH_CLIENT_SECRET
        );

        const { token } = await credential.getToken("https://graph.microsoft.com/.default");
        const keyVaultClient = new SecretClient(process.env.KEYVAULT_URL, credential);

        // 1. Fetch Subscription ID
        let subscriptionId;
        try {
            const secret = await keyVaultClient.getSecret("graph-subscription-id");
            subscriptionId = secret.value;
        } catch (err) {
            context.log.warn("No subscription found in Key Vault, proceeding to create new.");
        }

        // 2. Validate/Renew Logic
        if (subscriptionId) {
            await handleExistingSubscription(context, subscriptionId, token, keyVaultClient);
        } else {
            await deleteAllSubscriptions(token); // Clean up any stray subscriptions
            try{
                await createSubscription(context, token, keyVaultClient);
            } catch (err) {
                context.log.error("Failed to create subscription:", err.message);
            }
            
        }

    } catch (error) {
        context.log.error("❌ Critical error in subscription monitor:", error.message);
        throw error; 
};
}

async function handleExistingSubscription(context, id, token, kvClient) {
    try {
        const response = await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            context.log.warn("Subscription invalid/not found in Graph. Recreating.");
            await deleteAllSubscriptions(token); // Clean up any stray subscriptions
            try{
                return await createSubscription(context, token, kvClient);
            } catch (err) {
                context.log.error("Failed to create subscription:", err.message);
            }
        }

        const sub = await response.json();
        const now = new Date();
        const expiry = new Date(sub.expirationDateTime);

        // Check if expired
        if (expiry <= now) {
            context.log.info("Subscription expired. Recreating.");
            await deleteAllSubscriptions(token); // Clean up any stray subscriptions
            try {
                return await createSubscription(context, token, kvClient);
            } catch (err) {
                context.log.error("Failed to create subscription:", err.message);
            }
        }

        // Check if expiring within 24 hours
        const hoursUntilExpiry = (expiry - now) / (1000 * 60 * 60);
        if (hoursUntilExpiry < 24) {
            await renewSubscription(context, id, token);
        } else {
            context.log("✅ Subscription healthy.");
        }
    } catch (err) {
        context.log.error("Failed to check subscription status:", err.message);
    }
}

async function renewSubscription(context, id, token) {
    const newExpiry = new Date(Date.now() + 4230 * 60 * 1000);
    const response = await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${id}`, {
        method: "PATCH",
        headers: { 
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ expirationDateTime: newExpiry.toISOString() })
    });

    if (!response.ok) throw new Error(`Renew failed: ${await response.text()}`);
    context.log("✅ Subscription successfully renewed.");
}

async function createSubscription(context, token, keyVaultClient) {
    // 1. Validate required environment variables before calling Graph
    if (!process.env.WEBHOOK_URL || !process.env.MONITORED_MAILBOX) {
        throw new Error("Missing configuration: WEBHOOK_URL or MONITORED_MAILBOX.");
    }

    // 2. Calculate expiry
    const expiry = new Date(Date.now() + 4230 * 60 * 1000);

    // 3. Construct payload object cleanly
    const payload = {
        changeType: "created",
        notificationUrl: process.env.WEBHOOK_URL,
        resource: `users/${process.env.MONITORED_MAILBOX}/messages`,
        expirationDateTime: expiry.toISOString(),
        clientState: "secure-state"
    };

    try {
        const response = await fetch("https://graph.microsoft.com/v1.0/subscriptions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        // 4. Handle response
        const data = await response.json();

        if (!response.ok) {
            // Throwing detailed error for the catch block
            throw new Error(`Graph API returned ${response.status}: ${JSON.stringify(data.error || data)}`);
        }

        // 5. Save to Key Vault
        await keyVaultClient.setSecret("graph-subscription-id", data.id);
        
        context.log(`✅ Subscription created successfully: ${data.id}`);

    } catch (error) {
        context.log.error("❌ Failed to create subscription:", error.message);
        throw error; // Re-throw to allow caller to handle/retry
    }
}

async function deleteAllSubscriptions(token) {
    const list = await fetch("https://graph.microsoft.com/v1.0/subscriptions", {
        headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.json());

    if (list.value) {
        for (const sub of list.value) {
            await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${sub.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            });
        }
    }
}
