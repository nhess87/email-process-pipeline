# Flow:

Incoming Request
        │
        ▼
 ┌──────────────────┐
 │  Categorization   │
 │      Agent        │
 └──────────────────┘
        │
        ▼
 ┌───────────────────────────────┐
 │   Is category = "Billing"?     │
 └───────────────────────────────┘
        │                 │
     Yes│                 │No
        ▼                 ▼
┌────────────────┐   ┌──────────────────────────┐
│ Send to Human  │   │  Knowledge‑Base Agent     │
│ (Human Support)│   │  (Generate Resolution)    │
└────────────────┘   └──────────────────────────┘
                            │
                            ▼
                   Final Response Out



## First agent prompt/instruction:


## **Prompt **

**Classify the user's problem description into exactly ONE category from the list below. Provide a confidence score from 0 to 1.**

### **Billing**  
- Charges, refunds, duplicate payments  
- Missing or incorrect payouts  
- Subscription pricing or invoices being charged  

### **Technical**  
- API errors, integrations, webhooks  
- Platform bugs or unexpected behavior  

### **General**  
- How‑to questions  
- Feature availability  
- Data exports, reports, or UI navigation  

### **IT Support**  
- Account access issues  
- Device, network, or system problems  
- Password resets, VPN, SSO, or internal tool access  

### **Legal**  
- Contract questions  
- Terms of service, compliance, or data‑handling concerns  
- Requests requiring legal review or approval  

### **HR / People Operations**  
- Employment verification  
- Policy questions  
- Benefits, PTO, onboarding/offboarding  

### **Other**  
- Anything that does not fit into the categories above  

## **Important Rules**  
- Questions about exporting, viewing, or downloading invoices are **General**, not Billing  
- Billing ONLY applies when money was charged, refunded, or paid incorrectly  
- IT Support applies only to internal systems, access, or device issues  
- Legal applies only when the user explicitly references contracts, compliance, or legal review  


-----------------------------
### schema output:
{
  "name": "category_response",
  "schema": {
    "type": "object",
    "properties": {
      "customer_issue": {
        "type": "string",
        "description": "Original user request or problem description"
      },
      "category": {
        "type": "string",
        "description": "Final assigned category for routing"
      },
      "confidence": {
        "type": "number",
        "minimum": 0,
        "maximum": 1,
        "description": "Classifier confidence score"
      }
    },
    "required": [
      "customer_issue",
      "category",
      "confidence"
    ],
    "additionalProperties": false
  },
  "strict": true
}


## Second agent prompt/instruction:

Escalate billing issue to human support team.