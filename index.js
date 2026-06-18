const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const uri = process.env.DB_URI;

// 1. Database connection setup
// (The MongoDB driver natively handles lazy connection pooling on-demand)
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
const db = client.db("routemate");

// Middleware to inject the live DB context into requests
app.use((req, res, next) => {
  req.db = db;
  next();
});

// 2. Middleware setup for authentication
const { jwtVerify, createRemoteJWKSet } = require("jose-cjs");
const JWKS_URL = `${process.env.NEXTJS_AUTH_JWKS_URL}`;
let JWKS;

if (JWKS_URL && JWKS_URL !== "undefined") {
  JWKS = createRemoteJWKSet(new URL(JWKS_URL));
}

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "Access Token missing." });
    }

    if (!JWKS) {
      JWKS = createRemoteJWKSet(new URL(process.env.NEXTJS_AUTH_JWKS_URL));
    }

    const { payload } = await jwtVerify(token, JWKS);
    const userId = payload.id || payload.sub;

    if (!userId) {
      return res
        .status(401)
        .json({
          success: false,
          message: "User identifier missing from token.",
        });
    }

    const currentDb = req.db;
    const dbUser = await currentDb
      .collection("user")
      .findOne({ _id: new ObjectId(userId) });

    if (!dbUser) {
      return res
        .status(404)
        .json({
          success: false,
          message: "User profile not found in database.",
        });
    }

    req.user = {
      id: dbUser._id.toString(),
      name: dbUser.name,
      email: dbUser.email,
      role: dbUser.role || "user",
    };
    next();
  } catch (error) {
    console.error("Authentication Error:", error.message);
    return res
      .status(403)
      .json({ success: false, message: "Token is invalid." });
  }
};

// 3. Import routes synchronously
const publicTicketRoutes = require("./routes/publicTicketRoutes");
const vendorTicketRoutes = require("./routes/vendorTicketRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const transactionRoutes = require("./routes/transactionRoutes");
const adminRoutes = require("./routes/adminRoutes");
const vendorRevenue = require("./routes/vendorRevenue");

// 4. Register Routes (Must be synchronous for Vercel to map them immediately)
app.use("/api/public/tickets", publicTicketRoutes);
app.use("/api/vendor", authenticateToken, vendorRevenue);
app.use("/api/manage/tickets", authenticateToken, vendorTicketRoutes);
app.use("/api/bookings", authenticateToken, bookingRoutes);
app.use("/api/transactions", authenticateToken, transactionRoutes);
app.use("/api/admin", authenticateToken, adminRoutes);

// Optional: Base landing endpoint to verify deployment success
app.get("/", (req, res) => {
  res.json({ message: "RouteMate API Engine is online." });
});

// 5. Fire up local listener ONLY if not running inside production serverless environments
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`Server is running locally on port ${PORT}`);
  });
}

// ==========================================================================
// CRITICAL FOR VERCEL DEPLOYMENT: Export the app instance
// ==========================================================================
module.exports = app;