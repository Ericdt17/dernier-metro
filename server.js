const TZ = "Europe/Paris";
const swaggerUi = require("swagger-ui-express");

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toHM(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}
/**
 * Calcule le prochain passage simulé.
 * Règles:
 *  - Service ouvert: 05:30 → 01:15
 *  - Fréquence: 3 min
 *  - isLast: vrai entre 00:45 et 01:15
 *  - Hors plage: { service: "closed", tz }
 */
function nextArrival(now = new Date(), headwayMin = 3) {
  const start = new Date(now);
  start.setHours(5, 30, 0, 0); // 05:30
  const lastWindow = new Date(now);
  lastWindow.setHours(0, 45, 0, 0); // 00:45
  const end = new Date(now);
  end.setHours(1, 15, 0, 0); // 01:15

  // Hors plage horaire (avant 05:30 ou après 01:15)
  if (now < start || now > end) {
    return { service: "closed", tz: TZ };
  }

  const next = new Date(now.getTime() + headwayMin * 60 * 1000);

  return {
    headwayMin,
    nextArrival: toHM(next),
    isLast: now >= lastWindow && now <= end,
    tz: TZ,
  };
}

const express = require("express");

const app = express();
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// OpenAPI (Swagger) spec
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

  // Si service fermé, on renvoie un 200 documenté (option choisie)
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
