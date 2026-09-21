# Cloudy AI Career Navigator → Zoho Recruit

This project removes the HR Preview panel from the original Cloudy AI Career Navigator and connects candidate submissions to Zoho Recruit.

## Structure

```text
cloudy-ai-zoho-recruit/
├── public/
│   └── index.html
├── server.js
├── package.json
├── .env.example
├── Dockerfile
├── .dockerignore
└── README.md
```

## Data flow

```text
Candidate Browser
      |
      | POST /api/candidates
      v
Node.js / Express
      |
      | OAuth refresh token -> access token
      v
Zoho Recruit
      |
      | Candidate ID
      v
Node.js
      |
      | POST /api/candidates/:id/cv
      v
Zoho Recruit Candidate Attachment
```

## Candidate field mapping

The frontend sends these Zoho Recruit API field names:

| Cloudy answer | Zoho field |
|---|---|
| Full name | First_Name + Last_Name |
| Email | Email |
| Mobile | Mobile |
| City | City |
| Country | Country |
| Current company | Current_Employer |
| Current title | Current_Job_Title |
| LinkedIn | LinkedIn__s |
| Experience | Experience_in_Years |
| Skills | Skill_Set |
| Current salary | Current_Salary |
| Expected salary | Expected_Salary |
| Other application answers | Additional_Info |

`Current_Job_Title` and `Source` are picklists in the supplied field list, so the implementation does not send arbitrary values to those fields.

## Local setup

1. Install Node.js 20+.
2. Copy `.env.example` to `.env`.
3. Put your Zoho Client ID, Client Secret and Refresh Token in `.env`.
4. Run:

```bash
npm install
npm start
```

5. Open:

```text
http://localhost:8080
```

6. Health check:

```text
http://localhost:8080/api/health
```

## Zoho OAuth

Create a Zoho OAuth client and generate an offline refresh token with permission to create candidate records.

For production, keep the refresh token, client secret and client ID in Cloud Run environment variables or Secret Manager. Do not place them in `public/index.html`.

## Cloud Run deployment

Example:

```bash
gcloud run deploy cloudy-ai-zoho-recruit \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars ZOHO_ORG_ID=907042345 \
  --set-env-vars ZOHO_ACCOUNTS_URL=https://accounts.zoho.com \
  --set-env-vars ZOHO_RECRUIT_API_URL=https://recruit.zoho.com/recruit/v2
```

For secrets, use Secret Manager rather than putting the actual values in shell history or source code.

## Important

The CV upload uses a separate Zoho Recruit attachment endpoint after the candidate record is created. If the candidate record is created but the CV upload fails, the candidate remains saved and the backend logs the upload failure.

The original frontend simulated CV upload progress. The new version sends the actual selected CV file to the backend.

## Production hardening

Before going live, add:

- CAPTCHA / bot protection
- rate limiting
- server-side validation
- CORS/origin restrictions if frontend and backend are on different domains
- Secret Manager
- request logging without sensitive candidate data
- privacy/consent notice
- duplicate handling using Zoho Recruit upsert if required
- a configured Zoho picklist value for candidate source if you want to populate Source
