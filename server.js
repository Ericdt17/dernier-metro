const express = require("express");
const app = express();
const TZ = "Europe/Paris";
const line = "M1"; // Ligne simulée

const swaggerUi = require("swagger-ui-express");

/**
 * Calcule le prochain passage simulé.
 * Règles:
 *  - Service ouvert: 05:30 → 01:15
 *  - Fréquence: 3 min
 *  - isLast: vrai entre 00:45 et 01:15
 *  - Hors plage: { service: "closed", tz }
 */
function nextArrival(now = new Date(), headwayMin = 3) {
  const tz = "Europe/Paris";
  const toHM = (d) =>
    String(d.getHours()).padStart(2, "0") +
    ":" +
    String(d.getMinutes()).padStart(2, "0");

  const m = now.getHours() * 60 + now.getMinutes(); // 0..1439
  const serviceOpen = m >= 330 || m <= 75; // 05:30–24:00 OR 00:00–01:15
  if (!serviceOpen) return { service: "closed", tz };

  const isLast = m >= 45 && m <= 75; // 00:45–01:15
  const next = new Date(now.getTime() + headwayMin * 60 * 1000);

  return { nextArrival: toHM(next), isLast, headwayMin, tz };
}

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} - ${duration}ms`);
  });
  next();
});


const swaggerDocument = {
  openapi: "3.0.0",
  info: {
    title: "Dernier Metro API",
    version: "1.0.0",
    description: "API pour le prochain passage simulé du métro",
  },
  servers: [{ url: "http://localhost:3000" }],
  paths: {
    "/health": {
      get: {
        summary: "Vérifie l'état du service",
        tags: ["system"],
        responses: {
          200: {
            description: "Service opérationnel",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/next-metro": {
      get: {
        summary: "Donne le prochain passage pour une station (simulation)",
        tags: ["metro"],
        parameters: [
          {
            name: "station",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "Nom de la station",
            example: "Chatelet",
          },
        ],
        responses: {
          200: {
            description: "Réponse avec l'horaire simulé ou service fermé",
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    {
                      type: "object",
                      properties: {
                        station: { type: "string" },
                        line: { type: "string", example: "M1" },
                        headwayMin: { type: "integer", example: 3 },
                        nextArrival: { type: "string", example: "12:34" },
                        isLast: { type: "boolean" },
                        tz: { type: "string", example: "Europe/Paris" },
                      },
                      required: [
                        "station",
                        "line",
                        "headwayMin",
                        "nextArrival",
                        "isLast",
                        "tz",
                      ],
                    },
                    {
                      type: "object",
                      properties: {
                        station: { type: "string" },
                        service: { type: "string", example: "closed" },
                        tz: { type: "string", example: "Europe/Paris" },
                      },
                      required: ["station", "service", "tz"],
                    },
                  ],
                },
              },
            },
          },
          400: {
            description: "Paramètre manquant",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string", example: "missing station" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

// Swagger UI and JSON spec endpoints
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.get("/api-docs.json", (req, res) => res.json(swaggerDocument));

// Route /health
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});
app.get("/next-metro", (req, res) => {
  const { station } = req.query;
  if (!station) {
    return res.status(400).json({ error: "missing station" });
  }
  const result = nextArrival(new Date(), 3);

  // Si service fermé, on renvoie un 200 documenté 
  if (result.service === "closed") {
    return res.json({ station, service: "closed", tz: TZ });
  }

  return res.json({
    station,
    line: "M1",
    headwayMin: result.headwayMin,
    nextArrival: result.nextArrival,
    isLast: result.isLast,
    tz: result.tz,
  });
});

// Catch-all 404
app.use((req, res) => {
  res.status(404).json({ error: "not found" });
});

// Démarrage du serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🚀 Serveur en ligne sur http://localhost:${PORT}`)
);
