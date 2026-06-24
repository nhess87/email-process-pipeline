const { AIProjectClient } = require("@azure/ai-projects");
const { DefaultAzureCredential } = require("@azure/identity");


// Load Foundry information from environment variables
const PROJECT_ENDPOINT = process.env.FOUNDRY_PROJECT_ENDPOINT;
const WORKFLOW_NAME = process.env.FOUNDRY_WORKFLOW_NAME;
const WORKFLOW_VERSION = process.env.FOUNDRY_WORKFLOW_VERSION;

async function callWorkflow(userInput) {
    console.log("[FOUNDRY] Calling Foundry workflow:", WORKFLOW_NAME, "version:", WORKFLOW_VERSION, "Foundry endpoint:", PROJECT_ENDPOINT);
    const projectClient = new AIProjectClient(
        PROJECT_ENDPOINT,
        new DefaultAzureCredential()
    );

    const openai = projectClient.getOpenAIClient();

    const conversation = await openai.conversations.create();
    console.log(`Conversation created: ${conversation.id}`);

    let responseDone = false;
    let fullResponse = "";
    const allMessages = [];

    try {
        const stream = await openai.responses.create({
            conversation: conversation.id,
            input: userInput,
            stream: true,
            metadata: {
                "x-ms-debug-mode-enabled": "1"
            },
            agent_reference: {
                name: WORKFLOW_NAME,
                version: WORKFLOW_VERSION,
                type: "agent_reference"
            }
        });

        for await (const event of stream) {
            if (event.type === "response.output_text.delta") {
                fullResponse += event.delta;
            } else if (event.type === "response.output_text.done") {
                if (fullResponse.trim()) {
                    allMessages.push(fullResponse.trim());
                }
                fullResponse = "";
                responseDone = true;
            }
        }

        if (allMessages.length > 0) {
            const lastMessage = allMessages[allMessages.length - 1];
            try {
                const data = JSON.parse(lastMessage);
                return data.response !== undefined ? data.response : lastMessage;
            } catch {
                return lastMessage;
            }
        }

        return "No response received.";

    } finally {
        try {
            if (responseDone) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                await openai.conversations.delete(conversation.id);
                console.log(`Deleted conversation: ${conversation.id}`);
            } else {
                console.log("Skipping delete: response not fully completed");
            }
        } catch (e) {
            console.log(`Cleanup error ignored: ${e}`);
        }
    }
}

module.exports = { callWorkflow };
