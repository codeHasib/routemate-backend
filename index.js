const express = require("express");
const { MongoClient, ServerApiVersion } = require("mongodb");
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();

// middleware setup for authentication
const { jwtVerify, createRemoteJWKSet } = require("jose-cjs");

const JWKS_URL = `${process.env.NEXTJS_AUTH_JWKS_URL}/api/auth/jwks`;
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

    const { payload } = await jwtVerify(token, JWKS, { algorithms: ["RS256"] });

    // Attach everything to req.user (id, email, role)
    req.user = payload;
    next();
  } catch (error) {
    return res
      .status(403)
      .json({ success: false, message: "Token is invalid." });
  }
};
///////////////////////////////////

const app = express();
app.use(cors());
app.use(express.json());

const PORT = `${process.env.PORT}`;
const uri = process.env.DB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    await client.connect();
    const db = client.db("routemate");

    

  } finally {
  }
}
run().catch(console.dir);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
