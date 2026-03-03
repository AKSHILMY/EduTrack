// Load environment variables from .env file
require("dotenv").config();

const express = require("express");
const cors = require("cors");

// Import API routes
const faceApiRoutes = require("./routes/faceApi");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.use(express.json());

app.use("/api", faceApiRoutes);

// Start the Server
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Ready for production requests.`);
});
