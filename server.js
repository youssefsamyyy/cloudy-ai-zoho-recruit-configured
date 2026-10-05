const express = require("express");
const path = require("path");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 8080;

// ============================================================
// Environment Variables
// ============================================================

const ZOHO_ACCOUNTS_URL =
  process.env.ZOHO_ACCOUNTS_URL || "https://accounts.zoho.com";

const ZOHO_RECRUIT_API_URL =
  process.env.ZOHO_RECRUIT_API_URL ||
  "https://www.zohoapis.com/recruit/v2";

const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID;
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const ZOHO_REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN;

const ZOHO_ORG_ID =
  process.env.ZOHO_ORG_ID || "907042345";

// ============================================================
// Startup Configuration Check
// ============================================================

if (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET || !ZOHO_REFRESH_TOKEN) {
  console.warn(
    "Warning: Zoho OAuth environment variables are not fully configured."
  );
}

// ============================================================
// Middleware
// ============================================================

app.use(express.json({ limit: "1mb" }));

app.use(express.static(path.join(__dirname, "public")));

// ============================================================
// File Upload Configuration
// ============================================================

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024
  }
});

// ============================================================
// Zoho OAuth Token Cache
// ============================================================

let cachedAccessToken = null;
let accessTokenExpiresAt = 0;

// ============================================================
// Get Zoho Access Token
// ============================================================

async function getZohoAccessToken() {
  if (
    cachedAccessToken &&
    Date.now() < accessTokenExpiresAt - 60_000
  ) {
    return cachedAccessToken;
  }

  if (
    !ZOHO_CLIENT_ID ||
    !ZOHO_CLIENT_SECRET ||
    !ZOHO_REFRESH_TOKEN
  ) {
    throw new Error(
      "Zoho OAuth environment variables are not configured."
    );
  }

  const params = new URLSearchParams({
    refresh_token: ZOHO_REFRESH_TOKEN,
    client_id: ZOHO_CLIENT_ID,
    client_secret: ZOHO_CLIENT_SECRET,
    grant_type: "refresh_token"
  });

  const response = await fetch(
    `${ZOHO_ACCOUNTS_URL}/oauth/v2/token?${params.toString()}`
  );

  const result = await response.json();

  if (!response.ok || !result.access_token) {
    console.error("Zoho token refresh failed:", result);

    throw new Error("Unable to refresh Zoho access token");
  }

  cachedAccessToken = result.access_token;

  accessTokenExpiresAt =
    Date.now() +
    Number(result.expires_in || 3600) * 1000;

  return cachedAccessToken;
}

// ============================================================
// Candidate Data Sanitization
// ============================================================

function sanitizeCandidate(input) {
  const allowed = [
    "First_Name",
    "Last_Name",
    "Email",
    "Mobile",
    "City",
    "Country",
    "Current_Employer",
    "Current_Job_Title",
    "LinkedIn__s",
    "Experience_in_Years",
    "Skill_Set",
    "Current_Salary",
    "Expected_Salary",
    "Additional_Info"
  ];

  const candidate = {};

  for (const key of allowed) {
    if (
      input[key] !== undefined &&
      input[key] !== null &&
      input[key] !== ""
    ) {
      candidate[key] = input[key];
    }
  }

  return candidate;
}

// ============================================================
// Health Check
// ============================================================

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "Cloudy AI Career Navigator",
    environment: process.env.NODE_ENV || "development",
    port: PORT,
    zohoOrgId: ZOHO_ORG_ID,
    zohoConfigured: Boolean(
      ZOHO_CLIENT_ID &&
      ZOHO_CLIENT_SECRET &&
      ZOHO_REFRESH_TOKEN
    )
  });
});

// ============================================================
// Create Candidate in Zoho Recruit
// ============================================================

app.post("/api/candidates", async (req, res) => {
  try {
    const candidate = sanitizeCandidate(req.body);

    if (
      !candidate.First_Name ||
      !candidate.Last_Name ||
      !candidate.Email
    ) {
      return res.status(400).json({
        success: false,
        error: "First name, last name, and email are required."
      });
    }

    const accessToken = await getZohoAccessToken();

    const response = await fetch(
      `${ZOHO_RECRUIT_API_URL}/Candidates`,
      {
        method: "POST",
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          data: [candidate]
        })
      }
    );

    const result = await response.json();

    console.log(
      "Zoho Recruit response:",
      JSON.stringify(result, null, 2)
    );

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        zoho: result
      });
    }

    const record = result?.data?.[0];

    const candidateId =
      record?.details?.id ||
      record?.details?.Id ||
      record?.id ||
      null;

    if (!candidateId) {
      return res.status(502).json({
        success: false,
        error:
          "Zoho accepted the request but did not return a candidate ID.",
        zoho: result
      });
    }

    return res.json({
      success: true,
      candidateId,
      zoho: result
    });
  } catch (error) {
    console.error(
      "Candidate creation error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error.message || "Internal server error"
    });
  }
});

// ============================================================
// Upload Candidate CV
// ============================================================

app.post(
  "/api/candidates/:candidateId/cv",
  upload.single("cv"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: "No CV file was uploaded."
        });
      }

      const candidateId = req.params.candidateId;

      const accessToken =
        await getZohoAccessToken();

      const form = new FormData();

      const blob = new Blob(
        [req.file.buffer],
        {
          type:
            req.file.mimetype ||
            "application/octet-stream"
        }
      );

      form.append(
        "id",
        candidateId
      );

      form.append(
        "content",
        blob,
        req.file.originalname
      );

      form.append(
        "type",
        "Resume"
      );

      const response = await fetch(
        "https://recruit.zoho.com/recruit/private/json/Candidates/uploadFile?version=2",
        {
          method: "POST",
          headers: {
            Authorization:
              `Zoho-oauthtoken ${accessToken}`
          },
          body: form
        }
      );

      const resultText =
        await response.text();

      if (!response.ok) {
        return res.status(response.status).json({
          success: false,
          error: "Zoho CV upload failed.",
          zoho: resultText
        });
      }

      let result;

      try {
        result = JSON.parse(resultText);
      } catch {
        result = {
          raw: resultText
        };
      }

      return res.json({
        success: true,
        candidateId,
        zoho: result
      });
    } catch (error) {
      console.error(
        "CV upload error:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          error.message ||
          "Internal server error"
      });
    }
  }
);

// ============================================================
// Express 5 Catch-All Route
// ============================================================

app.get("/{*splat}", (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  );
});

// ============================================================
// Start Server
// ============================================================

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Cloudy AI Career Navigator running on port ${PORT}`
    );
  }
);
