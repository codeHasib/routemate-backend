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

// Database connection
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// middleware setup for authentication
const { jwtVerify, createRemoteJWKSet } = require("jose-cjs");
const JWKS_URL = `${process.env.NEXTJS_AUTH_JWKS_URL}`;
const JWKS = createRemoteJWKSet(new URL(JWKS_URL));

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "Access Token missing." });
    }

    // 1. Decrypt the token to identify the user
    const { payload } = await jwtVerify(token, JWKS);

    // Better-Auth uses the 'id' field as a string identifier
    const userId = payload.id || payload.sub;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User identifier missing from token.",
      });
    }
    const db = client.db("routemate");
    const dbUser = await db
      .collection("user")
      .findOne({ _id: new ObjectId(userId) });

    if (!dbUser) {
      try {
        const dbUserObj = await db
          .collection("user")
          .findOne({ _id: new ObjectId(userId) });
        if (dbUserObj) {
          req.user = {
            id: dbUserObj._id.toString(),
            name: dbUserObj.name,
            email: dbUserObj.email,
            role: dbUserObj.role || "user",
          };
          return next();
        }
      } catch (e) {}

      return res.status(404).json({
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

/////////////////////////////////

async function run() {
  try {
    // importing routes
    const publicTicketRoutes = require("./routes/publicTicketRoutes");
    const vendorTicketRoutes = require("./routes/vendorTicketRoutes");
    const bookingRoutes = require("./routes/bookingRoutes");
    const transactionRoutes = require("./routes/transactionRoutes");
    const adminRoutes = require("./routes/adminRoutes");
    const vendorRevenue = require("./routes/vendorRevenue");

    await client.connect();
    const db = client.db("routemate");

    app.use((req, res, next) => {
      req.db = db;
      next();
    });
    // Public route without middleware
    app.use("/api/public/tickets", publicTicketRoutes);

    // Protected routes with authentication
    app.use("/api/vendor", authenticateToken, vendorRevenue);
    app.use("/api/manage/tickets", authenticateToken, vendorTicketRoutes);
    app.use("/api/bookings", authenticateToken, bookingRoutes);
    app.use("/api/transactions", authenticateToken, transactionRoutes);
    app.use("/api/admin", authenticateToken, adminRoutes);
  } catch (error) {
    console.error("Database initialization crash:", error);
  }
}
run().catch(console.dir);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
