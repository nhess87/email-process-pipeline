# Install the packages

```npm install
```

# azure login in the CLI
```
az login
```

# Push the function to the azure function app:

```
func azure functionapp publish <azure-functionapp-name>
```
here:

```
func azure functionapp publish email-process-pipeline
```


# restart the server if needed

```
az functionapp restart --name  <azure-functionapp-name> --resource-group <azure-resource-group-for-your-functionapp>
```


Note: the name of the top directory should be the same as your azure function app

--------------
##This repo requires the following services on the azure setup and configured and their information needs to be store in "environment variables" under your "azure function app" setting:

## Environment Variables Referenced (by module)

| Variable               | Used in                          | Purpose                                  |
|------------------------|----------------------------------|------------------------------------------|
| GRAPH_TENANT_ID        | graphClient.js, SubscriptionMonitor | Azure AD tenant for auth               |
| GRAPH_CLIENT_ID        | graphClient.js, SubscriptionMonitor | Azure AD app registration ID           |
| GRAPH_CLIENT_SECRET    | graphClient.js, SubscriptionMonitor | Azure AD app secret                    |
| MONITORED_MAILBOX      | graphClient.js, emailProcessor.js   | The inbox being watched                |
| WEBHOOK_URL            | SubscriptionMonitor                 | Public URL of HttpTrigger1             |
| KEYVAULT_URL           | SubscriptionMonitor                 | Key Vault base URL                     |
| AzureWebJobsStorage    | function.json (Queue bindings)      | Storage account for the queue          |
| FOUNDRY_PROJECT_ENDPOINT       | foundryClient                       | Azure AI Foundry project URL           |
| FOUNDRY_WORKFLOW_NAME          | foundryClient                       | Azure AI Foundry workflow name         |
| FOUNDRY_WORKFLOW_VERSION       | foundryClient                       | Azure AI Foundry workflow version      |
